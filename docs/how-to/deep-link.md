# Open a task from a script or chat

Use a `hermes://` deep link. It works from a shell, a notification action, a chat message the user
clicks, or a Hyprland/sway key binding.

```sh
xdg-open 'hermes://open/kanban-graph?task=website-relaunch/t_pages&mode=open'
```

- `task` is `<board-slug>/<task-id>`. The id alone is not enough: ids are only unique per board.
- Every parameter is optional; leave one out to keep the user's last choice. All parameters:
  [reference/deep-link.md](../reference/deep-link.md).
- Opening a link raises the app window. Do not use it as a poll from automation.

## From the command palette

Paste the link (or just `task=<board>/<id>`) into the palette. The palette's "Open kanban graph"
entry opens the page with the last view.

## From a key binding

Hyprland example, opening the graph on open work:

```ini
bind = SUPER ALT, G, exec, xdg-open 'hermes://open/kanban-graph?mode=open'
```

## Building the key

`hermes kanban --board <slug> show <id>` prints the task. The board slug is the directory name
under `~/.hermes/kanban/boards/`; `hermes kanban boards list` lists them.

## When nothing happens

| Symptom | Cause |
|---|---|
| App opens, page shows only a loader | The desktop switch is off: Capabilities > Plugins > Kanban Graph |
| Page opens, no task selected | The task does not exist on that board; check the slug and id |
| Page opens with mode "All" | The task was hidden by your filter, so the view widened |
| App does not come to the front | `hermes://` is not registered; start Hermes Desktop once |
| Page says "backend unreachable", toolbar reads `offline` | The window is on a backend without the plugin, usually a remote gateway; the message names it. Switch the window to This device, or install the plugin on that host |
