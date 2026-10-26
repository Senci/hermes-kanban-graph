# Getting started

This takes you to a selected task with its lineage on screen, in about five minutes. You need
Hermes Agent 0.21.5 or newer with Hermes Desktop.

## 1. Install and switch on

Follow [Install and enable](../../README.md#install-and-enable) in the README. Come back when
**Kanban graph** shows in the sidebar.

## 2. Open the graph

Click **Kanban graph** in the sidebar. Or press `Ctrl+K` (`Cmd+K` on macOS) and run **Open kanban
graph**.

You see one band per board and one card per task. The default mode is **Running + lineage**: the
running tasks plus everything they depend on and everything that depends on them. If nothing runs,
the graph is empty. Switch the mode to **Open** or **All**.

## 3. Select a task

Click a card. The task and its lineage stay bright, the rest fades. The panel on the right lists
upstream and downstream tasks, runs, last failure, result and body. For a running task it also
shows the worker's latest tool calls.

Press `Esc` to clear the selection, `0` to fit the graph, `/` to search.

## 4. Open a task by link

List the tasks of a board:

```sh
hermes kanban --board <slug> list
```

Then open one by its link:

```sh
xdg-open 'hermes://open/kanban-graph?task=<slug>/<task-id>'
```

On macOS use `open` instead of `xdg-open`. The app comes to the front with that task selected.

## Next

- [Open a task from a script or chat](../how-to/deep-link.md)
- [Render a static snapshot](../how-to/snapshot.md)
- [How the graph is drawn](../explanation/architecture.md)
