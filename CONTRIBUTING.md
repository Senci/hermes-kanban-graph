# Contributing

Issues and pull requests are welcome. For anything beyond a small fix, open an issue first so we
can agree on the approach.

## Layout

| Path | What it is |
|---|---|
| `plugin.yaml`, `__init__.py` | Agent half: manifest, registers the bundled skill |
| `dashboard/` | Backend half: `manifest.json`, REST and WebSocket routes, graph model |
| `desktop/src/` | Source of the desktop half: the page, sidebar row and palette entry; `kit/` holds the shared modules, forked once and edited here like the rest |
| `desktop/plugin.js` | The desktop half as Hermes loads it, built from `desktop/src`; never edited by hand |
| `scripts/` | `rebuild.sh` and `build.mjs` build `desktop/plugin.js`; `esbuild-lock.json` pins the esbuild install |
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
`desktop/` into `~/.hermes/desktop-plugins/kanban-graph/`. The Python half mounts at backend
start, so restart the backend (or the app) after editing `dashboard/`. A symlink does not work:
Hermes Desktop skips symlinked plugin folders.

The desktop half is built. Edit `desktop/src`, rebuild, and commit both the source and the new
`desktop/plugin.js`:

```sh
sh scripts/rebuild.sh
```

The script installs esbuild 0.28.2 into `~/.cache/kanban-graph-build` (integrity-checked by
`scripts/esbuild-lock.json`, `KANBAN_GRAPH_BUILD_DIR` moves it), then runs `scripts/build.mjs`.
The output is byte for byte reproducible, and CI rebuilds it and fails on any difference, so a
change to `desktop/src` without the rebuilt bundle, or an edit to the bundle alone, is rejected.
Re-run the install after each change you want to try; a changed `desktop/plugin.js` reloads within
a second.

Demo data without touching your boards:

```sh
python3 tools/demo_home.py /tmp/kg-demo
HERMES_HOME=/tmp/kg-demo python3 snapshot/kanban_graph.py
```

## Rules

- **No dependencies.** Python is stdlib (plus what Hermes itself ships for the backend half); the
  desktop half imports only `@hermes/plugin-sdk` and `react`. Tests need Python 3.11+ and Node 22+,
  nothing installed. Only the rebuild needs npm (for the pinned esbuild), and nothing it installs
  ends up in this tree.
- **Read-only.** Nothing may write to a board database.
- **Inside the SDK.** No prototype patching, `eval`, dynamic imports or reaching into app stores;
  `hermes plugins validate` refuses them.
- **No self-updating.** The plugin never downloads or rewrites its own files.
- **Layout changes keep both views in step.** The snapshot generator pastes the layout block of the
  built `desktop/plugin.js` (between the `kg:layout-start` and `kg:layout-end` markers) into the
  static page, and `tests/layout.test.mjs` runs the same block. Change the layout in
  `desktop/src/layout.js` or `desktop/src/kit/layered.js`, then rebuild.
- Before a pull request: the commands in the README's Development section pass, and
  `git status` shows no difference after `sh scripts/rebuild.sh`.

## Fixtures

`tests/fixtures/*.json` are real graphs with every name, title and id replaced. Make a new one
from a `/graph` dump with `tools/anonymize_fixture.py`. Never commit a raw dump.

## Releasing

1. Move the `Unreleased` entries in `CHANGELOG.md` under the new version.
2. Bump `version` in `plugin.yaml`, `dashboard/manifest.json` and `skills/board-graph/SKILL.md`.
3. Commit, tag `vX.Y.Z`, push the tag, create the GitHub release from the changelog section.
4. If the plugin is in the Hermes plugin catalog, open a PR to `NousResearch/hermes-agent` that
   bumps `sha` and `version` in `plugin-catalog/kanban-graph.yaml`.
