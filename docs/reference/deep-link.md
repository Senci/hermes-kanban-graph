# Deep-link parameters

```
hermes://open/kanban-graph?task=<board>/<id>&mode=<mode>&board=<slug>&arrange=<arrange>
```

The same query string works on the in-app route `#/kanban-graph?...` and pasted into the command
palette. Every parameter is optional. An omitted one keeps the user's last choice, which the page
stores per profile.

| Parameter | Values | Effect |
|---|---|---|
| `task` | `<board-slug>/<task-id>` | Selects the task and opens its panel. Unknown keys are dropped. |
| `mode` | `running` (default), `open`, `all` | Which tasks load: running tasks plus lineage, everything not done, everything |
| `board` | a board slug, or `all` | Limits the view to one board |
| `arrange` | `flow` (default), `down`, `status`, `grid` | Layout: left to right, top down, columns by status, compact grid |

Rules:

- A `task` the current `mode` hides switches the view to `all` so the task can show.
- The camera, search text and status-chip toggles are not part of the link; they reset per visit.
- Values are case-sensitive.

## Keyboard

| Key | Action |
|---|---|
| `Escape` | Clear the selection (or the search, when the search box has focus) |
| `0` | Fit the graph to the window |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `/` | Focus the search box |
| Wheel | Zoom at the pointer |
| Drag | Pan |
| Click a status chip | Hide or show that status; Shift+click shows only that status |
