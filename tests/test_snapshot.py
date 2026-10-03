"""Snapshot CLI test: renders the fixture board to HTML with no Hermes install."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_graph_model import make_board

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "snapshot" / "kanban_graph.py"


class SnapshotTest(unittest.TestCase):
    def test_renders_fixture_board(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            make_board(home / "kanban" / "boards", "demo")
            out = home / "out.html"
            env = {**os.environ, "HERMES_HOME": str(home)}
            env.pop("HERMES_KANBAN_HOME", None)
            res = subprocess.run([sys.executable, str(CLI), "--board", "demo", "--out", str(out)],
                                 env=env, capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn("boards=1 tasks=4 links=3", res.stdout)
            page = out.read_text(encoding="utf-8")
            self.assertIn("function kgLayout", page)
            self.assertNotIn("__DATA__", page)
            self.assertNotIn("/*__LAYOUT__*/", page)

    def test_profile_home_resolves_to_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_board(root / "kanban" / "boards", "demo")
            (root / "profiles" / "worker").mkdir(parents=True)
            env = {**os.environ, "HERMES_HOME": str(root / "profiles" / "worker")}
            env.pop("HERMES_KANBAN_HOME", None)
            res = subprocess.run([sys.executable, str(CLI), "--list"], env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertTrue(res.stdout.startswith("demo\t"))

    def test_unknown_board_exits_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            make_board(Path(tmp) / "kanban" / "boards", "demo")
            env = {**os.environ, "HERMES_HOME": tmp}
            env.pop("HERMES_KANBAN_HOME", None)
            res = subprocess.run([sys.executable, str(CLI), "--board", "nope"], env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 2)
            self.assertIn("unknown board", res.stderr)

    def test_no_boards_exits_1(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, "HERMES_HOME": tmp}
            env.pop("HERMES_KANBAN_HOME", None)
            res = subprocess.run([sys.executable, str(CLI)], env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 1)
            self.assertIn("no kanban boards", res.stderr)
            self.assertFalse((Path(tmp) / "cache").exists())


if __name__ == "__main__":
    unittest.main()
