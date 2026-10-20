// kanban-graph's board layout: tasks of one board are drawn as a layered DAG, boards are packed
// into rows. The generic parts live in kit/layered.js; this file fixes the card size and
// the link rule (transitive reduction over every link) and keeps the names the snapshot page uses.
// It sits between the layout markers (see layout-start.js), so it may only use NW and NH and names
// it defines itself.

import { ARRANGE_MODES, dagHeadFont, dagPlace, dagReduce } from './kit/layered.js'
import { NW, NH } from './sizes.js'

const SZ = { NW, NH }
export const KG_MODES = ARRANGE_MODES
export const kgHeadFont = dagHeadFont

// Lay out each board on its visible tasks, then pack the boards into rows that match the viewport's
// shape, tallest first, so the plane fills the screen instead of one long strip.
export function kgLayout(g, shown, aspect = 1.6, mode = 'flow') {
  // Transitive reduction: A>C is redundant when A still reaches C through other visible tasks, so
  // only the links that carry new reachability are drawn and laid out. Lineage walks use all links.
  const visible = g.links.filter(([p, c]) => shown.has(p) && shown.has(c))
  const links = dagReduce(visible)
  const { pos, bands, routes, box } = dagPlace(g, shown, links, aspect, mode, SZ, false)
  // Grid mode packs for density, not structure: arrows would only add noise until a selection.
  return { pos, bands, links, implied: visible.length - links.length, routes, box, quiet: mode === 'grid' }
}
