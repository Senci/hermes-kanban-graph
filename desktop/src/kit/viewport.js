// forked from packages/ui-kit at 51feea6, no sync (D41)
// Pan and zoom, DOM-direct so a drag never re-renders the graph. The camera lives in a ref and is
// written to the world element's transform; `onScale` receives every new scale (band titles use
// it to stay readable when zoomed out).
// Camera moves caused by a re-layout use the same transition as the cards (class `<prefix>-anim`),
// so a pinned card stays put on screen while everything else slides.

import { useCallback, useRef } from 'react'

export function useViewport(stageRef, worldRef, onScale, { prefix, animMs = 350, minScale = 0.05 }) {
  const v = useRef({ x: 0, y: 0, s: 1 })
  const animT = useRef(null)
  const animate = useCallback(on => {
    const w = worldRef.current
    if (!w) return
    clearTimeout(animT.current)
    w.classList.toggle(`${prefix}-anim`, on)
    if (on) animT.current = setTimeout(() => w.classList.remove(`${prefix}-anim`), animMs + 50)
  }, [worldRef, prefix, animMs])
  const apply = useCallback(() => {
    const w = worldRef.current
    if (w) w.style.transform = `translate(${v.current.x}px,${v.current.y}px) scale(${v.current.s})`
    onScale(v.current.s)
  }, [worldRef, onScale])
  const zoomAt = useCallback((f, cx, cy) => {
    const c = v.current, ns = Math.min(3, Math.max(minScale, c.s * f))
    c.x = cx - ((cx - c.x) * ns) / c.s
    c.y = cy - ((cy - c.y) * ns) / c.s
    c.s = ns
    animate(false)
    apply()
  }, [apply, animate, minScale])
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
