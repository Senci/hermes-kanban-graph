# REST and WebSocket API

The backend half mounts on the local Hermes backend under `/api/plugins/kanban-graph/`. It uses the
backend's normal session auth; the desktop page calls it through the SDK's `ctx.rest` and
`ctx.socket`. All routes are read-only.

## `GET /boards`

| Query | Type | Default | Meaning |
|---|---|---|---|
| `include_archived_boards` | bool | `false` | Include boards marked archived |

```json
{"boards": [{"slug": "website-relaunch", "name": "Website relaunch", "cursor": 42}]}
```

`cursor` is the board's latest `task_events.id`.

## `GET /graph`

| Query | Type | Default | Meaning |
|---|---|---|---|
| `board` | string, repeatable | all boards | Board slugs to include; an unknown slug returns 404 |
| `hide` | string, repeatable or comma list | none | Drop tasks in these statuses |
| `focus` | string, repeatable or comma list | none | Keep tasks in these statuses plus their full lineage |
| `include_archived` | bool | `false` | Include archived tasks |
| `include_archived_boards` | bool | `false` | Include archived boards |

Response, abbreviated:

```json
{
  "generated": 1791000000,
  "statuses": ["triage", "todo", "scheduled", "ready", "running", "blocked", "review", "done", "archived"],
  "hidden": ["archived", "done"],
  "focus": [],
  "boards": [{"slug": "website-relaunch", "name": "Website relaunch", "counts": {"todo": 2}, "n": 6}],
  "tasks": [{"k": "website-relaunch/t_pages", "id": "t_pages", "b": "website-relaunch",
             "t": "Build landing pages", "s": "running", "runs": [], "live": null}],
  "links": [["website-relaunch/t_design", "website-relaunch/t_pages"]],
  "cursors": {"website-relaunch": 42}
}
```

Task fields:

| Field | Meaning |
|---|---|
| `k` | Node key `<board>/<id>`, unique across boards |
| `id`, `b`, `t`, `s` | Task id, board slug, title, status |
| `a`, `p`, `m`, `e` | Assignee, priority, model override, reasoning effort |
| `bk`, `f` | Block kind, consecutive failures |
| `c`, `st`, `d`, `hb` | Created, started, completed, last heartbeat (Unix seconds) |
| `mx` | Maximum runtime in seconds |
| `hx` | `{"p": n, "c": n}`: direct parents and children the filter left out, or `null` |
| `body`, `res`, `err` | Body, result and last failure, clipped |
| `runs` | Runs: `id`, `pr` profile, `s` status, `o` outcome, `a`/`z` start/end, `hb`, `e` error or summary |
| `live` | For a running task: the worker session's counters and its latest 25 tool calls, else `null` |

`links` are `[parent, child]` node keys: the parent must finish before the child. Links touching a
task outside the response are dropped.

## `WS /events`

| Query | Type | Default | Meaning |
|---|---|---|---|
| `board` | string, repeatable | all boards | Boards to tail |

The socket uses Hermes's own WebSocket auth (`?token=`, `?ticket=` or `?internal=`, which
`ctx.socket` adds) and closes with 1008 when that gate refuses or is unavailable.

Frames:

| Frame | When |
|---|---|
| `{"hello": true}` | Once, after connect |
| `{"board": "<slug>", "cursor": 43, "events": [...]}` | New `task_events` rows, up to 200 per frame; each event has `id`, `task_id`, `run_id`, `kind`, `created_at` |
| `{"ping": 1791000000}` | After 15 s without another frame |

The server polls the board databases every 0.5 s and picks up new boards every 10 s. The desktop
page refetches `/graph` on event frames and treats 35 s of silence as a lost socket.
