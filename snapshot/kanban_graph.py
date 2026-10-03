#!/usr/bin/env python3
"""Render Hermes kanban boards as one self-contained, zoomable, clickable HTML graph.

Read-only: opens every board DB with mode=ro and writes a single HTML file. Stdlib only, no
Hermes import, so it runs with any Python 3.10+. The data comes from the plugin's own
dashboard/graph_model.py and the layout from desktop/plugin.js, so the snapshot and the live page
can never disagree. Icons are Tabler, vendored from Iconify in tabler-icons.json.
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGE_DIR = HERE.parent
TEMPLATE = HERE / "template.html"
ICONS = HERE / "tabler-icons.json"
PLUGIN_JS = PACKAGE_DIR / "desktop" / "plugin.js"
GRAPH_MODEL = PACKAGE_DIR / "dashboard" / "graph_model.py"
LAYOUT_START, LAYOUT_END = "// kg:layout-start", "// kg:layout-end"
NODE_W, NODE_H = 240, 58


def _load_graph_model():
    spec = importlib.util.spec_from_file_location("kanban_graph_model", GRAPH_MODEL)
    if spec is None or spec.loader is None:
        raise SystemExit(f"graph model not found at {GRAPH_MODEL}; run this script from the plugin checkout")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


gm = _load_graph_model()


def hermes_root() -> Path:
    """The default Hermes root. Boards and profiles hang off it even when HERMES_HOME points at a
    profile (<root>/profiles/<name>), the same rule Hermes uses for shared kanban state."""
    override = os.environ.get("HERMES_KANBAN_HOME", "").strip()
    if override:
        return Path(override).expanduser()
    home = Path(os.environ.get("HERMES_HOME", "").strip() or "~/.hermes").expanduser()
    return home.parent.parent if home.parent.name == "profiles" else home


def discover_boards(root: Path, include_archived_boards: bool) -> list:
    """Every board with a DB. 'default' keeps its legacy DB at <root>/kanban.db; _-prefixed
    directories (e.g. _archived) are skipped."""
    boards = []
    legacy = root / "kanban.db"
    if legacy.exists():
        boards.append(gm.Board(slug="default", name="Default", db=legacy))
    boards_dir = root / "kanban" / "boards"
    if boards_dir.is_dir():
        for d in sorted(boards_dir.iterdir()):
            db = d / "kanban.db"
            if d.name.startswith("_") or not db.exists():
                continue
            meta = {}
            if (d / "board.json").exists():
                try:
                    meta = json.loads((d / "board.json").read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    meta = {}
            if meta.get("archived") and not include_archived_boards:
                continue
            boards.append(gm.Board(slug=d.name, name=meta.get("name") or d.name, db=db))
    return boards


def layout_js() -> str:
    """The live page's layout block, pasted into the template so both views arrange tasks the
    same way."""
    src = PLUGIN_JS.read_text(encoding="utf-8")
    try:
        start = src.index(LAYOUT_START)
        end = src.index(LAYOUT_END, start)
    except ValueError as exc:
        raise SystemExit(f"layout markers {LAYOUT_START!r} / {LAYOUT_END!r} not found in {PLUGIN_JS}") from exc
    return src[start:end]


def _split(values: list[str]) -> set[str]:
    return {s.strip() for v in values for s in v.split(",") if s.strip()}


def main() -> int:
    ap = argparse.ArgumentParser(description="Render Hermes kanban boards as one self-contained HTML graph.")
    ap.add_argument("--board", action="append", default=[], help="board slug (repeatable); default: all")
    ap.add_argument("--archived", action="store_true", help="include archived tasks")
    ap.add_argument("--archived-boards", action="store_true", help="include boards marked archived")
    ap.add_argument("--hide-status", action="append", default=[], metavar="STATUS",
                    help="drop tasks in this status (repeatable, or comma-separated), e.g. done")
    ap.add_argument("--focus-status", action="append", default=[], metavar="STATUS",
                    help="keep only tasks in this status plus their transitive parents and children, e.g. running")
    ap.add_argument("--out", help="output HTML path (default: <root>/cache/kanban-graph/<name>.html)")
    ap.add_argument("--list", action="store_true", help="list board slugs and exit")
    args = ap.parse_args()

    root = hermes_root()
    boards = discover_boards(root, args.archived_boards)
    if not boards:
        print(f"no kanban boards under {root / 'kanban' / 'boards'} (set HERMES_HOME?)", file=sys.stderr)
        return 1
    if args.list:
        for b in boards:
            print(f"{b.slug}\t{b.name}\t{b.db}")
        return 0
    if args.board:
        known = {b.slug: b for b in boards}
        missing = [s for s in args.board if s not in known]
        if missing:
            print(f"unknown board(s): {', '.join(missing)}; known: {', '.join(known)}", file=sys.stderr)
            return 2
        boards = [known[s] for s in args.board]
    name = boards[0].slug if len(boards) == 1 else "all-boards"
    title = boards[0].name if len(boards) == 1 else "All kanban boards"

    hide, focus = _split(args.hide_status), _split(args.focus_status)
    if focus:
        name += "-" + "-".join(sorted(focus))
        title += f" ({', '.join(sorted(focus))} + lineage)"
    data = gm.build(boards, root=root, include_archived=args.archived, hide=hide, focus=focus)
    data.update(title=title, node=[NODE_W, NODE_H])

    icons = json.loads(ICONS.read_text(encoding="utf-8"))["icons"]
    payload = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    icon_json = json.dumps({k: v["body"] for k, v in icons.items()}, separators=(",", ":")).replace("</", "<\\/")
    page = (TEMPLATE.read_text(encoding="utf-8")
            .replace("__TITLE__", html.escape(title))
            .replace("__DATA__", payload)
            .replace("__ICONS__", icon_json)
            .replace("/*__LAYOUT__*/", layout_js()))

    out = Path(args.out).expanduser() if args.out else root / "cache" / "kanban-graph" / f"{name}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(page, encoding="utf-8")
    tmp.replace(out)
    print(f"{out}\tboards={len(data['boards'])} tasks={len(data['tasks'])} links={len(data['links'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
