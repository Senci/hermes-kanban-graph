import { EmptyState, ErrorState, Loader, useValue } from '@hermes/plugin-sdk'
import { createElement as h, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Shell, Stage } from './kit/shell.js'
import { useDebounced, walk } from './kit/util.js'
import { useBackend } from './kit/live.js'
import { useViewport } from './kit/viewport.js'

import { Footer, Node, Panel, plural, SEP, Toolbar } from './components.js'
import { derive, useBoards, useGraph } from './data.js'
import { hm } from './format.js'
import { KG_MODES, kgHeadFont, kgLayout } from './layout.js'
import { ALL, ANIM_MS, SEARCH_DEBOUNCE_MS } from './model.js'
import { applyRoute, payloadIsFor, route } from './route.js'
import { NH, NW } from './sizes.js'
import { $arrange, $board, $density, $fields, $mode, api } from './state.js'

export function GraphPage() {
  // The deep link is authoritative on entry, so the first query already asks for the linked board
  // and mode. Read once, lazily: an effect would fire after that first fetch had already asked for
  // the remembered view.
  const [entry] = useState(() => {
    const r = route.read()
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
  const density = useValue($density)
  const fields = useValue($fields)
  const view = useMemo(() => ({ density, fields }), [density, fields])
  const bandRefs = useRef([])
  // A selection that arrived from outside the page. The camera centres on it once the layout knows
  // where it is; see the pending-selection effects below.
  const deepTask = useRef(entry?.task || null)
  const onScale = useCallback(s => {
    const fs = kgHeadFont(s)
    for (const el of bandRefs.current) if (el) el.style.fontSize = `${fs}px`
  }, [])
  const vp = useViewport(stageRef, worldRef, onScale, { prefix: 'kg', animMs: ANIM_MS, minScale: 0.05 })
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
    route.write({ task: sel, mode, board, arrange })
  }, [sel, mode, board, arrange])

  useEffect(() => {
    const onHash = () => {
      const r = route.read()
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
        key: t.k, t, at: lay.pos.get(t.k), view, onPick: pick,
        cls: `${t.k === sel ? ' sel' : ''}${rel.has(t.k) ? ' rel' : ''}${any && !on(t.k) ? ' kg-dim' : ''}`
      })))
  }

  const shown = lay ? lay.pos.size : 0
  const t = sel && d ? d.byK.get(sel) : null
  return h(Shell, { prefix: 'kg', pageRef, onKeyDown },
    h(Stage, { prefix: 'kg', stageRef, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture: onStageClick } }, body),
    h('div', { ref: barRef }, h(Toolbar, { boards: boardList?.boards, search, setSearch, onFit: () => fit(true), onZoom: zoomCenter, failed: error ? String(error.message || error) : '' })),
    g ? h(Footer, { g, off, toggle, footRef, hint: `${shown}/${g.tasks.length} tasks, ${lay ? lay.links.length : 0}/${g.links.length} links, ${plural(lay ? lay.bands.length : 0, 'board')}${lay && lay.implied ? `, ${lay.implied} implied hidden` : ''}${g.hidden.length ? ` (hidden: ${g.hidden.join(', ')})` : ''}${lay && lay.quiet && !sel ? ', arrows on select' : ''}${isFetching ? ', refreshing' : ''}. Data ${hm(g.generated)}` }) : null,
    t && lineage ? h(Panel, { t, A: lineage.A, B: lineage.B, byK: d.byK, hidden: g.hidden, generated: g.generated, onPick: pick, onClose: () => setSel(null) }) : null)
}
