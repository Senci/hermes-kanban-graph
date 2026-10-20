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
export const MODE_PARAMS = { running: { focus: 'running' }, open: { hide: 'done' }, all: {} }

