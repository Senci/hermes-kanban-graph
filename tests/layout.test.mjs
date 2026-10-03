// Layout checks on a /graph JSON dump, for every arrange mode: no card outside its board band, no
// overlapping cards or bands, every link the transitive reduction hides still reachable through
// drawn ones, and no two arrows ending at the same point. Node, no dependencies.
// Usage: node tests/layout.test.mjs [graph.json ...]   (default: tests/fixtures/*.json)
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'desktop', 'plugin.js'), 'utf8')
const body = src.slice(src.indexOf('// kg:layout-start'), src.indexOf('// kg:layout-end'))
if (!body) throw new Error('layout markers missing from desktop/plugin.js')
const NW = 240, NH = 58
// The layout block is plain functions with no imports; evaluate it with the card size it expects.
// eslint-disable-next-line no-new-func
const { kgLayout, KG_MODES } = new Function('NW', 'NH', `${body}\nreturn { kgLayout, KG_MODES }`)(NW, NH)

const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
const reach = (links, from, to) => {
  const kids = new Map()
  for (const [p, c] of links) kids.set(p, [...(kids.get(p) || []), c])
  const seen = new Set(), stack = [from]
  while (stack.length) {
    const n = stack.pop()
    if (n === to) return true
    if (seen.has(n)) continue
    seen.add(n)
    stack.push(...(kids.get(n) || []))
  }
  return false
}

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(here, 'fixtures')).filter(f => f.endsWith('.json')).map(f => join(here, 'fixtures', f))
let failed = 0
for (const file of files) {
  const g = JSON.parse(readFileSync(file, 'utf8'))
  const shown = new Set(g.tasks.map(t => t.k))
  const board = new Map(g.tasks.map(t => [t.k, t.b]))
  const visible = g.links.filter(([p, c]) => shown.has(p) && shown.has(c))
  for (const [mode] of KG_MODES) {
    const lay = kgLayout(g, shown, 1.6, mode)
    const bands = new Map(lay.bands.map(b => [b.slug, [b.x, b.y, b.x + b.w, b.y + b.h]]))
    const cards = [...lay.pos].map(([k, [x, y]]) => [k, [x, y, x + NW, y + NH]])
    const outside = cards.filter(([k, r]) => { const b = bands.get(board.get(k)); return r[0] < b[0] - 1 || r[1] < b[1] - 1 || r[2] > b[2] + 1 || r[3] > b[3] + 1 }).length
    let cardHits = 0, bandHits = 0
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) if (hit(cards[i][1], cards[j][1])) cardHits++
    const B = [...bands.values()]
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (hit(B[i], B[j])) bandHits++
    const drawn = new Set(lay.links.map(([p, c]) => `${p}>${c}`))
    const lost = visible.filter(([p, c]) => !drawn.has(`${p}>${c}`) && !reach(lay.links, p, c)).length
    const tips = new Map()
    for (const d of lay.routes.values()) { const e = d.split(' ').pop(); tips.set(e, (tips.get(e) || 0) + 1) }
    const sharedTips = [...tips.values()].filter(n => n > 1).length
    const ok = cards.length === shown.size && !outside && !cardHits && !bandHits && !lost && !sharedTips
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${file.split('/').pop()} ${mode}: cards=${cards.length} drawn=${lay.links.length} implied=${lay.implied} outside=${outside} cardHits=${cardHits} bandHits=${bandHits} lost=${lost} sharedTips=${sharedTips}`)
  }
}
process.exit(failed ? 1 : 0)
