// forked from packages/ui-kit at 51feea6, no sync (D41)
// Route state for a hash-routed plugin page. The view's named state lives in the URL, so a sidebar
// row, a palette row, a pasted deep link and an OS link all land on the same view.
//
//   const route = createRoute('/my-plugin', { select: 'task', params: ['mode', 'board'] })
//   route.read()        -> { task, mode, board } or null when the hash is another page
//   route.write(view)   -> history.replaceState with every param, only while on the page
//   route.on()          -> is the hash this page
//
// replaceState, never `location.hash =`: the hash router treats a write as a navigation, remounts
// the page on every click and pushes one Back entry per selection. Every param is written each
// time so a copied link fully determines the view; an absent param falls back to the caller's
// remembered preference.

export function createRoute(path, { select, params }) {
  const split = () => window.location.hash.replace(/^#/, '').split('?')
  const on = () => (window.location.hash || '').replace(/^#/, '').split('?')[0] === path

  const read = () => {
    const [here, qs = ''] = split()
    if (here !== path) return null
    const q = new URLSearchParams(qs)
    const view = { [select]: q.get(select) || null }
    for (const k of params) view[k] = q.get(k)
    return view
  }

  const href = view => {
    const q = new URLSearchParams()
    for (const k of [select, ...params]) if (view[k]) q.set(k, view[k])
    const qs = q.toString()
    return qs ? `${path}?${qs}` : path
  }

  const write = view => {
    if (!on()) return
    const next = href(view)
    if (window.location.hash.replace(/^#/, '') === next) return
    window.history.replaceState(null, '', `#${next}`)
  }

  return { path, on, read, href, write }
}
