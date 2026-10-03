#!/usr/bin/env python3
"""Turn a real /graph JSON dump into a test fixture with the same shape and no content.

Keeps the topology (boards, tasks, links, statuses, run counts) and replaces every name, title,
id, body, assignee, model and timestamp, so a dump from a private install can become a public
regression fixture. Stdlib only.

Get a dump from a running Hermes backend, for example:
  curl -s "http://127.0.0.1:<port>/api/plugins/kanban-graph/graph" > graph.json
Usage: anonymize_fixture.py <graph.json> <out.json>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    g = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    slug = {b["slug"]: f"board-{i + 1}" for i, b in enumerate(g["boards"])}
    key: dict[str, str] = {}
    tasks = []
    for i, t in enumerate(g["tasks"]):
        b = slug[t["b"]]
        tid = f"t_{i + 1:04d}"
        key[t["k"]] = f"{b}/{tid}"
        tasks.append({
            "k": key[t["k"]], "id": tid, "b": b, "t": f"Task {i + 1}", "s": t["s"], "a": "", "p": 0,
            "m": "", "e": "", "bk": "", "f": 0, "c": i, "st": None, "d": None, "body": "", "res": "",
            "err": "", "hb": None, "mx": None, "hx": t.get("hx"),
            "runs": [{"id": j, "pr": "", "s": r["s"], "o": r["o"], "a": 0, "z": None, "hb": None, "e": ""}
                     for j, r in enumerate(t.get("runs", []))],
            "live": None,
        })
    out = {
        "generated": 0, "statuses": g["statuses"], "hidden": g["hidden"], "focus": g.get("focus", []),
        "boards": [{"slug": slug[b["slug"]], "name": f"Board {i + 1}", "counts": b["counts"], "n": b["n"]}
                   for i, b in enumerate(g["boards"])],
        "tasks": tasks,
        "links": [[key[p], key[c]] for p, c in g["links"] if p in key and c in key],
    }
    Path(sys.argv[2]).write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{sys.argv[2]}  boards={len(out['boards'])} tasks={len(tasks)} links={len(out['links'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
