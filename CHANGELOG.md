# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- A card title wraps to two lines and then ends in an ellipsis; the full title stays in the tooltip and the panel.

## [0.2.3] - 2026-11-09

### Changed

- CI: GitHub Actions `setup-python` and `setup-node` pinned to v7.1.0; the rebuild job runs on Node 24.22.2.
  The plugin behaviour is unchanged.

## [0.2.2] - 2026-11-06

### Added

- Snapshot `--highlight ID`: outline the given tasks, e.g. the cards a review page is about.

### Fixed

- The snapshot renders inside a sandboxed frame without storage; the arrange mode falls back to flow.
- A live run shows no worker activity until its session carries the task title, instead of showing
  another task's session (#3).

### Changed

- The desktop half is now built from `desktop/src` (esbuild 0.28.2, `sh scripts/rebuild.sh`); the
  rebuild is byte for byte reproducible and CI fails on a difference. Behaviour is unchanged.

## [0.2.1] - 2026-10-14

### Added

- CI: a GitHub Actions workflow runs the test suites and `hermes plugins validate` and `doctor`
  against the oldest supported Hermes (0.21.5) on every push and pull request.

### Fixed

- The toolbar no longer reads "live" while the graph cannot be fetched. It shows `offline`
  (red) with the error in its tooltip; the socket could stay live on a different backend.
- Switching a window to another gateway or profile reopens the event socket on the new backend
  and no longer shows the previous backend's graph while the new one loads or fails.
- "Backend unreachable" names the backend and profile it tried and says how to fix a remote
  gateway, instead of only pointing at `plugins.enabled`.

## [0.2.0] - 2026-10-03

First public release as a standalone repository.

### Added

- Transitive reduction: an arrow A to C is no longer drawn when A reaches C through other visible
  tasks. The footer counts them as "implied hidden"; lineage selection still follows them.
- Arrow ends spread along a card's edge, ordered by the other end's position, so several arrows
  into one task no longer share one tip.
- Hover text on the warning triangle: "Blocked: ..." or "N failed runs".
- Bundled agent skill `kanban-graph:board-graph`.
- Test suite: backend model and snapshot (Python stdlib) and layout checks (Node, no
  dependencies) on anonymised fixtures.

### Changed

- The toolbar fits one row: compact mode switch, narrower search, live and zoom controls wrap as
  one group.
- Card and board sublines separate fields with ` · `.
- The snapshot CLI moved to `snapshot/kanban_graph.py` and reads the Hermes root from
  `HERMES_HOME` (default `~/.hermes`).

### Fixed

- Footer says "1 board", not "1 boards".
- The event socket refuses the upgrade when Hermes's WebSocket auth gate cannot be imported,
  instead of accepting it unauthenticated.

## [0.1.0] - 2026-10-02

Private version: desktop page, backend routes, event socket, static snapshot.

[Unreleased]: https://github.com/Senci/hermes-kanban-graph/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Senci/hermes-kanban-graph/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Senci/hermes-kanban-graph/releases/tag/v0.2.0
