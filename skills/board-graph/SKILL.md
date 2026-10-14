---
name: board-graph
description: "Use when asked to show, draw or navigate the kanban dependency graph: lineage, what is running or blocked across boards."
version: 0.2.1
author: Senad Ličina
license: MIT
metadata:
  hermes:
    tags: [kanban, visualization, graph, deep-link]
---

# Kanban board graph

The `kanban-graph` plugin gives two views of the same graph. Both are read-only and arrange tasks
with the same layout code.

- **Live page** in Hermes Desktop at `#/kanban-graph`: pan and zoom across every board, click a
  task to select it plus everything upstream and downstream, with a detail panel. It tails
  `task_events` over one WebSocket and re-lays out as work moves. Use it whenever the user is in
  the desktop app.
- **Snapshot**: `snapshot/kanban_graph.py` in the plugin directory renders a standalone HTML file.
  Use it only without the desktop app: CI, a remote or OAuth gateway, or when the user wants a file.

## Open the live page

1. The desktop half ships opt-in. If the page never appears, the user must switch on
   Capabilities > Plugins > Kanban Graph. This switch is separate from `plugins.enabled` (the
   backend half); both must be on. A deep link to the page while the switch is off shows a
   loader and no error.
2. Doors: the sidebar row "Kanban graph", the palette (`mod+k`, Ctrl+K on Linux and Windows) entry
   "Open kanban graph", or a deep link. Only the deep link carries a task:

   ```
   hermes://open/kanban-graph?task=<board>/<task-id>&mode=<running|open|all>&board=<slug>&arrange=<flow|down|status|grid>
   ```

   `task` is the node key `board/id`, not the id alone. Every param is optional; an omitted one
   keeps the user's last choice. A task the current filter hides widens the view to `all`; a task
   that does not exist is dropped. Open it with `xdg-open '<link>'` (Linux) or `open '<link>'`
   (macOS). That raises the app window, so it is a visible navigation; do not use it as a poll.
3. Build a key from `hermes kanban --board <slug> show <id>`: the board slug plus the task id.

## Render a snapshot

```
python3 <plugin-dir>/snapshot/kanban_graph.py [--board SLUG ...] [--hide-status done] [--focus-status running] [--out PATH]
```

- No `--board` renders every board. `--list` prints slugs. `--archived` / `--archived-boards`
  include archived tasks and boards.
- `--hide-status done` maps to "only open work"; `--focus-status running` maps to "running tasks
  and their parents and children".
- Default output: `<hermes-root>/cache/kanban-graph/<slug>.html`. The script prints
  `<path>  boards=N tasks=N links=N`; report those counts and open the file, do not describe it.
- `<plugin-dir>` is `hermes plugins show kanban-graph` (usually `~/.hermes/plugins/kanban-graph`).

A snapshot is frozen at render time; re-run it for fresh data.

## Reading the graph

- An arrow means "parent must finish before child". Arrows implied by a longer path (A to C when
  A to B to C exists) are not drawn; the footer counts them as "implied hidden". Selecting a task
  still highlights its full lineage, including those.
- The left stripe and icon give the status; a warning triangle means blocked or failed runs
  (hover for which). A running task shows its duration and a highlight travelling its border,
  amber once the heartbeat is older than two minutes.
- The panel lists upstream and downstream tasks, runs, the last failure, result and body, and for
  a running task the worker session's latest tool calls.

## Pitfalls

- Page stuck on a loader: the desktop switch is off (step 1), not a crash. A real load failure
  logs `[plugins] runtime load failed` in `~/.hermes/logs/desktop.log`.
- New REST routes after an update 404 until the backend restarts: the Python half mounts at
  backend start only.
- Boards are shared across profiles, but the deep link opens in the profile the app is running,
  so the plugin must be enabled in that profile.
