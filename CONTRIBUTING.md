# Contributing

Issues and pull requests are welcome. For anything beyond a small fix, open an issue first so we
can agree on the approach.

## Layout

| Path | What it is |
|---|---|
| `plugin.yaml`, `__init__.py` | Agent half: manifest, registers the bundled skill |
| `dashboard/` | Backend half: `manifest.json`, REST and WebSocket routes, graph model |
| `desktop/plugin.js` | Desktop half: the page, sidebar row and palette entry |
| `snapshot/` | Standalone HTML renderer (stdlib Python) and its template |
| `skills/board-graph/` | Agent skill shipped with the plugin |
| `tests/` | Python and Node tests, anonymised fixtures |
| `tools/` | Fixture anonymiser and demo-board generator |

## Dev loop

Install from your working copy instead of GitHub:

```sh
hermes plugins install file://$PWD --enable --force
```

That copies the tree to `~/.hermes/plugins/kanban-graph/`, and Hermes Desktop mirrors
`desktop/` into `~/.hermes/desktop-plugins/kanban-graph/`. A changed `desktop/plugin.js` reloads
within a second; the Python half mounts at backend start, so restart the
backend (or the app) after editing `dashboard/`. Re-run the install after each change you want to
try, or edit the installed copy and port the change back. A symlink does not work: Hermes Desktop
skips symlinked plugin folders.

Demo data without touching your boards:

```sh
python3 tools/demo_home.py /tmp/kg-demo
HERMES_HOME=/tmp/kg-demo python3 snapshot/kanban_graph.py
```

## Rules

- **No dependencies.** Python is stdlib (plus what Hermes itself ships for the backend half); the
  desktop half imports only `@hermes/plugin-sdk` and `react`. Tests need Python 3.11+ and Node 22+,
  nothing installed.
- **Read-only.** Nothing may write to a board database.
- **Inside the SDK.** No prototype patching, `eval`, dynamic imports or reaching into app stores;
  `hermes plugins validate` refuses them.
- **No self-updating.** The plugin never downloads or rewrites its own files.
- **Layout changes keep both views in step.** The layout block in `desktop/plugin.js` and
  `snapshot/template.html` is the same code; `tests/layout.test.mjs` runs the desktop copy.
- Before a pull request: the three commands in the README's Development section pass.

## Fixtures

`tests/fixtures/*.json` are real graphs with every name, title and id replaced. Make a new one
from a `/graph` dump with `tools/anonymize_fixture.py`. Never commit a raw dump.

## Releasing

1. Move the `Unreleased` entries in `CHANGELOG.md` under the new version.
2. Bump `version` in `plugin.yaml`, `dashboard/manifest.json` and `skills/board-graph/SKILL.md`.
3. Commit, tag `vX.Y.Z`, push the tag, create the GitHub release from the changelog section.
4. If the plugin is in the Hermes plugin catalog, open a PR to `NousResearch/hermes-agent` that
   bumps `sha` and `version` in `plugin-catalog/kanban-graph.yaml`.
