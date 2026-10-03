# Security

## Reporting a vulnerability

Email senad@licina.eu, or use GitHub's private vulnerability reporting on this repository
(Security > Report a vulnerability). Please do not open a public issue. Expect an answer within a
week.

## What the plugin can touch

- **Board databases:** read-only (`sqlite3` URI `mode=ro`). It never writes, migrates or locks a
  board for writing.
- **Session database:** read-only, for a running task's latest tool calls.
- **Network:** none of its own. Its REST routes and WebSocket mount on the local Hermes backend
  under `/api/plugins/kanban-graph/`; the socket uses Hermes's own WebSocket auth gate and refuses
  the upgrade when that gate is unavailable.
- **Desktop renderer:** only the public plugin SDK. No dynamic code, no remote scripts, no
  self-updating.
- **Snapshot CLI:** reads the boards and writes one HTML file where you tell it to. The file
  contains task titles, bodies and results, so treat it like the boards themselves.
