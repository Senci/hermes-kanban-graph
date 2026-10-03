# Getting started

This walks you from nothing to a selected task with its lineage on screen. It takes about five
minutes and needs Hermes Agent 0.21.5 or newer with Hermes Desktop.

## 1. Install the plugin

```sh
hermes plugins install Senci/hermes-kanban-graph --enable
```

Hermes clones the repository into `~/.hermes/plugins/kanban-graph/` and enables it for the
current profile. Hermes Desktop then copies the `desktop/` folder to
`~/.hermes/desktop-plugins/kanban-graph/` on its own.

Check it:

```sh
hermes plugins list | grep kanban-graph
```

## 2. Switch on the desktop page

Open Hermes Desktop, then **Capabilities > Plugins**, and switch on **Kanban Graph**.

The desktop half of every plugin package ships switched off, and the backend switch from step 1
does not cover it. Until this switch is on, the page does not exist: a deep link to it shows a
loader and nothing else.

If the backend was already running before step 1, restart it (or the app) so the routes under
`/api/plugins/kanban-graph/` mount.

## 3. Open the graph

Click **Kanban graph** in the sidebar. You can also press `Ctrl+K` (`Cmd+K` on macOS) and run
"Open kanban graph".

You see one band per board and one card per task. By default the view shows **Running +
lineage**: tasks that are running now plus everything they depend on and everything that depends
on them. No running task means an empty graph; switch the mode to **Open** or **All**.

## 4. Select a task

Click any card. The task, everything upstream and everything downstream stay bright; the rest
fades. The panel on the right lists its upstream and downstream tasks, runs, last failure, result
and body. For a running task it also shows the worker session's latest tool calls.

Press `Escape` to clear the selection, `0` to fit the graph, `/` to search.

## 5. Open a task by link

Pick any task id from `hermes kanban --board <slug> list`, then:

```sh
xdg-open 'hermes://open/kanban-graph?task=<slug>/<task-id>'
```

(`open` instead of `xdg-open` on macOS.) The app comes to the front with that task selected.

## Next

- [Open a task from a script or chat](../how-to/deep-link.md)
- [Render a static snapshot](../how-to/snapshot.md)
- [How the graph is drawn](../explanation/architecture.md)
