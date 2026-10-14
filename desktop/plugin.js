// Kanban graph: a live, read-only dependency graph across kanban boards. Data comes from this
// package's own backend (dashboard/plugin_api.py) through ctx.rest; the ctx.socket event stream
// invalidates it, with a slow poll as the fallback (the socket is a no-op on OAuth remotes).
// The file loads uncompiled, so UI is built with createElement, not JSX.
//
// Every named import must exist in the host's SDK. The loader import()s this file as a real ES
// module, so a missing export is a link-time SyntaxError that takes the whole module down: page
// route, sidebar row and palette row vanish together. Check the SDK export list of the oldest
// Hermes release in plugin.yaml's requires_hermes before adding one.

import {
  Button,
  Codicon,
  CopyButton,
  EmptyState,
  ErrorState,
  Loader,
  PALETTE_AREA,
  ROUTES_AREA,
  SearchField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SIDEBAR_NAV_AREA,
  Tip,
  atom,
  host,
  queryClient,
  useQuery,
  useValue
} from '@hermes/plugin-sdk'
import { createElement as h, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const ID = 'kanban-graph'
const PATH = '/kanban-graph'
const ALL = '__all__'
const KEEPALIVE_S = 15
const ANIM_MS = 350
const SEARCH_DEBOUNCE_MS = 150

const STATUS = {
  triage: { icon: 'inbox', tone: 'var(--ui-text-tertiary)' },
  todo: { icon: 'circle-outline', tone: 'var(--ui-text-secondary)' },
  scheduled: { icon: 'watch', tone: 'var(--ui-purple)' },
  ready: { icon: 'play-circle', tone: 'var(--ui-blue)' },
  running: { icon: 'sync', tone: 'var(--ui-green)' },
  blocked: { icon: 'error', tone: 'var(--ui-red)' },
  review: { icon: 'eye', tone: 'var(--ui-yellow)' },
  done: { icon: 'pass', tone: 'var(--ui-text-tertiary)' },
  archived: { icon: 'archive', tone: 'var(--ui-text-quaternary)' }
}
const meta = s => STATUS[s] || STATUS.todo

const MODES = [
  { id: 'running', label: 'Running + lineage' },
  { id: 'open', label: 'Open' },
  { id: 'all', label: 'All' }
]
const MODE_PARAMS = { running: { focus: 'running' }, open: { hide: 'done' }, all: {} }

// Module state, bound in register() and reset on dispose.
let api = null
const $now = atom(Math.floor(Date.now() / 1000))
const $mode = atom('running')
const $board = atom(ALL)
const $arrange = atom('flow')
const $socket = atom('off')

// --- deep link ---
// The view's named state lives in the route, so every door lands on the same page: the sidebar,
// the palette row, a pasted `hermes://open/kanban-graph?task=<board>/<id>`, an OS deep link, a
// notification body click. Carried: selection, filter mode, board, arrange mode. Not carried:
// camera position, search text and the status-chip toggles, which are per-visit fiddling.
// Every param is always written, so a copied link fully determines the view; a param that is
// absent falls back to the remembered preference, so a bare `#/kanban-graph` still works.

function readRoute() {
  const [path, qs = ''] = window.location.hash.replace(/^#/, '').split('?')
  if (path !== PATH) return null
  const q = new URLSearchParams(qs)
  return { task: q.get('task') || null, mode: q.get('mode'), board: q.get('board'), arrange: q.get('arrange') }
}

function routePath({ task, mode, board, arrange }) {
  const q = new URLSearchParams()
  if (task) q.set('task', task)
  if (mode) q.set('mode', mode)
  if (board) q.set('board', board)
  if (arrange) q.set('arrange', arrange)
  const qs = q.toString()
  return qs ? `${PATH}?${qs}` : PATH
}

function onRoute() {
  return (window.location.hash || '').replace(/^#/, '').split('?')[0] === PATH
}

// Does this payload belong to the view currently on screen? A query key change renders once
// BEFORE the new fetch starts, so the payload in hand is still the previous view's; react-query's
// isFetching is false in that frame. The backend echoes the filter it applied (`focus`/`hidden`),
// so the payload identifies itself and the stale frame is recognisable.
function payloadIsFor(g, mode, board) {
  const want = MODE_PARAMS[mode] || {}
  const focus = (want.focus || '').split(',').filter(Boolean).sort()
  const hidden = [...(want.hide || '').split(',').filter(Boolean), 'archived'].sort()
  const got = (g.focus || []).slice().sort()
  const gotHidden = (g.hidden || []).slice().sort()
  if (got.length !== focus.length || gotHidden.length !== hidden.length) return false
  if (!focus.every((v, i) => v === got[i]) || !hidden.every((v, i) => v === gotHidden[i])) return false
  return board === ALL || g.boards.length === 1
}

// Adopt a route's values: a present param wins, an absent one keeps the remembered preference.
// Only real choices are persisted, so a bare link never overwrites what the user last picked.
function applyRoute(r) {
  if (r.mode && MODES.some(m => m.id === r.mode) && r.mode !== $mode.get()) {
    $mode.set(r.mode)
    api?.storage.set('mode', r.mode)
  }
  if (r.board && r.board !== $board.get()) {
    $board.set(r.board)
    api?.storage.set('board', r.board)
  }
  if (r.arrange && KG_MODES.some(([m]) => m === r.arrange) && r.arrange !== $arrange.get()) {
    $arrange.set(r.arrange)
    api?.storage.set('arrange', r.arrange)
  }
}

// replaceState, never `location.hash =`: the hash router would treat a write as a navigation and
// remount the page on every click, and Back would walk one entry per selection.
function writeRoute(view) {
  if (!onRoute()) return
  const path = routePath(view)
  if (window.location.hash.replace(/^#/, '') === path) return
  window.history.replaceState(null, '', `#${path}`)
}

const CSS = `
@property --kg-arc-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.kg-page{--kg-anim:${ANIM_MS}ms;position:relative;height:100%;width:100%;overflow:hidden;outline:none;color:var(--ui-text-primary)}
.kg-bar{position:absolute;inset:0 0 auto 0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--ui-stroke-secondary);background:color-mix(in srgb,var(--ui-bg-chrome) 85%,transparent);backdrop-filter:blur(10px)}
.kg-bar .kg-sp{flex:1}
.kg-bar .kg-seg{grid-auto-columns:auto}
.kg-bar .kg-grp{display:inline-flex;align-items:center;gap:6px}
.kg-foot{position:absolute;inset:auto 0 0 0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:5px 10px;border-top:1px solid var(--ui-stroke-secondary);background:color-mix(in srgb,var(--ui-bg-chrome) 85%,transparent);backdrop-filter:blur(10px)}
.kg-chip{--c:var(--ui-text-tertiary);display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px 0 6px;border:1px solid color-mix(in srgb,var(--c) 35%,var(--ui-stroke-secondary));border-radius:999px;font-size:12px;cursor:pointer;user-select:none;background:color-mix(in srgb,var(--c) 12%,transparent);color:inherit;transition:opacity .15s,border-color .15s,background .15s}
.kg-chip:hover{border-color:color-mix(in srgb,var(--c) 70%,var(--ui-stroke-secondary))}
.kg-chip .codicon{color:var(--c)}
.kg-chip.off{opacity:.35;background:transparent;border-color:var(--ui-stroke-secondary);filter:grayscale(1)}
.kg-chip b{font-weight:600;font-variant-numeric:tabular-nums}
.kg-stage{position:absolute;inset:0;cursor:grab;touch-action:none}
.kg-stage.drag{cursor:grabbing}
.kg-world{position:absolute;left:0;top:0;transform-origin:0 0}
.kg-world svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.kg-band{position:absolute;left:0;top:0;border:1px dashed var(--ui-stroke-secondary);border-radius:12px;pointer-events:none}
.kg-band-t{position:absolute;left:24px;right:24px;top:12px;line-height:1.2;font-weight:600;color:var(--ui-text-secondary)}
.kg-band-t>*{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kg-band-t small{font-size:.62em;font-weight:400;color:var(--ui-text-tertiary)}
.kg-edge{fill:none;stroke:var(--ui-stroke-primary);stroke-width:1.6}
.kg-edge.hl{stroke:var(--ui-accent);stroke-width:2.4}
.kg-node{position:absolute;left:0;top:0;display:flex;animation:kg-in .25s ease-out;flex-direction:column;justify-content:center;gap:3px;padding:0 10px 0 14px;border:1px solid var(--ui-stroke-secondary);border-radius:8px;background:var(--ui-bg-elevated);cursor:pointer;overflow:hidden}
.kg-node:hover{border-color:var(--ui-accent)}
.kg-node.sel{border:2px solid var(--ui-accent)}
.kg-node.rel{border-color:var(--ui-accent)}
.kg-node .kg-stripe{position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:0 2px 2px 0}
.kg-arc{position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;pointer-events:none;background:conic-gradient(from var(--kg-arc-angle),transparent 0deg,var(--kg-tone,var(--ui-green)) 55deg,transparent 110deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:kg-arc-spin 2.2s linear infinite}
.kg-arc.stale{--kg-tone:var(--ui-yellow);animation-duration:6s}
@keyframes kg-arc-spin{to{--kg-arc-angle:360deg}}
:root[data-renderer-animations-paused] .kg-arc{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.kg-arc{animation:none;--kg-arc-angle:300deg}}
@keyframes kg-in{from{opacity:0}}
.kg-world.kg-anim,.kg-world.kg-anim .kg-node,.kg-world.kg-anim .kg-band{transition:transform var(--kg-anim) ease,width var(--kg-anim) ease,height var(--kg-anim) ease}
.kg-world.kg-anim .kg-edge{transition:d var(--kg-anim) ease}
@media (prefers-reduced-motion:reduce){.kg-world.kg-anim,.kg-world.kg-anim *{transition:none!important;animation:none!important}}
.kg-node .kg-t{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;white-space:nowrap}
.kg-node .kg-t span{overflow:hidden;text-overflow:ellipsis}
.kg-node .kg-s{font-size:11px;color:var(--ui-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kg-dim{opacity:.16}
.kg-hint{margin-left:auto;min-width:0;font-size:11.5px;color:var(--ui-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kg-panel{position:absolute;top:0;right:0;bottom:0;z-index:4;width:min(460px,92%);display:flex;flex-direction:column;border-left:1px solid var(--ui-stroke-secondary);background:var(--ui-bg-chrome)}
.kg-panel header{display:flex;align-items:flex-start;gap:6px;padding:12px;border-bottom:1px solid var(--ui-stroke-secondary)}
.kg-panel header h2{flex:1;margin:0;font-size:14px;word-break:break-word}
.kg-pbody{overflow:auto;padding:10px 12px 20px;font-size:12.5px}
.kg-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-bottom:10px}
.kg-kv>span:nth-child(odd){color:var(--ui-text-tertiary)}
.kg-pill{display:inline-flex;align-items:center;gap:4px;padding:0 7px;border:1px solid currentColor;border-radius:999px;font-size:11.5px;font-weight:600}
.kg-pbody h3{margin:12px 0 4px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ui-text-tertiary)}
.kg-pbody pre{margin:4px 0 10px;padding:8px;white-space:pre-wrap;word-break:break-word;border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:var(--ui-bg-editor);font:11.5px/1.45 var(--font-mono,ui-monospace,monospace)}
.kg-rl{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer}
.kg-rl:hover{background:var(--ui-row-hover-background)}
.kg-rl small{margin-left:auto;white-space:nowrap;color:var(--ui-text-tertiary)}
.kg-runs{width:100%;border-collapse:collapse;font-size:11.5px;margin:4px 0 10px}
.kg-runs td{padding:2px 6px 2px 0;vertical-align:top;border-top:1px solid var(--ui-stroke-secondary)}
.kg-acts{margin:4px 0 10px;font:11px/1.4 var(--font-mono,ui-monospace,monospace)}
.kg-acts>div{display:grid;grid-template-columns:44px 96px 1fr;gap:6px;padding:2px 0;border-top:1px solid var(--ui-stroke-secondary)}
.kg-acts b{font-weight:600;color:var(--ui-green)}
.kg-acts span:last-child{display:-webkit-box;overflow:hidden;word-break:break-word;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.kg-live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px}
`

// --- formatting ---

const fmt = t => (t ? new Date(t * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '')
const hm = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function dur(s) {
  s = Math.max(0, Math.round(s))
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
}
const curRun = t => (t.runs || []).find(u => u.s === 'running')

// --- data ---

function graphPath(mode, board) {
  const q = new URLSearchParams(MODE_PARAMS[mode] || {})
  if (board !== ALL) q.set('board', board)
  const s = q.toString()
  return s ? `/graph?${s}` : '/graph'
}

// Data is per backend: a gateway or profile switch must neither reuse nor show another backend's graph.
function useBackend() {
  return { conn: useValue(host.state.connectionId) ?? '', profile: useValue(host.state.profile) ?? '' }
}

function useGraph(mode, board) {
  const { conn, profile } = useBackend()
  const live = useValue($socket) === 'live'
  return useQuery({
    queryKey: [ID, 'graph', conn, profile, mode, board],
    queryFn: () => (api ? api.rest(graphPath(mode, board)) : Promise.reject(new Error('kanban-graph not loaded'))),
    placeholderData: (prev, prevQuery) => (prevQuery && prevQuery.queryKey[2] === conn && prevQuery.queryKey[3] === profile ? prev : undefined),
    refetchInterval: live ? 60_000 : 15_000
  })
}

function useBoards() {
  const { conn, profile } = useBackend()
  return useQuery({
    queryKey: [ID, 'boards', conn, profile],
    queryFn: () => api.rest('/boards'),
    staleTime: 60_000
  })
}

function derive(g) {
  const byK = new Map(g.tasks.map(t => [t.k, t]))
  const up = new Map(g.tasks.map(t => [t.k, []]))
  const down = new Map(g.tasks.map(t => [t.k, []]))
  for (const [p, c] of g.links) {
    down.get(p)?.push(c)
    up.get(c)?.push(p)
  }
  return { byK, up, down }
}

function walk(k, map, acc) {
  for (const n of map.get(k) || []) {
    if (!acc.has(n)) {
      acc.add(n)
      walk(n, map, acc)
    }
  }
  return acc
}

const NW = 240, NH = 58

// kg:layout-start (snapshot/kanban_graph.py inlines everything up to kg:layout-end; keep both markers)
// --- layout: rerun on every visibility change, over the visible tasks only ---
// kanban_graph.py inlines this block (up to the pan + zoom marker) into the static snapshot, so it
// may only use NW, NH and names it defines itself.

const GAP_X = 80, GAP_Y = 18, GAP_DOWN = 64, COMP_GAP = 44
const BAND_GAP = 90, BAND_HEAD = 72, BAND_MIN_W = 600, GRID_COLS = 5
// Band header: title plus a .62em subtitle, 12 px from the band's top edge, inside the BAND_HEAD + 8
// strip above the first card row. It grows as you zoom out, capped so both lines stay in the strip.
const HEAD_TOP = 12, HEAD_FS_MAX = Math.floor((BAND_HEAD + 8 - HEAD_TOP - 8) / (1.2 + 0.62 * 1.2))
const kgHeadFont = scale => Math.min(HEAD_FS_MAX, Math.max(15, 13 / scale))
const ORDER_SWEEPS = 4, PLACE_SWEEPS = 4

// Arrange modes. flow and down are the classic layered drawing (the Sugiyama scheme dagre and ELK
// use): longest-path layers, barycenter ordering, then each task centred on its neighbours.
const KG_MODES = [
  ['flow', 'Flow, left to right'],
  ['down', 'Flow, top down'],
  ['status', 'Columns by status'],
  ['grid', 'Compact grid']
]

// Longest path from the sources, then every task with children moves to sit just before its
// earliest child, so a prerequisite is drawn next to what needs it instead of back in column 0.
function kgLayers(nodes, parents, children, ord) {
  const indeg = new Map(nodes.map(n => [n, parents.get(n).length]))
  const depth = new Map(nodes.map(n => [n, 0]))
  const topo = nodes.filter(n => !indeg.get(n)).sort((a, b) => ord.get(a) - ord.get(b))
  for (let i = 0; i < topo.length; i++) {
    for (const c of children.get(topo[i])) {
      depth.set(c, Math.max(depth.get(c), depth.get(topo[i]) + 1))
      indeg.set(c, indeg.get(c) - 1)
      if (!indeg.get(c)) topo.push(c)
    }
  }
  for (let i = topo.length - 1; i >= 0; i--) {
    const kids = children.get(topo[i])
    if (kids.length) depth.set(topo[i], Math.min(...kids.map(c => depth.get(c))) - 1)
  }
  return depth
}

const kgMean = (xs, f, dflt) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : dflt)

// One linked component in abstract units: layer index along the flow, slot across it.
function kgDag(comp, links, ord) {
  const parents = new Map(comp.map(k => [k, []])), children = new Map(comp.map(k => [k, []]))
  for (const [p, c] of links) { parents.get(c).push(p); children.get(p).push(c) }
  const depth = kgLayers(comp, parents, children, ord)
  const lo = Math.min(...depth.values())
  const L = []
  for (const n of [...comp].sort((a, b) => ord.get(a) - ord.get(b))) {
    const d = depth.get(n) - lo
    while (L.length <= d) L.push([])
    L[d].push(n)
  }
  const at = new Map()
  L.forEach(l => l.forEach((n, i) => at.set(n, i)))
  for (let s = 0; s < ORDER_SWEEPS; s++) {
    const nb = s % 2 ? children : parents
    for (const l of s % 2 ? [...L].reverse() : L) {
      const key = new Map(l.map(n => [n, kgMean(nb.get(n), m => at.get(m), at.get(n))]))
      l.sort((a, b) => key.get(a) - key.get(b) || at.get(a) - at.get(b))
      l.forEach((n, i) => at.set(n, i))
    }
  }
  // Slide each task toward the mean of its neighbours, keeping order and one slot of spacing.
  const y = new Map()
  L.forEach(l => l.forEach((n, i) => y.set(n, i - (l.length - 1) / 2)))
  for (let s = 0; s < PLACE_SWEEPS; s++) {
    for (const l of s % 2 ? [...L].reverse() : L) {
      const wish = l.map(n => kgMean([...parents.get(n), ...children.get(n)], m => y.get(m), y.get(n)))
      const out = []
      wish.forEach((w, i) => out.push(i ? Math.max(w, out[i - 1] + 1) : w))
      const shift = kgMean(wish.map((w, i) => w - out[i]), v => v, 0)
      l.forEach((n, i) => y.set(n, out[i] + shift))
    }
  }
  const min = Math.min(...y.values()), max = Math.max(...y.values())
  return { layer: new Map(comp.map(n => [n, depth.get(n) - lo])), slot: new Map([...y].map(([n, v]) => [n, v - min])), layers: L.length, span: max - min + 1 }
}

// Columns as wide as fit a plane of the given shape; returns [cols, cellW, cellH].
function kgGridShape(n, aspect, gapX) {
  const cw = NW + gapX, ch = NH + GAP_Y
  return [Math.max(1, Math.min(n, Math.round(Math.sqrt((n * aspect * ch) / cw)))), cw, ch]
}

function kgBoard(tasks, links, rank, ord, mode) {
  const xy = new Map()
  const status = new Map(tasks.map(t => [t.k, t.s]))
  const byStatus = (a, b) => (rank.get(status.get(a)) ?? 99) - (rank.get(status.get(b)) ?? 99) || ord.get(a) - ord.get(b)
  const ids = tasks.map(t => t.k)

  if (mode === 'grid') {
    const [cols, cw, ch] = kgGridShape(ids.length, 2.2, GAP_X * 0.3)
    ids.sort(byStatus).forEach((n, i) => xy.set(n, [(i % cols) * cw, BAND_HEAD + Math.floor(i / cols) * ch]))
    const rows = Math.ceil(ids.length / cols)
    return { xy, h: BAND_HEAD + rows * ch - GAP_Y, w: Math.max(BAND_MIN_W, cols * cw - GAP_X * 0.3) }
  }

  if (mode === 'status') {
    // One column per status in workflow order; within a column, dependency depth then age.
    const parents = new Map(ids.map(k => [k, []])), children = new Map(ids.map(k => [k, []]))
    for (const [p, c] of links) { parents.get(c).push(p); children.get(p).push(c) }
    const depth = kgLayers(ids, parents, children, ord)
    const cols = [...new Set(ids.map(k => status.get(k)))].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99))
    const maxRows = Math.max(6, Math.ceil(Math.sqrt(ids.length * 2)))
    let x = 0, h = 0
    for (const s of cols) {
      const col = ids.filter(k => status.get(k) === s).sort((a, b) => depth.get(a) - depth.get(b) || ord.get(a) - ord.get(b))
      for (let i = 0; i < col.length; i++) {
        xy.set(col[i], [x + Math.floor(i / maxRows) * (NW + GAP_Y), BAND_HEAD + (i % maxRows) * (NH + GAP_Y)])
      }
      const sub = Math.ceil(col.length / maxRows)
      x += sub * (NW + GAP_Y) - GAP_Y + GAP_X
      h = Math.max(h, BAND_HEAD + Math.min(col.length, maxRows) * (NH + GAP_Y) - GAP_Y)
    }
    return { xy, h, w: Math.max(BAND_MIN_W, x - GAP_X) }
  }

  // flow / down: linked components first (largest first), unlinked tasks gridded after them.
  const root = new Map(ids.map(k => [k, k]))
  const find = v => {
    while (root.get(v) !== v) { root.set(v, root.get(root.get(v))); v = root.get(v) }
    return v
  }
  for (const [p, c] of links) root.set(find(p), find(c))
  const comps = new Map(), compLinks = new Map()
  for (const k of ids) {
    const r = find(k)
    if (!comps.has(r)) comps.set(r, [])
    comps.get(r).push(k)
  }
  for (const l of links) {
    const r = find(l[0])
    if (!compLinks.has(r)) compLinks.set(r, [])
    compLinks.get(r).push(l)
  }
  const linked = [...comps.entries()].filter(([, c]) => c.length > 1)
    .sort(([, a], [, b]) => b.length - a.length || ord.get(a[0]) - ord.get(b[0]))
  const single = [...comps.values()].filter(c => c.length === 1).map(c => c[0]).sort(byStatus)

  const down = mode === 'down'
  let y = BAND_HEAD, x = 0, w = 0, rowH = 0
  for (const [r, comp] of linked) {
    const d = kgDag(comp, compLinks.get(r) || [], ord)
    if (down) {
      // Components side by side, each flowing downward.
      const sx = NW + GAP_Y * 2, cw = d.span * sx - GAP_Y * 2
      for (const n of comp) xy.set(n, [x + d.slot.get(n) * sx, y + d.layer.get(n) * (NH + GAP_DOWN)])
      x += cw + COMP_GAP * 2
      rowH = Math.max(rowH, d.layers * (NH + GAP_DOWN) - GAP_DOWN)
      w = Math.max(w, x - COMP_GAP * 2)
    } else {
      for (const n of comp) xy.set(n, [d.layer.get(n) * (NW + GAP_X), y + d.slot.get(n) * (NH + GAP_Y)])
      y += d.span * (NH + GAP_Y) - GAP_Y + COMP_GAP
      w = Math.max(w, d.layers * (NW + GAP_X) - GAP_X)
    }
  }
  if (down && linked.length) y += rowH + COMP_GAP
  if (linked.length && !single.length) y -= COMP_GAP
  const cellW = NW + GAP_X * 0.3
  const cols = Math.max(GRID_COLS, Math.floor((w + GAP_X * 0.3) / cellW))
  single.forEach((n, i) => xy.set(n, [(i % cols) * cellW, y + Math.floor(i / cols) * (NH + GAP_Y)]))
  if (single.length) {
    y += Math.ceil(single.length / cols) * (NH + GAP_Y) - GAP_Y
    w = Math.max(w, Math.min(single.length, cols) * cellW - GAP_X * 0.3)
  }
  return { xy, h: y, w: Math.max(w, BAND_MIN_W) }
}

// Transitive reduction: A>C is redundant when A still reaches C through other visible tasks, so
// only the links that carry new reachability are drawn and laid out. Lineage walks use all links.
function kgReduce(links) {
  const kids = new Map()
  for (const [p, c] of links) {
    if (!kids.has(p)) kids.set(p, [])
    kids.get(p).push(c)
  }
  const reachesAround = (p, c) => {
    const seen = new Set([p]), stack = (kids.get(p) || []).filter(k => k !== c)
    while (stack.length) {
      const n = stack.pop()
      if (n === c) return true
      if (seen.has(n)) continue
      seen.add(n)
      for (const k of kids.get(n) || []) if (!seen.has(k)) stack.push(k)
    }
    return false
  }
  return links.filter(([p, c]) => !reachesAround(p, c))
}

// Where each link attaches: a card's outgoing links fan out along its exit side and its incoming
// links along its entry side, ordered by the far end, so converging arrows do not share one tip.
const PORT_DOWN = 22, PORT_FLOW = 11
function kgPorts(links, pos, down) {
  const out = new Map(), inn = new Map(), off = new Map()
  for (const l of links) {
    if (!out.has(l[0])) out.set(l[0], [])
    if (!inn.has(l[1])) inn.set(l[1], [])
    out.get(l[0]).push(l)
    inn.get(l[1]).push(l)
  }
  const axis = down ? 0 : 1, step = down ? PORT_DOWN : PORT_FLOW, span = (down ? NW : NH) * 0.6
  const spread = (groups, end, far) => {
    for (const ls of groups.values()) {
      ls.sort((a, b) => pos.get(a[far])[axis] - pos.get(b[far])[axis] || pos.get(a[far])[1 - axis] - pos.get(b[far])[1 - axis])
      const s = ls.length > 1 ? Math.min(step, span / (ls.length - 1)) : 0
      ls.forEach((l, i) => {
        const key = `${l[0]}>${l[1]}`
        if (!off.has(key)) off.set(key, [0, 0])
        off.get(key)[end] = (i - (ls.length - 1) / 2) * s
      })
    }
  }
  spread(out, 0, 1)
  spread(inn, 1, 0)
  return off
}

// Parent to child. Forward edges leave the right side and enter the left; in a top-down layout
// they run bottom to top; anything else (backward or same column) loops around the side.
// oa and ob shift the exit and entry points along their side (see kgPorts).
function kgEdge(a, b, down, oa = 0, ob = 0) {
  if (down && b[1] >= a[1] + NH) {
    const x1 = a[0] + NW / 2 + oa, y1 = a[1] + NH, x2 = b[0] + NW / 2 + ob, y2 = b[1], dy = Math.max(24, (y2 - y1) / 2)
    return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`
  }
  const y1 = a[1] + NH / 2 + (down ? 0 : oa), y2 = b[1] + NH / 2 + (down ? 0 : ob)
  if (b[0] >= a[0] + NW) {
    const x1 = a[0] + NW, x2 = b[0], dx = Math.max(30, (x2 - x1) / 2)
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
  }
  if (b[0] + NW <= a[0]) {
    const x1 = a[0], x2 = b[0] + NW, dx = Math.max(30, (x1 - x2) / 2)
    return `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}`
  }
  const x = a[0] + NW, bulge = 28 + Math.min(60, Math.abs(y2 - y1) / 6)
  return `M${x},${y1} C${x + bulge},${y1} ${x + bulge},${y2} ${x},${y2}`
}

// Lay out each board on its visible tasks, then pack the boards into rows that match the viewport's
// shape, tallest first, so the plane fills the screen instead of one long strip.
function kgLayout(g, shown, aspect = 1.6, mode = 'flow') {
  const rank = new Map(g.statuses.map((s, i) => [s, i]))
  const ord = new Map(g.tasks.map((t, i) => [t.k, i]))
  const board = new Map(g.tasks.map(t => [t.k, t.b]))
  const tasksBy = new Map(), linksBy = new Map()
  for (const t of g.tasks) {
    if (!shown.has(t.k)) continue
    if (!tasksBy.has(t.b)) tasksBy.set(t.b, [])
    tasksBy.get(t.b).push(t)
  }
  const visible = g.links.filter(([p, c]) => shown.has(p) && shown.has(c))
  const links = kgReduce(visible)
  for (const l of links) {
    const b = board.get(l[0])
    if (!linksBy.has(b)) linksBy.set(b, [])
    linksBy.get(b).push(l)
  }
  const placed = g.boards.filter(b => tasksBy.has(b.slug))
    .map(b => ({ b, n: tasksBy.get(b.slug).length, ...kgBoard(tasksBy.get(b.slug), linksBy.get(b.slug) || [], rank, ord, mode) }))
  const area = placed.reduce((s, p) => s + (p.w + BAND_GAP) * (p.h + BAND_GAP), 0)
  const shelfW = Math.max(Math.sqrt(area * aspect), ...placed.map(p => p.w))
  const pos = new Map(), bands = []
  let x = 0, y = 0, rowH = 0
  for (const p of [...placed].sort((a, b) => b.h - a.h)) {
    if (x > 0 && x + p.w > shelfW) { x = 0; y += rowH + BAND_GAP; rowH = 0 }
    for (const [k, [tx, ty]] of p.xy) pos.set(k, [x + tx, y + ty])
    bands.push({ ...p.b, x, y, w: p.w, h: p.h, shown: p.n })
    x += p.w + BAND_GAP
    rowH = Math.max(rowH, p.h)
  }
  const down = mode === 'down', ports = kgPorts(links, pos, down)
  const routes = new Map(links.map(([p, c]) => {
    const key = `${p}>${c}`, [oa, ob] = ports.get(key)
    return [key, kgEdge(pos.get(p), pos.get(c), down, oa, ob)]
  }))
  let box = null
  for (const b of bands) {
    box = box || [Infinity, Infinity, -Infinity, -Infinity]
    box = [Math.min(box[0], b.x - 24), Math.min(box[1], b.y - 8), Math.max(box[2], b.x + b.w + 24), Math.max(box[3], b.y + b.h + 8)]
  }
  // Grid mode packs for density, not structure: arrows would only add noise until a selection.
  return { pos, bands, links, implied: visible.length - links.length, routes, box, quiet: mode === 'grid' }
}

// kg:layout-end

// --- pan + zoom (DOM-direct so drags never re-render the graph) ---

function useViewport(stageRef, worldRef, onScale) {
  const v = useRef({ x: 0, y: 0, s: 1 })
  const animT = useRef(null)
  // Camera moves caused by a re-layout use the same transition as the nodes, so a pinned task
  // stays put on screen while everything else slides.
  const animate = useCallback(on => {
    const w = worldRef.current
    if (!w) return
    clearTimeout(animT.current)
    w.classList.toggle('kg-anim', on)
    if (on) animT.current = setTimeout(() => w.classList.remove('kg-anim'), ANIM_MS + 50)
  }, [worldRef])
  const apply = useCallback(() => {
    const w = worldRef.current
    if (w) w.style.transform = `translate(${v.current.x}px,${v.current.y}px) scale(${v.current.s})`
    onScale(v.current.s)
  }, [worldRef, onScale])
  const zoomAt = useCallback((f, cx, cy) => {
    const c = v.current, ns = Math.min(3, Math.max(0.05, c.s * f))
    c.x = cx - ((cx - c.x) * ns) / c.s
    c.y = cy - ((cy - c.y) * ns) / c.s
    c.s = ns
    animate(false)
    apply()
  }, [apply, animate])
  const fitBox = useCallback((box, topPad, rightPad, anim = false, bottomPad = 30) => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r || !box) return
    const [x0, y0, x1, y1] = box
    const W = r.width - rightPad - 40, H = r.height - topPad - bottomPad
    const s = Math.min(1.4, W / (x1 - x0), H / (y1 - y0))
    v.current = { s, x: 20 - x0 * s + (W - (x1 - x0) * s) / 2, y: topPad - y0 * s + (H - (y1 - y0) * s) / 2 }
    animate(anim)
    apply()
  }, [stageRef, apply, animate])
  const shift = useCallback((dx, dy) => {
    v.current.x += dx * v.current.s
    v.current.y += dy * v.current.s
    animate(true)
    apply()
  }, [apply, animate])
  const centerOn = useCallback((x, y, rightPad) => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return
    const c = v.current
    c.s = Math.max(c.s, 0.9)
    c.x = (r.width - rightPad) / 2 - x * c.s
    c.y = r.height / 2 - y * c.s
    animate(true)
    apply()
  }, [stageRef, apply, animate])
  return { v, apply, animate, zoomAt, fitBox, shift, centerOn }
}

// --- components ---

// Same signal as the app's kanban cards (plugins/kanban/ui.tsx): a heartbeat older than 2 min
// means the worker may be gone, so the arc slows down and turns amber.
const STALE_HEARTBEAT_S = 120
function Arc({ hb }) {
  const now = useValue($now)
  return h('span', { 'aria-hidden': true, className: `kg-arc${hb && now - hb > STALE_HEARTBEAT_S ? ' stale' : ''}` })
}

function LiveDuration({ since, suffix = '' }) {
  const now = useValue($now)
  return h(Fragment, null, dur(now - since) + suffix)
}

// Card and band sublines: HTML collapses repeated spaces, so fields need a visible separator.
const SEP = ' · '
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

const Node = ({ t, at, cls, onPick }) => {
  const m = meta(t.s), run = curRun(t), warn = t.f > 0 || t.bk
  const sub = [t.id, t.a, t.m && t.m.replace('claude-', '')].filter(Boolean).join(SEP)
  return h('div', {
    className: `kg-node${run ? ' live' : ''}${cls}`,
    style: { transform: `translate(${at[0]}px,${at[1]}px)`, width: NW, height: NH },
    title: t.t,
    'data-k': t.k,
    'data-id': t.id,
    onClick: e => { e.stopPropagation(); onPick(t.k) }
  },
    h('div', { className: 'kg-stripe', style: { background: m.tone } }),
    run ? h(Arc, { hb: run.hb || t.hb }) : null,
    h('div', { className: 'kg-t' },
      h(Codicon, { name: m.icon, style: { color: m.tone }, spinning: !!run }),
      h('span', null, t.t),
      warn ? h('span', { title: [t.bk && `Blocked: ${t.bk}`, t.f > 0 && `${t.f} failed run${t.f > 1 ? 's' : ''}`].filter(Boolean).join('. '), style: { marginLeft: 'auto', display: 'inline-flex' } },
        h(Codicon, { name: 'warning', style: { color: 'var(--ui-red)' } })) : null),
    h('div', { className: 'kg-s', style: run ? { color: 'var(--ui-green)' } : null },
      run ? h(Fragment, null, 'running ', h(LiveDuration, { since: run.a }), t.a ? `${SEP}${t.a}` : '') : sub))
}

function Row({ t, onPick }) {
  const m = meta(t.s)
  return h('div', { className: 'kg-rl', onClick: () => onPick(t.k, true) },
    h(Codicon, { name: m.icon, style: { color: m.tone } }),
    h('span', null, t.t),
    h('small', null, t.id))
}

function KV({ rows }) {
  const kept = rows.filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== 0 && v !== false)
  return h('div', { className: 'kg-kv' }, ...kept.flatMap(([k, v], i) => [h('span', { key: `k${i}` }, k), h('span', { key: `v${i}` }, v)]))
}

function LiveRun({ t, run, generated }) {
  const L = t.live
  const rows = [
    ['Run', `#${run.id} on ${run.pr}`],
    ['Running for', h(Fragment, null, h(LiveDuration, { since: run.a }), ` (since ${fmt(run.a)})`)],
    ['Heartbeat', run.hb ? h(LiveDuration, { since: run.hb, suffix: ' ago' }) : 'none yet'],
    ['Runtime cap', t.mx ? dur(t.mx) : ''],
    ['First claimed', t.st ? fmt(t.st) : '']
  ]
  if (L && !L.err) {
    rows.push(
      ['Session', L.sid],
      ['Activity', `${L.calls} tool calls, ${L.api} API calls, ${L.msgs} msgs`],
      ['Tokens', `${(L.out / 1000).toFixed(1)}k out, ${(L.cr / 1e6).toFixed(2)}M cache read`],
      ['Est. cost', L.cost != null ? `$${Number(L.cost).toFixed(2)}` : ''],
      ['Last activity', L.last ? `${L.desc} (${hm(L.last)})` : '']
    )
  }
  return h(Fragment, null,
    h('h3', null, `Live run (data ${hm(generated)})`),
    h(KV, { rows }),
    L && L.err ? h('pre', null, L.err) : null,
    L && L.say ? h(Fragment, null, h('h3', null, 'Last worker note'), h('pre', null, L.say)) : null,
    L && L.acts && L.acts.length
      ? h(Fragment, null,
        h('h3', null, `Recent actions (newest first, ${L.acts.length})`),
        h('div', { className: 'kg-acts' }, ...L.acts.map(([ts, n, a], i) =>
          h('div', { key: i }, h('span', null, hm(ts)), h('b', null, n), h('span', null, a)))))
      : null)
}

function Panel({ t, A, B, byK, hidden, generated, onPick, onClose }) {
  const m = meta(t.s), run = curRun(t)
  const sortK = s => [...s].sort((a, b) => (byK.get(a).c || 0) - (byK.get(b).c || 0))
  const cli = `hermes kanban --board ${t.b} show ${t.id}`
  return h('aside', { className: 'kg-panel', onClick: e => e.stopPropagation(), onPointerDown: e => e.stopPropagation() },
    h('header', null,
      h('h2', null, t.t),
      h(Tip, { label: 'Close (Esc)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: onClose, 'aria-label': 'Close' }, h(Codicon, { name: 'close' })))),
    h('div', { className: 'kg-pbody' },
      h(KV, { rows: [
        ['Status', h(Fragment, null, h('span', { className: 'kg-pill', style: { color: m.tone } }, h(Codicon, { name: m.icon }), t.s), t.bk ? ` (${t.bk})` : '')],
        ['Id', t.id], ['Board', t.b], ['Assignee', t.a], ['Model', [t.m, t.e].filter(Boolean).join(' / ')],
        ['Priority', t.p || ''], ['Created', fmt(t.c)], ['Started', fmt(t.st)], ['Completed', fmt(t.d)], ['Failures', t.f || '']
      ] }),
      A.size ? h(Fragment, null, h('h3', null, `Upstream (${A.size})`), ...sortK(A).map(k => h(Row, { key: k, t: byK.get(k), onPick }))) : null,
      B.size ? h(Fragment, null, h('h3', null, `Downstream (${B.size})`), ...sortK(B).map(k => h(Row, { key: k, t: byK.get(k), onPick }))) : null,
      !A.size && !B.size ? h(Fragment, null, h('h3', null, 'Linked tasks'), h('div', { style: { color: 'var(--ui-text-tertiary)' } }, t.hx ? 'None shown.' : 'None: this task has no parent or child links.')) : null,
      t.hx ? h('div', { style: { color: 'var(--ui-text-tertiary)', margin: '4px 0' } }, `${t.hx.p} parent and ${t.hx.c} child links go to tasks outside this view${hidden.length ? ` (hidden: ${hidden.join(', ')})` : ''}.`) : null,
      run ? h(LiveRun, { t, run, generated }) : null,
      t.runs && t.runs.length
        ? h(Fragment, null, h('h3', null, `Runs (${t.runs.length})`),
          h('table', { className: 'kg-runs' }, h('tbody', null, ...t.runs.slice().reverse().map(u =>
            h('tr', { key: u.id }, h('td', null, `#${u.id}`), h('td', null, u.o || u.s), h('td', null, fmt(u.a)),
              h('td', null, u.z ? dur(u.z - u.a) : h(LiveDuration, { since: u.a }) ), h('td', null, u.e))))))
        : null,
      t.err ? h(Fragment, null, h('h3', null, 'Last failure'), h('pre', null, t.err)) : null,
      t.res ? h(Fragment, null, h('h3', null, 'Result'), h('pre', null, t.res)) : null,
      t.body ? h(Fragment, null, h('h3', null, 'Body'), h('pre', null, t.body)) : null,
      h('h3', null, 'CLI'),
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 6 } },
        h('pre', { style: { flex: 1, margin: 0 } }, cli),
        h(CopyButton, { text: cli, label: 'Copy command' }))))
}

function Toolbar({ boards, search, setSearch, onFit, onZoom, failed }) {
  const mode = useValue($mode), board = useValue($board), arrange = useValue($arrange), sock = useValue($socket)
  // A failing graph fetch outranks the socket: the socket can be live on a different backend.
  const link = failed ? 'offline' : sock === 'live' ? 'live' : 'polling'
  const linkTip = { live: 'Live: board events stream in', polling: 'Polling every 15 s (event socket unavailable)', offline: `Backend unreachable: ${failed}` }[link]
  return h('div', { className: 'kg-bar', onPointerDown: e => e.stopPropagation(), onClick: e => e.stopPropagation() },
    h(Codicon, { name: 'type-hierarchy', style: { color: 'var(--ui-accent)' } }),
    h('strong', { style: { fontSize: 13, marginRight: 4 } }, 'Kanban graph'),
    h(SegmentedControl, { className: 'kg-seg', options: MODES, value: mode, onChange: id => { $mode.set(id); api?.storage.set('mode', id) } }),
    h('div', { style: { flex: '1 1 140px', maxWidth: 260 } }, h(SearchField, { value: search, onChange: setSearch, placeholder: 'Search id, title, assignee' })),
    h(Select, { value: board, onValueChange: v => { $board.set(v); api?.storage.set('board', v) } },
      h(SelectTrigger, { style: { width: 180 }, 'aria-label': 'Board' }, h(SelectValue, null)),
      h(SelectContent, null,
        h(SelectItem, { value: ALL }, 'All boards'),
        ...(boards || []).map(b => h(SelectItem, { key: b.slug, value: b.slug }, b.name)))),
    h(Select, { value: arrange, onValueChange: v => { $arrange.set(v); api?.storage.set('arrange', v) } },
      h(SelectTrigger, { style: { width: 150 }, 'aria-label': 'Arrange' }, h(SelectValue, null)),
      h(SelectContent, null, ...KG_MODES.map(([id, label]) => h(SelectItem, { key: id, value: id }, label)))),
    h('span', { className: 'kg-sp' }),
    // Status and zoom wrap as one group, so a narrow window never strands a lone button on row two.
    h('span', { className: 'kg-grp' },
    h(Tip, { label: linkTip },
      h('span', { style: { fontSize: 11.5, color: 'var(--ui-text-tertiary)', display: 'inline-flex', alignItems: 'center' } },
        h('span', { className: 'kg-live-dot', style: { background: link === 'live' ? 'var(--ui-green)' : link === 'offline' ? 'var(--ui-red)' : 'var(--ui-text-quaternary)' } }),
        link)),
    h(Tip, { label: 'Zoom out (-)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: () => onZoom(0.8), 'aria-label': 'Zoom out' }, h(Codicon, { name: 'zoom-out' }))),
    h(Tip, { label: 'Fit (0)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: onFit, 'aria-label': 'Fit' }, h(Codicon, { name: 'screen-full' }))),
    h(Tip, { label: 'Zoom in (+)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: () => onZoom(1.25), 'aria-label': 'Zoom in' }, h(Codicon, { name: 'zoom-in' })))))
}

// Status filters (icon and count, the name is in the tooltip) and the status line.
function Footer({ g, off, toggle, hint, footRef }) {
  const present = g ? g.statuses.filter(s => g.tasks.some(t => t.s === s)) : []
  const counts = s => g.tasks.filter(t => t.s === s).length
  return h('div', { ref: footRef, className: 'kg-foot', onPointerDown: e => e.stopPropagation(), onClick: e => e.stopPropagation() },
    ...present.map(s => h(Tip, { key: s, label: `${s} (${counts(s)}). Click: toggle. Shift+click: only ${s}.` },
      h('button', {
        type: 'button', className: `kg-chip${off.has(s) ? ' off' : ''}`, style: { '--c': meta(s).tone }, 'aria-label': s, 'aria-pressed': !off.has(s),
        onMouseDown: e => e.shiftKey && e.preventDefault(),
        onClick: e => toggle(s, e.shiftKey, present)
      }, h(Codicon, { name: meta(s).icon }), h('b', null, counts(s))))),
    h('span', { className: 'kg-hint', title: 'Drag to pan, wheel to zoom, click a task for its lineage, Esc clears.' }, hint))
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function GraphPage() {
  // The deep link is authoritative on entry, so the first query already asks for the linked board
  // and mode. Read once, lazily: an effect would fire after that first fetch had already asked for
  // the remembered view.
  const [entry] = useState(() => {
    const r = readRoute()
    if (r) applyRoute(r)
    return r
  })
  const mode = useValue($mode), board = useValue($board)
  const { data: g, error, isLoading, isFetching, isPlaceholderData } = useGraph(mode, board)
  const { data: boardList } = useBoards()
  const backend = useBackend()
  const [sel, setSel] = useState(() => entry?.task || null)
  const [search, setSearch] = useState('')
  const [off, setOff] = useState(() => new Set())
  const stageRef = useRef(null), worldRef = useRef(null), pageRef = useRef(null), barRef = useRef(null), footRef = useRef(null)
  const arrange = useValue($arrange)
  const bandRefs = useRef([])
  // A selection that arrived from outside the page. The camera centres on it once the layout knows
  // where it is; see the pending-selection effects below.
  const deepTask = useRef(entry?.task || null)
  const onScale = useCallback(s => {
    const fs = kgHeadFont(s)
    for (const el of bandRefs.current) if (el) el.style.fontSize = `${fs}px`
  }, [])
  const vp = useViewport(stageRef, worldRef, onScale)
  const userMoved = useRef(false)
  const fittedFor = useRef('')

  const d = useMemo(() => (g ? derive(g) : null), [g])
  const lineage = useMemo(() => {
    if (!d || !sel || !d.byK.has(sel)) return null
    return { A: walk(sel, d.up, new Set()), B: walk(sel, d.down, new Set()) }
  }, [d, sel])
  const rel = useMemo(() => (lineage ? new Set([...lineage.A, ...lineage.B]) : new Set()), [lineage])

  // A selection that arrived from outside the page is PENDING until the view can show it: a linked
  // task the current filter excludes (a `todo` task under mode=running) widens the view to `all`
  // once rather than landing on nothing, and a task absent even there is dropped so it stops
  // blocking ordinary selection clearing. Both wait for a payload that belongs to the current view.
  useEffect(() => {
    if (!g || !deepTask.current || !payloadIsFor(g, mode, board) || d.byK.has(deepTask.current)) return
    if (mode !== 'all') {
      $mode.set('all')
      api?.storage.set('mode', 'all')
      return
    }
    deepTask.current = null
  }, [g, d, mode, board])

  useEffect(() => {
    if (!g || !deepTask.current || !d.byK.has(deepTask.current)) return
    setSel(deepTask.current)
  }, [g, d])

  // A refresh that drops the selected task clears the selection instead of pointing at nothing.
  useEffect(() => { if (sel && g && !d.byK.has(sel) && !deepTask.current) setSel(null) }, [g, d, sel])

  // A deep link or OS link that arrives while the page is already mounted (notification click,
  // hash edit, palette re-fire) re-applies without a remount. Registered below, next to selRef.

  // Visible set: status chips and search, plus the selection's lineage so a click always shows it.
  const q = useDebounced(search.trim().toLowerCase(), SEARCH_DEBOUNCE_MS)
  const shownSig = useMemo(() => {
    if (!g) return ''
    const match = t => !off.has(t.s) && (!q || [t.id, t.t, t.a, t.b, t.m].some(v => String(v || '').toLowerCase().includes(q)))
    return g.tasks.filter(t => t.k === sel || rel.has(t.k) || match(t)).map(t => t.k).join('\n')
  }, [g, off, q, sel, rel])
  // The board plane is packed to the stage's shape; re-measured only when the visible set changes.
  const lay = useMemo(() => {
    if (!g) return null
    const r = stageRef.current?.getBoundingClientRect()
    return kgLayout(g, new Set(shownSig ? shownSig.split('\n') : []), r && r.height > 0 ? r.width / r.height : 1.6, arrange)
  }, [g, shownSig, arrange])
  const filterSig = `${[...off].sort().join(',')}|${q}|${arrange}`

  const panelW = sel && lineage ? Math.min(460, (stageRef.current?.clientWidth || 900) * 0.92) : 0
  // The wrapper has no height of its own (.kg-bar is absolutely positioned), so measure the bar.
  const barH = () => barRef.current?.firstElementChild?.offsetHeight || 44
  const topPad = () => barH() + 10
  const fit = useCallback((anim = false) => { if (lay) vp.fitBox(lay.box, topPad(), panelW, anim, (footRef.current?.offsetHeight || 34) + 10) }, [lay, vp, panelW])

  // Camera policy per re-layout: first data for a view fits instantly; a filter or search change with
  // nothing selected refits (animated); otherwise one anchor task keeps its screen position (the
  // selection, else the visible task nearest the viewport centre) while the rest slides around it.
  const prev = useRef({ lay: null, filterSig: '' })
  useLayoutEffect(() => {
    const key = `${mode}|${board}`
    const p = prev.current
    if (!lay || isPlaceholderData) { vp.apply(); return }
    if (fittedFor.current !== key) {
      fittedFor.current = key
      userMoved.current = false
      fit(false)
    } else if (p.lay && p.lay !== lay) {
      vp.animate(true)
      const both = k => p.lay.pos.has(k) && lay.pos.has(k)
      let anchor = sel && both(sel) ? sel : null
      if (!anchor && p.filterSig !== filterSig) {
        userMoved.current = false
        fit(true)
      } else {
        if (!anchor) {
          const r = stageRef.current?.getBoundingClientRect(), c = vp.v.current
          if (r) {
            const cx = (r.width / 2 - c.x) / c.s, cy = (r.height / 2 - c.y) / c.s
            let best = Infinity
            for (const [k, [x, y]] of p.lay.pos) {
              if (!lay.pos.has(k)) continue
              const dd = (x + NW / 2 - cx) ** 2 + (y + NH / 2 - cy) ** 2
              if (dd < best) { best = dd; anchor = k }
            }
          }
        }
        if (anchor) {
          const [ox, oy] = p.lay.pos.get(anchor), [nx, ny] = lay.pos.get(anchor)
          if (ox !== nx || oy !== ny) vp.shift(ox - nx, oy - ny)
          else vp.apply()
        } else fit(true)
      }
    } else vp.apply()
    prev.current = { lay, filterSig }
  })

  const fitRef = useRef(fit)
  fitRef.current = fit
  const selRef = useRef(sel)
  selRef.current = sel

  // The URL is the view's address: task, filter mode, board, arrange mode. Written on every change
  // so the address bar, a copied link and any notification `activate` all name the same view.
  useEffect(() => {
    writeRoute({ task: sel, mode, board, arrange })
  }, [sel, mode, board, arrange])

  useEffect(() => {
    const onHash = () => {
      const r = readRoute()
      if (!r) return
      applyRoute(r)
      if (r.task && r.task !== selRef.current) {
        deepTask.current = r.task
        setSel(r.task)
      } else if (!r.task && selRef.current) setSel(null)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Non-null when the selection came from outside the page: the camera centres on it once the
  // layout has placed it, then clears.
  useEffect(() => {
    const k = deepTask.current
    if (!k || !lay || !lay.pos.has(k)) return
    deepTask.current = null
    userMoved.current = false
    vp.animate(true)
    const [x, y] = lay.pos.get(k)
    vp.centerOn(x + NW / 2, y + NH / 2, 470)
  }, [lay, vp])

  useEffect(() => {
    const st = stageRef.current
    if (!st) return undefined
    const onWheel = e => {
      e.preventDefault()
      userMoved.current = true
      const r = st.getBoundingClientRect()
      vp.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top)
    }
    st.addEventListener('wheel', onWheel, { passive: false })
    // One observer for the page's lifetime, on the stage and the toolbar (which wraps on narrow
    // panes and grows when the board list arrives); it fires once on observe, so compare sizes to
    // react only to real resizes (a re-subscribe per layout would refit instantly and cancel the
    // animation).
    let size = ''
    const ro = new ResizeObserver(() => {
      const s = `${st.clientWidth}x${st.clientHeight}x${barH()}`
      if (s === size) return
      const first = !size
      size = s
      if (!first && !userMoved.current && !selRef.current) fitRef.current(false)
    })
    ro.observe(st)
    if (barRef.current?.firstElementChild) ro.observe(barRef.current.firstElementChild)
    return () => { st.removeEventListener('wheel', onWheel); ro.disconnect() }
  }, [vp])

  const drag = useRef(null)
  const onPointerDown = e => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, vx: vp.v.current.x, vy: vp.v.current.y, moved: false, id: e.pointerId }
  }
  const onPointerMove = e => {
    const dr = drag.current
    if (!dr || dr.id !== e.pointerId) return
    const dx = e.clientX - dr.x, dy = e.clientY - dr.y
    if (!dr.moved && Math.hypot(dx, dy) < 4) return
    if (!dr.moved) {
      dr.moved = true
      userMoved.current = true
      vp.animate(false)
      stageRef.current.setPointerCapture(e.pointerId)
      stageRef.current.classList.add('drag')
    }
    vp.v.current.x = dr.vx + dx
    vp.v.current.y = dr.vy + dy
    vp.apply()
  }
  const onPointerUp = () => {
    stageRef.current?.classList.remove('drag')
  }
  const onStageClick = e => {
    if (drag.current?.moved) { drag.current = null; return }
    drag.current = null
    if (!e.target.closest('.kg-node')) setSel(null)
  }

  const pick = useCallback((k, center) => {
    setSel(prevSel => (prevSel === k && !center ? null : k))
    const at = center && lay ? lay.pos.get(k) : null
    if (at) vp.centerOn(at[0] + NW / 2, at[1] + NH / 2, 470)
  }, [lay, vp])

  const toggle = (s, solo, present) => setOff(prevOff => {
    const n = new Set(prevOff)
    if (solo) {
      const isSolo = !prevOff.has(s) && present.every(x => x === s || prevOff.has(x))
      n.clear()
      if (!isSolo) present.forEach(x => x !== s && n.add(x))
    } else if (n.has(s)) n.delete(s)
    else n.add(s)
    return n
  })

  const zoomCenter = f => {
    const r = stageRef.current?.getBoundingClientRect()
    if (r) vp.zoomAt(f, r.width / 2, r.height / 2)
  }

  const onKeyDown = e => {
    if (e.target.tagName === 'INPUT') {
      if (e.key === 'Escape') { setSearch(''); e.target.blur() }
      return
    }
    if (e.key === 'Escape') setSel(null)
    else if (e.key === '0') fit(true)
    else if (e.key === '+' || e.key === '=') zoomCenter(1.25)
    else if (e.key === '-') zoomCenter(0.8)
    else if (e.key === '/') {
      e.preventDefault()
      pageRef.current?.querySelector('.kg-bar input')?.focus()
    } else return
    e.stopPropagation()
  }

  let body
  if (error && !g) {
    const where = backend.conn ? `backend "${backend.conn}", profile "${backend.profile || 'default'}"` : `profile "${backend.profile || 'default'}"`
    body = h('div', { style: { paddingTop: 80 } }, h(ErrorState, { title: 'Kanban graph backend unreachable', description: `${error.message || error} (${where}). The Python half answers only on a backend where kanban-graph is installed, in plugins.enabled and restarted since; a remote gateway needs its own install. To see this machine's boards, switch the window to This device.` }))
  } else if (isLoading || !g) {
    body = h('div', { style: { paddingTop: 120, display: 'grid', placeItems: 'center' } }, h(Loader, null))
  } else if (!g.tasks.length) {
    body = h('div', { style: { paddingTop: 80 } }, h(EmptyState, { title: mode === 'running' ? 'Nothing is running' : 'No tasks', description: mode === 'running' ? 'No task is in the running state on these boards. Switch to Open to see queued work.' : 'These boards have no tasks in this view.' }))
  } else {
    const any = !!lineage
    const on = k => k === sel || rel.has(k)
    bandRefs.current = []
    body = h('div', { ref: worldRef, className: 'kg-world' },
      ...lay.bands.map((b, i) => h('div', { key: `b-${b.slug}`, className: 'kg-band', style: { transform: `translate(${b.x - 24}px,${b.y - 8}px)`, width: b.w + 48, height: b.h + 16 } },
        h('div', { className: 'kg-band-t', ref: el => { bandRefs.current[i] = el } }, h('span', null, b.name),
          h('small', null, [b.slug, b.shown === b.n ? `${b.n} tasks` : `${b.shown}/${b.n} tasks`, ...g.statuses.filter(s => b.counts[s]).map(s => `${b.counts[s]} ${s}`)].join(SEP))))),
      h('svg', { width: 1, height: 1, key: 'edges' },
        h('defs', null, h('marker', { id: 'kg-ah', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
          h('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--ui-text-tertiary)' }))),
        ...lay.links.map(([p, c]) => {
          const hl = any && on(p) && on(c)
          if (lay.quiet && !hl) return null
          const path = lay.routes.get(`${p}>${c}`)
          // The CSS d property is what transitions; the attribute is the non-Chromium fallback.
          return h('path', { key: `${p}>${c}`, className: `kg-edge${hl ? ' hl' : ''}${any && !hl ? ' kg-dim' : ''}`, d: path, style: { d: `path("${path}")` }, markerEnd: 'url(#kg-ah)' })
        })),
      ...g.tasks.filter(t => lay.pos.has(t.k)).map(t => h(Node, {
        key: t.k, t, at: lay.pos.get(t.k), onPick: pick,
        cls: `${t.k === sel ? ' sel' : ''}${rel.has(t.k) ? ' rel' : ''}${any && !on(t.k) ? ' kg-dim' : ''}`
      })))
  }

  const shown = lay ? lay.pos.size : 0
  const t = sel && d ? d.byK.get(sel) : null
  return h('div', { ref: pageRef, className: 'kg-page', tabIndex: 0, onKeyDown },
    h('div', { ref: stageRef, className: 'kg-stage', onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture: onStageClick }, body),
    h('div', { ref: barRef }, h(Toolbar, { boards: boardList?.boards, search, setSearch, onFit: () => fit(true), onZoom: zoomCenter, failed: error ? String(error.message || error) : '' })),
    g ? h(Footer, { g, off, toggle, footRef, hint: `${shown}/${g.tasks.length} tasks, ${lay ? lay.links.length : 0}/${g.links.length} links, ${plural(lay ? lay.bands.length : 0, 'board')}${lay && lay.implied ? `, ${lay.implied} implied hidden` : ''}${g.hidden.length ? ` (hidden: ${g.hidden.join(', ')})` : ''}${lay && lay.quiet && !sel ? ', arrows on select' : ''}${isFetching ? ', refreshing' : ''}. Data ${hm(g.generated)}` }) : null,
    t && lineage ? h(Panel, { t, A: lineage.A, B: lineage.B, byK: d.byK, hidden: g.hidden, generated: g.generated, onPick: pick, onClose: () => setSel(null) }) : null)
}

// --- registration ---

export default {
  id: ID,
  name: 'Kanban Graph',
  register(ctx) {
    api = ctx
    $mode.set(ctx.storage.get('mode', 'running'))
    $board.set(ctx.storage.get('board', ALL))
    $arrange.set(KG_MODES.some(([m]) => m === ctx.storage.get('arrange')) ? ctx.storage.get('arrange') : 'flow')
    $socket.set('off')

    const style = document.createElement('style')
    style.dataset.plugin = ID
    style.textContent = CSS
    document.head.appendChild(style)

    ctx.setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      $now.set(now)
      // The backend pings every KEEPALIVE seconds; silence past twice that means the socket is gone.
      if ($socket.get() === 'live' && now - lastFrame > 2 * KEEPALIVE_S + 5) $socket.set('off')
    }, 1000)

    // Coalesce event bursts (a dispatcher tick writes several rows) into one refetch.
    let pending = null
    let lastFrame = 0
    const onFrame = frame => {
      lastFrame = Math.floor(Date.now() / 1000)
      $socket.set('live')
      if (!frame || !frame.events || !frame.events.length) return
      if (pending) return
      pending = ctx.setTimeout(() => {
        pending = null
        void queryClient.invalidateQueries({ queryKey: [ID, 'graph'] })
      }, 400)
    }
    // The SDK resolves a socket's backend once at connect, while REST follows the window's current
    // gateway and profile. Reopen on every switch so "live" always describes the backend on screen.
    let closeSocket = null
    const openSocket = () => {
      closeSocket?.()
      lastFrame = 0
      $socket.set('off')
      closeSocket = ctx.socket('/events', onFrame)
    }
    openSocket()
    const unlisten = [host.state.connectionId.listen(openSocket), host.state.profile.listen(openSocket)]

    ctx.onDispose(() => {
      unlisten.forEach(stop => stop())
      closeSocket?.()
      style.remove()
      api = null
      $socket.set('off')
    })

    // The palette handler is route-independent: from anywhere it reveals the page; on the page it
    // re-asserts the current view, so a stray run never drops the selection you were reading.
    const openGraph = () => {
      host.navigate(onRoute() ? window.location.hash.replace(/^#/, '') : PATH)
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
