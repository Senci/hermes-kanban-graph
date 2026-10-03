"""Read-only kanban graph model: tasks, links, runs and live worker sessions across boards, served
to the desktop page, which does the layout. Stdlib only; every DB is opened with mode=ro so the
dispatcher's writers never contend with a reader that could migrate or create a board."""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

STATUS_ORDER = ["triage", "todo", "scheduled", "ready", "running", "blocked", "review", "done", "archived"]
BODY_CHARS = 600
ACT_CHARS = 180
MAX_ACTS = 25
# Workers name their session after the task; the window only disambiguates retries of one title.
SESSION_WINDOW = (-10, 300)


@dataclass(frozen=True)
class Board:
    slug: str
    name: str
    db: Path


def ro_connect(db: Path) -> sqlite3.Connection:
    con = sqlite3.connect(f"{db.resolve().as_uri()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def clip(text: str | None, n: int) -> str:
    if not text:
        return ""
    text = text.strip()
    return text if len(text) <= n else text[:n].rstrip() + " [...]"


def lineage(seeds: set[str], links: list[tuple[str, str]]) -> set[str]:
    """Seeds plus every transitive ancestor and descendant."""
    up: dict[str, list[str]] = {}
    down: dict[str, list[str]] = {}
    for p, c in links:
        down.setdefault(p, []).append(c)
        up.setdefault(c, []).append(p)
    keep = set(seeds)
    for edges in (up, down):
        seen = set(seeds)
        stack = list(seeds)
        while stack:
            for n in edges.get(stack.pop(), []):
                if n not in seen:
                    seen.add(n)
                    stack.append(n)
        keep |= seen
    return keep


def latest_event_id(db: Path) -> int:
    con = ro_connect(db)
    try:
        return int(con.execute("select coalesce(max(id), 0) from task_events").fetchone()[0])
    finally:
        con.close()


def read_board(db: Path, include_archived: bool, hide: set[str], focus: set[str]) -> tuple[list[dict], list[tuple[str, str]]]:
    con = ro_connect(db)
    try:
        cols = {r[1] for r in con.execute("pragma table_info(tasks)")}
        want = ["id", "title", "body", "assignee", "status", "priority", "created_at", "started_at",
                "completed_at", "result", "model_override", "reasoning_effort", "block_kind",
                "last_failure_error", "consecutive_failures", "current_run_id", "last_heartbeat_at",
                "max_runtime_seconds"]
        sel = ", ".join(c if c in cols else f"NULL AS {c}" for c in want)
        rows = [dict(r) for r in con.execute(f"select {sel} from tasks order by created_at")]
        all_links = [(r[0], r[1]) for r in con.execute("select parent_id, child_id from task_links")]
        drop = hide if include_archived else hide | {"archived"}
        rows = [r for r in rows if r["status"] not in drop]
        ids = {r["id"] for r in rows}
        if focus:
            ids = lineage({r["id"] for r in rows if r["status"] in focus},
                          [(p, c) for p, c in all_links if p in ids and c in ids])
            rows = [r for r in rows if r["id"] in ids]
        runs: dict[str, list[dict]] = {}
        if con.execute("select 1 from sqlite_master where name='task_runs'").fetchone():
            for r in con.execute("select id, task_id, profile, status, outcome, started_at, ended_at, "
                                 "last_heartbeat_at, error, summary from task_runs order by id"):
                if r["task_id"] in ids:
                    runs.setdefault(r["task_id"], []).append(dict(r))
    finally:
        con.close()
    hx: dict[str, dict] = {}
    for p, c in all_links:
        if p in ids and c not in ids:
            hx.setdefault(p, {"p": 0, "c": 0})["c"] += 1
        elif c in ids and p not in ids:
            hx.setdefault(c, {"p": 0, "c": 0})["p"] += 1
    for r in rows:
        r["runs"] = runs.get(r["id"], [])
        r["hx"] = hx.get(r["id"])
    return rows, [(p, c) for p, c in all_links if p in ids and c in ids and p != c]


def _arg_summary(raw: str | None) -> str:
    try:
        a = json.loads(raw or "{}")
    except ValueError:
        return clip(raw, ACT_CHARS)
    if not isinstance(a, dict):
        return clip(str(a), ACT_CHARS)
    for key in ("command", "code", "path", "url", "query", "task_id", "summary", "reason", "body"):
        if a.get(key):
            return clip(" ".join(str(a[key]).split()), ACT_CHARS)
    return clip(json.dumps(a, separators=(",", ":")), ACT_CHARS)


def profile_state_db(root: Path, profile: str) -> Path:
    return root / "state.db" if profile in ("", "default") else root / "profiles" / profile / "state.db"


def live_worker(root: Path, profile: str, title: str, run_start: int) -> dict | None:
    """The worker's chat session for a live run: source=kanban, titled after the task, started
    with the run. Falls back to the time window alone for sessions not yet titled."""
    db = profile_state_db(root, profile)
    if not db.exists():
        return None
    lo, hi = run_start + SESSION_WINDOW[0], run_start + SESSION_WINDOW[1]
    try:
        con = ro_connect(db)
        try:
            s = con.execute("select * from sessions where source='kanban' and title=? and started_at between ? and ? "
                            "order by started_at desc limit 1", (title, lo, hi)).fetchone()
            if not s:
                s = con.execute("select * from sessions where source='kanban' and started_at between ? and ? "
                                "order by started_at limit 1", (lo, hi)).fetchone()
            if not s:
                return None
            s = dict(s)
            acts, say = [], ""
            for m in con.execute("select timestamp, content, tool_calls from messages where session_id=? "
                                 "and role='assistant' order by id desc limit 60", (s["id"],)):
                if not say and (m["content"] or "").strip():
                    say = clip(m["content"], 500)
                try:
                    calls = json.loads(m["tool_calls"] or "[]")
                except ValueError:
                    calls = []
                for c in reversed(calls if isinstance(calls, list) else []):
                    fn = c.get("function", {}) if isinstance(c, dict) else {}
                    acts.append([int(m["timestamp"]), fn.get("name", "?"), _arg_summary(fn.get("arguments"))])
                if len(acts) >= MAX_ACTS:
                    break
        finally:
            con.close()
    except sqlite3.Error as exc:
        return {"err": f"state.db read failed: {exc}"}
    return {"sid": s["id"], "profile": profile, "calls": s.get("tool_call_count") or 0,
            "api": s.get("api_call_count") or 0, "msgs": s.get("message_count") or 0,
            "cost": s.get("estimated_cost_usd"), "out": s.get("output_tokens") or 0,
            "cr": s.get("cache_read_tokens") or 0, "last": s.get("last_activity_at"),
            "desc": s.get("last_activity_description") or "", "acts": acts[:MAX_ACTS], "say": say}


def _task_out(slug: str, r: dict, root: Path) -> dict:
    cur = next((u for u in r["runs"] if u["id"] == r["current_run_id"] and u["status"] == "running"), None)
    return {
        "k": f"{slug}/{r['id']}", "id": r["id"], "b": slug, "t": r["title"] or r["id"],
        "s": r["status"], "a": r["assignee"] or "", "p": r["priority"] or 0,
        "m": r["model_override"] or "", "e": r["reasoning_effort"] or "",
        "bk": r["block_kind"] or "", "f": r["consecutive_failures"] or 0,
        "c": r["created_at"], "st": r["started_at"], "d": r["completed_at"],
        "body": clip(r["body"], BODY_CHARS), "res": clip(r["result"], BODY_CHARS),
        "err": clip(r["last_failure_error"], 300),
        "hb": r["last_heartbeat_at"], "mx": r["max_runtime_seconds"], "hx": r["hx"],
        "runs": [{"id": u["id"], "pr": u["profile"] or "", "s": u["status"], "o": u["outcome"] or "",
                  "a": u["started_at"], "z": u["ended_at"], "hb": u["last_heartbeat_at"],
                  "e": clip(u["error"] or u["summary"], 240)} for u in r["runs"]],
        "live": live_worker(root, cur["profile"] or r["assignee"] or "", r["title"] or "", int(cur["started_at"]))
        if cur else None,
    }


def build(boards: list[Board], *, root: Path, include_archived: bool = False,
          hide: set[str] | None = None, focus: set[str] | None = None) -> dict:
    """Tasks and links per board; the page lays out whatever subset is visible."""
    hide, focus = hide or set(), focus or set()
    out_boards, out_tasks, out_links = [], [], []
    for b in boards:
        rows, links = read_board(b.db, include_archived, hide, focus)
        if not rows:
            continue
        counts: dict[str, int] = {}
        for r in rows:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
            out_tasks.append(_task_out(b.slug, r, root))
        out_links += [[f"{b.slug}/{p}", f"{b.slug}/{c}"] for p, c in links]
        out_boards.append({"slug": b.slug, "name": b.name, "counts": counts, "n": len(rows)})
    return {"generated": int(time.time()), "statuses": STATUS_ORDER,
            "hidden": sorted(hide if include_archived else hide | {"archived"}), "focus": sorted(focus),
            "boards": out_boards, "tasks": out_tasks, "links": out_links}
