import {
  Button,
  Codicon,
  CopyButton,
  SearchField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tip,
  useValue
} from '@hermes/plugin-sdk'
import { createElement as h, Fragment } from 'react'

import { Bar, FootBar } from './kit/shell.js'
import { TONE } from './kit/theme.js'

import { curRun, dur, fmt, hm } from './format.js'
import { KG_MODES } from './layout.js'
import { ALL, meta, MODES } from './model.js'
import { NH, NW } from './sizes.js'
import { $arrange, $board, $mode, $now, $socket, api } from './state.js'

// Same signal as the app's kanban cards (plugins/kanban/ui.tsx): a heartbeat older than 2 min
// means the worker may be gone, so the arc slows down and turns amber.
const STALE_HEARTBEAT_S = 120
export function Arc({ hb }) {
  const now = useValue($now)
  return h('span', { 'aria-hidden': true, className: `kg-arc${hb && now - hb > STALE_HEARTBEAT_S ? ' stale' : ''}` })
}

export function LiveDuration({ since, suffix = '' }) {
  const now = useValue($now)
  return h(Fragment, null, dur(now - since) + suffix)
}

// Card and band sublines: HTML collapses repeated spaces, so fields need a visible separator.
export const SEP = ' · '
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
// Enter and Space act like a click; stopPropagation keeps the page-level key handler out of it.
const onActivate = fn => e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn() }
}

export const Node = ({ t, at, cls, onPick }) => {
  const m = meta(t.s), run = curRun(t), warn = t.f > 0 || t.bk
  const sub = [t.id, t.a, t.m && t.m.replace('claude-', '')].filter(Boolean).join(SEP)
  return h('div', {
    className: `kg-node${run ? ' live' : ''}${cls}`,
    style: { transform: `translate(${at[0]}px,${at[1]}px)`, width: NW, height: NH },
    title: t.t,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${t.t}, ${t.s}`,
    'data-k': t.k,
    'data-id': t.id,
    onClick: e => { e.stopPropagation(); onPick(t.k) },
    onKeyDown: onActivate(() => onPick(t.k))
  },
    h('div', { className: 'kg-stripe', style: { background: m.tone } }),
    run ? h(Arc, { hb: run.hb || t.hb }) : null,
    h('div', { className: 'kg-t' },
      h(Codicon, { name: m.icon, style: { color: m.tone }, spinning: !!run }),
      h('span', { className: 'kg-tt' }, t.t),
      warn ? h('span', { title: [t.bk && `Blocked: ${t.bk}`, t.f > 0 && `${t.f} failed run${t.f > 1 ? 's' : ''}`].filter(Boolean).join('. '), style: { marginLeft: 'auto', display: 'inline-flex' } },
        h(Codicon, { name: 'warning', style: { color: TONE.red } })) : null),
    h('div', { className: 'kg-s', style: run ? { color: TONE.green } : null },
      run ? h(Fragment, null, 'running ', h(LiveDuration, { since: run.a }), t.a ? `${SEP}${t.a}` : '') : sub))
}

export function Row({ t, onPick }) {
  const m = meta(t.s)
  return h('div', { className: 'kg-rl', role: 'button', tabIndex: 0, 'aria-label': `${t.t}, ${t.s}`, onClick: () => onPick(t.k, true), onKeyDown: onActivate(() => onPick(t.k, true)) },
    h(Codicon, { name: m.icon, style: { color: m.tone } }),
    h('span', null, t.t),
    h('small', null, t.id))
}

export function KV({ rows }) {
  const kept = rows.filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== 0 && v !== false)
  return h('div', { className: 'kg-kv' }, ...kept.flatMap(([k, v], i) => [h('span', { key: `k${i}` }, k), h('span', { key: `v${i}` }, v)]))
}

export function LiveRun({ t, run, generated }) {
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

export function Panel({ t, A, B, byK, hidden, generated, onPick, onClose }) {
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
      !A.size && !B.size ? h(Fragment, null, h('h3', null, 'Linked tasks'), h('div', { style: { color: TONE.muted } }, t.hx ? 'None shown.' : 'None: this task has no parent or child links.')) : null,
      t.hx ? h('div', { style: { color: TONE.muted, margin: '4px 0' } }, `${t.hx.p} parent and ${t.hx.c} child links go to tasks outside this view${hidden.length ? ` (hidden: ${hidden.join(', ')})` : ''}.`) : null,
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

export function Toolbar({ boards, search, setSearch, onFit, onZoom, failed }) {
  const mode = useValue($mode), board = useValue($board), arrange = useValue($arrange), sock = useValue($socket)
  // A failing graph fetch outranks the socket: the socket can be live on a different backend.
  const link = failed ? 'offline' : sock === 'live' ? 'live' : 'polling'
  const linkTip = { live: 'Live: board events stream in', polling: 'Polling every 15 s (event socket unavailable)', offline: `Backend unreachable: ${failed}` }[link]
  return h(Bar, { prefix: 'kg' },
    h(Codicon, { name: 'type-hierarchy', style: { color: TONE.accent } }),
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
      h('span', { style: { fontSize: 11.5, color: TONE.muted, display: 'inline-flex', alignItems: 'center' } },
        h('span', { className: 'kg-live-dot', style: { background: link === 'live' ? TONE.green : link === 'offline' ? TONE.red : TONE.faint } }),
        link)),
    h(Tip, { label: 'Zoom out (-)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: () => onZoom(0.8), 'aria-label': 'Zoom out' }, h(Codicon, { name: 'zoom-out' }))),
    h(Tip, { label: 'Fit (0)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: onFit, 'aria-label': 'Fit' }, h(Codicon, { name: 'screen-full' }))),
    h(Tip, { label: 'Zoom in (+)' }, h(Button, { size: 'icon-xs', variant: 'ghost', onClick: () => onZoom(1.25), 'aria-label': 'Zoom in' }, h(Codicon, { name: 'zoom-in' })))))
}

// Status filters (icon and count, the name is in the tooltip) and the status line.
export function Footer({ g, off, toggle, hint, footRef }) {
  const present = g ? g.statuses.filter(s => g.tasks.some(t => t.s === s)) : []
  const counts = s => g.tasks.filter(t => t.s === s).length
  return h(FootBar, { prefix: 'kg', footRef },
    ...present.map(s => h(Tip, { key: s, label: `${s} (${counts(s)}). Click: toggle. Shift+click: only ${s}.` },
      h('button', {
        type: 'button', className: `kg-chip${off.has(s) ? ' off' : ''}`, style: { '--c': meta(s).tone }, 'aria-label': s, 'aria-pressed': !off.has(s),
        onMouseDown: e => e.shiftKey && e.preventDefault(),
        onClick: e => toggle(s, e.shiftKey, present)
      }, h(Codicon, { name: meta(s).icon }), h('b', null, counts(s))))),
    h('span', { className: 'kg-hint', title: 'Drag to pan, wheel to zoom, click a task for its lineage, Esc clears.' }, hint))
}
