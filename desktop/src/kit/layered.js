// forked from packages/ui-kit at 51feea6, no sync (D41)
// Layered DAG layout (Sugiyama scheme, as dagre and ELK use): longest-path layers, barycenter
// ordering, then each task centred on its neighbours. One board is laid out per call to dagBoard,
// dagPlace packs boards into rows that match the viewport and routes every link.
// Pure functions, no imports: kanban-graph's snapshot generator pastes this code into a static
// page, so nothing here may touch React, the DOM or the SDK. The card size is passed in as
// `sz = { NW, NH }` instead of being a module constant.

const GAP_X = 80, GAP_Y = 18, GAP_DOWN = 64, COMP_GAP = 44
const BAND_GAP = 90, BAND_HEAD = 72, BAND_MIN_W = 600, GRID_COLS = 5
// Band header: title plus a .62em subtitle, 12 px from the band's top edge, inside the BAND_HEAD + 8
// strip above the first card row. It grows as you zoom out, capped so both lines stay in the strip.
const HEAD_TOP = 12, HEAD_FS_MAX = Math.floor((BAND_HEAD + 8 - HEAD_TOP - 8) / (1.2 + 0.62 * 1.2))
export const dagHeadFont = scale => Math.min(HEAD_FS_MAX, Math.max(15, 13 / scale))
const ORDER_SWEEPS = 4, PLACE_SWEEPS = 4

// Longest path from the sources, then every task with children moves to sit just before its
// earliest child, so a prerequisite is drawn next to what needs it instead of back in column 0.
export function dagLayers(nodes, parents, children, ord) {
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

export const dagMean = (xs, f, dflt) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : dflt)

// One linked component in abstract units: layer index along the flow, slot across it.
export function dagComponent(comp, links, ord) {
  const parents = new Map(comp.map(k => [k, []])), children = new Map(comp.map(k => [k, []]))
  for (const [p, c] of links) { parents.get(c).push(p); children.get(p).push(c) }
  const depth = dagLayers(comp, parents, children, ord)
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
      const key = new Map(l.map(n => [n, dagMean(nb.get(n), m => at.get(m), at.get(n))]))
      l.sort((a, b) => key.get(a) - key.get(b) || at.get(a) - at.get(b))
      l.forEach((n, i) => at.set(n, i))
    }
  }
  // Slide each task toward the mean of its neighbours, keeping order and one slot of spacing.
  const y = new Map()
  L.forEach(l => l.forEach((n, i) => y.set(n, i - (l.length - 1) / 2)))
  for (let s = 0; s < PLACE_SWEEPS; s++) {
    for (const l of s % 2 ? [...L].reverse() : L) {
      const wish = l.map(n => dagMean([...parents.get(n), ...children.get(n)], m => y.get(m), y.get(n)))
      const out = []
      wish.forEach((w, i) => out.push(i ? Math.max(w, out[i - 1] + 1) : w))
      const shift = dagMean(wish.map((w, i) => w - out[i]), v => v, 0)
      l.forEach((n, i) => y.set(n, out[i] + shift))
    }
  }
  const min = Math.min(...y.values()), max = Math.max(...y.values())
  return { layer: new Map(comp.map(n => [n, depth.get(n) - lo])), slot: new Map([...y].map(([n, v]) => [n, v - min])), layers: L.length, span: max - min + 1 }
}

// Columns as wide as fit a plane of the given shape; returns [cols, cellW, cellH].
export function dagGridShape(n, aspect, gapX, sz) {
  const { NW, NH } = sz
  const cw = NW + gapX, ch = NH + GAP_Y
  return [Math.max(1, Math.min(n, Math.round(Math.sqrt((n * aspect * ch) / cw)))), cw, ch]
}

export function dagBoard(tasks, links, rank, ord, mode, sz) {
  const { NW, NH } = sz
  const xy = new Map()
  const status = new Map(tasks.map(t => [t.k, t.s]))
  const byStatus = (a, b) => (rank.get(status.get(a)) ?? 99) - (rank.get(status.get(b)) ?? 99) || ord.get(a) - ord.get(b)
  const ids = tasks.map(t => t.k)

  if (mode === 'grid') {
    const [cols, cw, ch] = dagGridShape(ids.length, 2.2, GAP_X * 0.3, sz)
    ids.sort(byStatus).forEach((n, i) => xy.set(n, [(i % cols) * cw, BAND_HEAD + Math.floor(i / cols) * ch]))
    const rows = Math.ceil(ids.length / cols)
    return { xy, h: BAND_HEAD + rows * ch - GAP_Y, w: Math.max(BAND_MIN_W, cols * cw - GAP_X * 0.3) }
  }

  if (mode === 'status') {
    // One column per status in workflow order; within a column, dependency depth then age.
    const parents = new Map(ids.map(k => [k, []])), children = new Map(ids.map(k => [k, []]))
    for (const [p, c] of links) { parents.get(c).push(p); children.get(p).push(c) }
    const depth = dagLayers(ids, parents, children, ord)
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
    const d = dagComponent(comp, compLinks.get(r) || [], ord)
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
export function dagReduce(links) {
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
export function dagPorts(links, pos, down, sz) {
  const { NW, NH } = sz
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
// oa and ob shift the exit and entry points along their side (see dagPorts).
export function dagEdge(a, b, down, oa, ob, sz) {
  const { NW, NH } = sz
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

// Arrange modes. flow and down are the layered drawing; status and grid pack for density.
export const ARRANGE_MODES = [
  ['flow', 'Flow, left to right'],
  ['down', 'Flow, top down'],
  ['status', 'Columns by status'],
  ['grid', 'Compact grid']
]

// Lay out each board on its visible tasks, then pack the boards into rows that match the viewport's
// shape, tallest first, so the plane fills the screen instead of one long strip. `links` are the
// links to draw (already reduced); with sameBoardOnly a link between two boards shapes neither
// board's layout but is still routed.
export function dagPlace(g, shown, links, aspect, mode, sz, sameBoardOnly) {
  const rank = new Map(g.statuses.map((s, i) => [s, i]))
  const ord = new Map(g.tasks.map((t, i) => [t.k, i]))
  const board = new Map(g.tasks.map(t => [t.k, t.b]))
  const tasksBy = new Map(), linksBy = new Map()
  for (const t of g.tasks) {
    if (!shown.has(t.k)) continue
    if (!tasksBy.has(t.b)) tasksBy.set(t.b, [])
    tasksBy.get(t.b).push(t)
  }
  for (const l of links) {
    const b = board.get(l[0])
    if (sameBoardOnly && b !== board.get(l[1])) continue
    if (!linksBy.has(b)) linksBy.set(b, [])
    linksBy.get(b).push(l)
  }
  const placed = g.boards.filter(b => tasksBy.has(b.slug))
    .map(b => ({ b, n: tasksBy.get(b.slug).length, ...dagBoard(tasksBy.get(b.slug), linksBy.get(b.slug) || [], rank, ord, mode, sz) }))
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
  const down = mode === 'down', ports = dagPorts(links, pos, down, sz)
  const routes = new Map(links.map(([p, c]) => {
    const key = `${p}>${c}`, [oa, ob] = ports.get(key)
    return [key, dagEdge(pos.get(p), pos.get(c), down, oa, ob, sz)]
  }))
  let box = null
  for (const b of bands) {
    box = box || [Infinity, Infinity, -Infinity, -Infinity]
    box = [Math.min(box[0], b.x - 24), Math.min(box[1], b.y - 8), Math.max(box[2], b.x + b.w + 24), Math.max(box[3], b.y + b.h + 8)]
  }
  return { pos, bands, routes, box, down }
}
