#!/usr/bin/env python3
"""Create a throwaway Hermes home with two demo kanban boards, for screenshots and the tutorial.

Only the tables and columns the plugin reads are created; real Hermes boards have more. Stdlib only.
Usage: demo_home.py <dir>      then: HERMES_HOME=<dir> python3 snapshot/kanban_graph.py
"""

from __future__ import annotations

import json
import sqlite3
import sys
import time
from pathlib import Path

SCHEMA = """
create table tasks (id text primary key, title text, body text, assignee text, status text,
  priority int, created_at int, started_at int, completed_at int, result text, model_override text,
  block_kind text, consecutive_failures int, current_run_id int, last_heartbeat_at int);
create table task_links (parent_id text, child_id text);
create table task_events (id integer primary key, task_id text, run_id int, kind text, created_at int);
create table task_runs (id integer primary key, task_id text, profile text, status text, outcome text,
  started_at int, ended_at int, last_heartbeat_at int, error text, summary text);
"""

# id, title, status, assignee, parents
BOARDS = {
    "website-relaunch": ("Website relaunch", [
        ("t_spec", "Write the relaunch spec", "done", "writer", []),
        ("t_design", "Design system tokens", "done", "designer", ["t_spec"]),
        ("t_content", "Migrate blog content", "running", "migrator", ["t_spec"]),
        ("t_pages", "Build landing pages", "running", "frontend", ["t_design"]),
        ("t_seo", "SEO redirects map", "todo", "writer", ["t_content"]),
        ("t_a11y", "Accessibility audit", "blocked", "auditor", ["t_pages", "t_spec"]),
        ("t_qa", "Cross-browser QA", "todo", "verifier", ["t_pages", "t_seo"]),
        ("t_launch", "Launch and monitor", "scheduled", "ops", ["t_qa", "t_a11y", "t_pages"]),
    ]),
    "platform": ("Platform upgrade", [
        ("t_inv", "Inventory services", "done", "ops", []),
        ("t_db", "Upgrade database", "review", "dba", ["t_inv"]),
        ("t_api", "Port API to new runtime", "ready", "backend", ["t_inv"]),
        ("t_load", "Load test", "todo", "verifier", ["t_db", "t_api", "t_inv"]),
        ("t_doc", "Write the runbook", "triage", "writer", []),
    ]),
}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    home = Path(sys.argv[1]).expanduser()
    now = int(time.time())
    for slug, (name, tasks) in BOARDS.items():
        d = home / "kanban" / "boards" / slug
        d.mkdir(parents=True, exist_ok=False)
        (d / "board.json").write_text(json.dumps({"name": name}) + "\n", encoding="utf-8")
        con = sqlite3.connect(d / "kanban.db")
        con.executescript(SCHEMA)
        run_id = 0
        for i, (tid, title, status, who, parents) in enumerate(tasks):
            cur = None
            if status == "running":
                run_id += 1
                cur = run_id
                con.execute("insert into task_runs (id, task_id, profile, status, started_at, last_heartbeat_at) "
                            "values (?,?,?,?,?,?)", (run_id, tid, who, "running", now - 600 * (i + 1), now - 30))
            con.execute("insert into tasks (id, title, assignee, status, priority, created_at, model_override, "
                        "block_kind, consecutive_failures, current_run_id) values (?,?,?,?,?,?,?,?,?,?)",
                        (tid, title, who, status, 0, now - 86400 + i * 60, "sonnet-5",
                         "needs_input" if status == "blocked" else None, 0, cur))
            con.executemany("insert into task_links values (?,?)", [(p, tid) for p in parents])
            con.execute("insert into task_events (task_id, kind, created_at) values (?,?,?)", (tid, "created", now))
        con.commit()
        con.close()
    print(f"{home}  boards={len(BOARDS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
