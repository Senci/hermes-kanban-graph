// The snapshot generator (snapshot/kanban_graph.py) pastes everything between the two
// layout markers into the static page, and tests/layout.test.mjs evaluates the same slice of the
// built desktop/plugin.js. esbuild drops plain comments, so the markers are written as legal
// comments and kept in place by the build flag --legal-comments=inline (tools/build). This module
// carries only the start marker; the layout and its kit imports are bundled between it and
// layout-end.js, so index.js must import sizes, this file, layout, layout-end in that order.

// kg:layout-start @preserve
