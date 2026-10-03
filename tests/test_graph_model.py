"""Backend model tests on a throwaway kanban DB. Stdlib only:
python3 -m unittest discover -s tests -v"""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


gm = _load("kg_graph_model", ROOT / "dashboard" / "graph_model.py")

SCHEMA = """
create table tasks (id text primary key, title text, body text, assignee text, status text,
  priority int, created_at int, started_at int, completed_at int, result text,
  model_override text, current_run_id int, last_heartbeat_at int);
create table task_links (parent_id text, child_id text);
create table task_events (id integer primary key, task_id text, run_id int, kind text, created_at int);
create table task_runs (id integer primary key, task_id text, profile text, status text, outcome text,
  started_at int, ended_at int, last_heartbeat_at int, error text, summary text);
"""

# a -> b -> c, a -> c (implied), d alone; c is done, e archived
TASKS = [("a", "todo"), ("b", "running"), ("c", "done"), ("d", "blocked"), ("e", "archived")]
LINKS = [("a", "b"), ("b", "c"), ("a", "c"), ("c", "e")]


def make_board(tmp: Path, slug: str = "demo"):
    db = tmp / slug / "kanban.db"
    db.parent.mkdir(parents=True)
    con = sqlite3.connect(db)
    con.executescript(SCHEMA)
    for i, (tid, status) in enumerate(TASKS):
        con.execute("insert into tasks (id, title, status, created_at, current_run_id) values (?,?,?,?,?)",
                    (tid, f"Task {tid}", status, 1000 + i, 1 if tid == "b" else None))
    con.executemany("insert into task_links values (?,?)", LINKS)
    con.execute("insert into task_runs (id, task_id, profile, status, started_at) values (1,'b','default','running',1500)")
    con.execute("insert into task_events (task_id, kind, created_at) values ('b','claimed',1500)")
    con.commit()
    con.close()
    return gm.Board(slug=slug, name="Demo", db=db)


class GraphModelTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.board = make_board(self.tmp)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def build(self, **kw):
        return gm.build([self.board], root=self.tmp, **kw)

    def test_archived_hidden_by_default(self) -> None:
        g = self.build()
        self.assertEqual({t["id"] for t in g["tasks"]}, {"a", "b", "c", "d"})
        self.assertEqual(g["hidden"], ["archived"])
        self.assertNotIn(["demo/c", "demo/e"], g["links"])

    def test_hide_counts_links_to_hidden_tasks(self) -> None:
        g = self.build(hide={"done"})
        ids = {t["id"]: t for t in g["tasks"]}
        self.assertNotIn("c", ids)
        self.assertEqual(ids["a"]["hx"], {"p": 0, "c": 1})
        self.assertEqual(g["links"], [["demo/a", "demo/b"]])

    def test_focus_keeps_lineage(self) -> None:
        g = self.build(focus={"running"})
        self.assertEqual({t["id"] for t in g["tasks"]}, {"a", "b", "c"})
        self.assertEqual(g["focus"], ["running"])

    def test_node_keys_and_runs(self) -> None:
        b = next(t for t in self.build()["tasks"] if t["id"] == "b")
        self.assertEqual(b["k"], "demo/b")
        self.assertEqual([r["id"] for r in b["runs"]], [1])
        self.assertIsNone(b["live"])  # no state.db under the temp root

    def test_db_opened_read_only(self) -> None:
        con = gm.ro_connect(self.board.db)
        try:
            with self.assertRaises(sqlite3.OperationalError):
                con.execute("insert into task_links values ('x','y')")
        finally:
            con.close()

    def test_latest_event_id(self) -> None:
        self.assertEqual(gm.latest_event_id(self.board.db), 1)

    def test_lineage(self) -> None:
        self.assertEqual(gm.lineage({"b"}, LINKS), {"a", "b", "c", "e"})


if __name__ == "__main__":
    unittest.main()
