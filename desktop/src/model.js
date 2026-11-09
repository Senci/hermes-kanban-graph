import { ui } from './kit/theme.js'

export const ID = 'kanban-graph'
export const PATH = '/kanban-graph'
export const ALL = '__all__'
export const KEEPALIVE_S = 15
export const ANIM_MS = 350
export const SEARCH_DEBOUNCE_MS = 150

export const STATUS = {
  triage: { icon: 'inbox', tone: ui('text-tertiary') },
  todo: { icon: 'circle-outline', tone: ui('text-secondary') },
  scheduled: { icon: 'watch', tone: ui('purple') },
  ready: { icon: 'play-circle', tone: ui('blue') },
  running: { icon: 'sync', tone: ui('green') },
  blocked: { icon: 'error', tone: ui('red') },
  review: { icon: 'eye', tone: ui('yellow') },
  done: { icon: 'pass', tone: ui('text-tertiary') },
  archived: { icon: 'archive', tone: ui('text-quaternary') }
}
export const meta = s => STATUS[s] || STATUS.todo

export const MODES = [
  { id: 'running', label: 'Running + lineage' },
  { id: 'open', label: 'Open' },
  { id: 'all', label: 'All' }
]
// What a fresh install shows, and what the toolbar's reset control restores.
export const DEFAULTS = { mode: 'running', board: ALL, arrange: 'flow', density: 'comfortable', color: 'status', fields: ['id', 'assignee', 'model'] }
export const DENSITIES = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' }
]
export const COLOR_BYS = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' }
]
const PEOPLE = [ui('blue'), ui('purple'), ui('green'), ui('yellow'), ui('red')]
// The card stripe's tone. Priority is graded against the highest one in view because boards use
// both 0-10 and 0-100 scales; an assignee keeps the same tone because the pick is a hash of the name.
export function stripeTone(t, color, maxP) {
  if (color === 'priority') {
    if (!(t.p > 0)) return ui('text-quaternary')
    const r = t.p / maxP
    return r >= 0.75 ? ui('red') : r >= 0.4 ? ui('yellow') : ui('blue')
  }
  if (color === 'assignee') {
    if (!t.a) return ui('text-quaternary')
    let n = 0
    for (const ch of t.a) n = (n * 31 + ch.charCodeAt(0)) >>> 0
    return PEOPLE[n % PEOPLE.length]
  }
  return meta(t.s).tone
}
export const SUBTITLE_FIELDS = [
  { id: 'id', label: 'Id' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'model', label: 'Model' }
]
export const MODE_PARAMS = { running: { focus: 'running' }, open: { hide: 'done' }, all: {} }

