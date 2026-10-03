"""kanban-graph backend, mounted at /api/plugins/kanban-graph/.

GET /boards lists boards, GET /graph returns the laid-out dependency graph across one, several or all
boards (with run history and the live worker session for running tasks), and the /events WebSocket
tails task_events on every board at once so the page needs one socket instead of one per board.
Read-only throughout: every DB is opened with mode=ro.
"""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status as http_status

from hermes_cli import kanban_db
from hermes_constants import get_default_hermes_root

log = logging.getLogger(__name__)
router = APIRouter()


def _load_model():
    # The dashboard imports this file by path, so its sibling is not on sys.path.
    name = "hermes_dashboard_plugin_kanban_graph_model"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("graph_model.py"))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


gm = _load_model()

EVENT_POLL_SECONDS = 0.5
EVENTS_PER_FRAME = 200
# Idle sockets get a ping this often so the page can tell "quiet board" from "dead socket".
KEEPALIVE_SECONDS = 15


def _boards(include_archived_boards: bool = False) -> list:
    out = []
    for meta in kanban_db.list_boards(include_archived=include_archived_boards):
        db = Path(kanban_db.kanban_db_path(meta["slug"]))
        if db.exists():
            out.append(gm.Board(slug=meta["slug"], name=meta.get("name") or meta["slug"], db=db))
    return out


def _split(values: list[str]) -> set[str]:
    return {s.strip() for v in values for s in v.split(",") if s.strip()}


@router.get("/boards")
def list_boards(include_archived_boards: bool = Query(False)):
    rows = []
    for b in _boards(include_archived_boards):
        try:
            cursor = gm.latest_event_id(b.db)
        except sqlite3.Error:
            cursor = 0
        rows.append({"slug": b.slug, "name": b.name, "cursor": cursor})
    return {"boards": rows}


@router.get("/graph")
def get_graph(
    board: list[str] = Query(default_factory=list, description="Board slug, repeatable; omit for all boards"),
    focus: list[str] = Query(default_factory=list, description="Keep tasks in these statuses plus their lineage"),
    hide: list[str] = Query(default_factory=list, description="Drop tasks in these statuses"),
    include_archived: bool = Query(False),
    include_archived_boards: bool = Query(False),
):
    known = _boards(include_archived_boards)
    wanted = _split(board)
    if wanted:
        missing = wanted - {b.slug for b in known}
        if missing:
            raise HTTPException(status_code=404, detail=f"unknown board(s): {', '.join(sorted(missing))}")
        known = [b for b in known if b.slug in wanted]
    graph = gm.build(known, root=get_default_hermes_root(), include_archived=include_archived,
                     hide=_split(hide), focus=_split(focus))
    graph["cursors"] = {b.slug: gm.latest_event_id(b.db) for b in known}
    return graph


def _ws_upgrade_authorized(ws: WebSocket) -> bool:
    """Same gate as the bundled kanban socket (``?token=`` / ``?ticket=`` / ``?internal=``).
    Fails closed: a Hermes without that gate gets no socket and the page falls back to polling."""
    try:
        from hermes_cli import web_server_chat as _ws
    except Exception:
        return False
    return bool(_ws._ws_auth_ok(ws))


class _MultiTail:
    """task_events tailer over every board, on one dedicated thread (sqlite connections are
    thread-affine). Boards created after the handshake are picked up on the next rescan."""

    RESCAN_EVERY = 20

    def __init__(self, slugs: set[str]) -> None:
        self._slugs = slugs
        self._conns: dict[str, sqlite3.Connection] = {}
        self._cursors: dict[str, int] = {}
        self._tick = 0
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kanban-graph-events")

    def _rescan(self) -> None:
        for b in _boards():
            if (self._slugs and b.slug not in self._slugs) or b.slug in self._conns:
                continue
            con = gm.ro_connect(b.db)
            self._conns[b.slug] = con
            self._cursors[b.slug] = int(con.execute("select coalesce(max(id), 0) from task_events").fetchone()[0])

    def _fetch(self) -> list[dict]:
        if self._tick % self.RESCAN_EVERY == 0:
            self._rescan()
        self._tick += 1
        frames = []
        for slug, con in list(self._conns.items()):
            try:
                rows = con.execute("select id, task_id, run_id, kind, created_at from task_events "
                                   "where id > ? order by id limit ?",
                                   (self._cursors[slug], EVENTS_PER_FRAME)).fetchall()
            except sqlite3.Error as exc:
                log.debug("kanban-graph: board %s tail failed: %s", slug, exc)
                con.close()
                del self._conns[slug]
                continue
            if rows:
                self._cursors[slug] = rows[-1]["id"]
                frames.append({"board": slug, "cursor": rows[-1]["id"], "events": [dict(r) for r in rows]})
        return frames

    def _close(self) -> None:
        for con in self._conns.values():
            con.close()
        self._conns.clear()

    async def poll(self) -> list[dict]:
        return await asyncio.get_running_loop().run_in_executor(self._executor, self._fetch)

    async def shutdown(self) -> None:
        try:
            await asyncio.get_running_loop().run_in_executor(self._executor, self._close)
        finally:
            self._executor.shutdown(wait=True, cancel_futures=True)


@router.websocket("/events")
async def stream_events(ws: WebSocket):
    if not _ws_upgrade_authorized(ws):
        await ws.close(code=http_status.WS_1008_POLICY_VIOLATION)
        return
    await ws.accept()
    tail = _MultiTail(_split(ws.query_params.getlist("board")))
    try:
        await ws.send_json({"hello": True})
        last_sent = time.monotonic()
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=EVENT_POLL_SECONDS)
                if msg["type"] == "websocket.disconnect":
                    return
            except asyncio.TimeoutError:
                pass
            for frame in await tail.poll():
                await ws.send_json(frame)
                last_sent = time.monotonic()
            if time.monotonic() - last_sent >= KEEPALIVE_SECONDS:
                await ws.send_json({"ping": int(time.time())})
                last_sent = time.monotonic()
    except (WebSocketDisconnect, asyncio.CancelledError):
        return
    except Exception as exc:
        log.warning("kanban-graph event stream error: %s", exc)
        try:
            await ws.close()
        except Exception:
            pass
    finally:
        await tail.shutdown()
