// Card rules that are pure functions of a task, checked on the source modules (they import nothing
// from the host). Node, no dependencies. Usage: node tests/card.test.mjs
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'desktop', 'src')
const { stripeTone, meta } = await import(join(src, 'model.js'))

const tests = {
  'stripe by status is the status tone': () => {
    assert.equal(stripeTone({ s: 'running', p: 9, a: 'x' }, 'status', 9), meta('running').tone)
  },
  'stripe by priority: none is muted, then blue, amber, red against the highest in view': () => {
    const tone = p => stripeTone({ s: 'todo', p }, 'priority', 100)
    assert.equal(tone(0), 'var(--ui-text-quaternary)')
    assert.equal(tone(10), 'var(--ui-blue)')
    assert.equal(tone(50), 'var(--ui-yellow)')
    assert.equal(tone(90), 'var(--ui-red)')
  },
  'stripe by priority grades a 0-10 board the same way': () => {
    assert.equal(stripeTone({ p: 10 }, 'priority', 10), 'var(--ui-red)')
    assert.equal(stripeTone({ p: 1 }, 'priority', 10), 'var(--ui-blue)')
  },
  'stripe by assignee is stable per name and muted without one': () => {
    const a = stripeTone({ a: 'default' }, 'assignee', 1)
    assert.equal(a, stripeTone({ a: 'default' }, 'assignee', 50))
    assert.match(a, /^var\(--ui-[a-z-]+\)$/)
    assert.equal(stripeTone({ a: '' }, 'assignee', 1), 'var(--ui-text-quaternary)')
  }
}

let failed = 0
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok   ${name}`) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`) }
}
process.exit(failed ? 1 : 0)
