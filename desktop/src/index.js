// Kanban graph: a live, read-only dependency graph across kanban boards. Data comes from this
// package's own backend (dashboard/plugin_api.py via ctx.rest); the ctx.socket event stream
// invalidates it, with a poll as the floor (the socket is a no-op on OAuth remotes).
//
// Source of desktop/plugin.js. Build: `sh scripts/rebuild.sh` (esbuild 0.28.2, one file, SDK and react
// external; CONTRIBUTING.md has the details). The modules in kit/ are a one-time fork, edit them here.
// Every named import from '@hermes/plugin-sdk' must exist in the host's SDK at the oldest Hermes in
// plugin.yaml's requires_hermes; the loader import()s the bundle as a real ES module, so a missing
// export is a link-time SyntaxError that takes the page route, sidebar row and palette row down
// together.

import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA } from '@hermes/plugin-sdk'
import { createElement as h } from 'react'

import { startLiveChannel } from './kit/live.js'
import { mountStyle } from './kit/theme.js'

// Order matters: the bundle emits modules in this order and the layout markers must wrap the
// layout and kit/layered.js (see layout-start.js).
import './sizes.js'
import './layout-start.js'
import { KG_MODES } from './layout.js'
import './layout-end.js'

import { CSS } from './css.js'
import { ID, KEEPALIVE_S, PATH, ALL } from './model.js'
import { GraphPage } from './page.js'
import { route } from './route.js'
import { $arrange, $board, $mode, $now, $socket, setApi } from './state.js'

export default {
  id: ID,
  name: 'Kanban Graph',
  register(ctx) {
    setApi(ctx)
    $mode.set(ctx.storage.get('mode', 'running'))
    $board.set(ctx.storage.get('board', ALL))
    $arrange.set(KG_MODES.some(([m]) => m === ctx.storage.get('arrange')) ? ctx.storage.get('arrange') : 'flow')

    const unmountStyle = mountStyle(ID, CSS)
    const stopLive = startLiveChannel(ctx, {
      status: $socket,
      invalidate: [ID, 'graph'],
      keepaliveS: KEEPALIVE_S,
      onTick: now => $now.set(now)
    })

    ctx.onDispose(() => {
      stopLive()
      unmountStyle()
      setApi(null)
    })

    // The palette handler is route-independent: from anywhere it reveals the page; on the page it
    // re-asserts the current view, so a stray run never drops the selection you were reading.
    const openGraph = () => {
      host.navigate(route.on() ? window.location.hash.replace(/^#/, '') : PATH)
    }

    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => h(GraphPage) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 51, data: { path: PATH, label: 'Kanban graph', codicon: 'type-hierarchy' } },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'kanban-graph.open',
          action: 'kanban-graph.open',
          label: 'Open kanban graph',
          keywords: ['kanban', 'graph', 'dependencies', 'lineage', 'running'],
          run: openGraph
        }
      }
    ])
  }
}
