# Update or remove the plugin

## Update

```sh
hermes plugins update kanban-graph
```

Hermes pulls the repository (a catalog install re-pins to the catalog's reviewed commit
instead). Hermes Desktop refreshes its copy of the desktop half and reloads the page by itself;
restart the backend (or the app) so changed REST routes mount.

To install one exact release, pass its full commit SHA (listed on the GitHub release page):

```sh
hermes plugins install Senci/hermes-kanban-graph --ref <40-char-sha> --force --enable
```

Release notes: [CHANGELOG.md](../../CHANGELOG.md).

## Disable

- Desktop page only: Capabilities > Plugins > Kanban Graph off.
- Backend routes too: `hermes plugins disable kanban-graph`.

## Remove

```sh
hermes plugins remove kanban-graph
```

This deletes `~/.hermes/plugins/kanban-graph/`; Hermes Desktop drops its copy of the desktop half
on the next start. Your boards are untouched; the
plugin never wrote to them. Snapshots you rendered stay in `~/.hermes/cache/kanban-graph/` until
you delete them.
