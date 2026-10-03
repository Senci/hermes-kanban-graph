# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/Senci/hermes-kanban-graph/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Senci/hermes-kanban-graph/releases/tag/v0.2.0
