# Package layout and manifests

One repository, one Hermes plugin package with three halves. The catalog key, the manifest `name`,
the install folder, the REST prefix, the route and the deep link all use `kanban-graph`; only the
repository carries the `hermes-` prefix, like the other community plugins.

```
hermes-kanban-graph/
  plugin.yaml              agent manifest (name, version, requires_hermes, capabilities)
  __init__.py              register(ctx): registers the bundled skill, nothing else
  dashboard/
    manifest.json          backend manifest: label, icon, hidden tab, api module
    plugin_api.py          FastAPI router: /boards, /graph, /events
    graph_model.py         board discovery and graph build, read-only SQLite
  desktop/
    plugin.js              desktop page, sidebar row, palette entry (plain ESM, no build step)
  snapshot/
    kanban_graph.py        static HTML renderer
    template.html          snapshot page; layout block shared with desktop/plugin.js
    tabler-icons.json      vendored icon subset
  skills/board-graph/
    SKILL.md               agent skill, loads as kanban-graph:board-graph
  tests/                   Python and Node tests, anonymised fixtures
  tools/                   fixture anonymiser, demo board generator
```

## Declared capabilities

`plugin.yaml` declares no tools, hooks, middleware or environment variables, and `hermes plugins
validate` confirms the plugin registers none. The only registration is the skill.

| Field | Value |
|---|---|
| `requires_hermes` | `>=0.21.5` |
| `provides_tools`, `provides_hooks`, `requires_env` | `[]` |

## Where things land after install

| Path | Written by |
|---|---|
| `~/.hermes/plugins/kanban-graph/` | `hermes plugins install` (git clone) |
| `~/.hermes/desktop-plugins/kanban-graph/` | Hermes Desktop, a copy of `desktop/` marked with `.hermes-package.json` |
| `~/.hermes/cache/kanban-graph/*.html` | The snapshot CLI, by default |

Desktop page state (mode, board, arrangement) lives in the app's per-profile plugin storage.
