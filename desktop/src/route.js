// Deep link. The view's named state lives in the route, so every door lands on the same page: the
// sidebar, the palette row, a pasted `hermes://open/kanban-graph?task=<board>/<id>`, an OS deep
// link, a notification body click. Carried: selection, filter mode, board, arrange mode. Not
// carried: camera position, search text and the status-chip toggles, which are per-visit fiddling.
// Every param is always written, so a copied link fully determines the view; a param that is
// absent falls back to the remembered preference, so a bare `#/kanban-graph` still works.

import { createRoute } from '#ui-kit/route.js'

import { KG_MODES } from './layout.js'
import { ALL, MODE_PARAMS, MODES, PATH } from './model.js'
import { $arrange, $board, $mode, api } from './state.js'

export const route = createRoute(PATH, { select: 'task', params: ['mode', 'board', 'arrange'] })

// Does this payload belong to the view currently on screen? A query key change renders once
// BEFORE the new fetch starts, so the payload in hand is still the previous view's; react-query's
// isFetching is false in that frame. The backend echoes the filter it applied (`focus`/`hidden`),
// so the payload identifies itself and the stale frame is recognisable.
export function payloadIsFor(g, mode, board) {
  const want = MODE_PARAMS[mode] || {}
  const focus = (want.focus || '').split(',').filter(Boolean).sort()
  const hidden = [...(want.hide || '').split(',').filter(Boolean), 'archived'].sort()
  const got = (g.focus || []).slice().sort()
  const gotHidden = (g.hidden || []).slice().sort()
  if (got.length !== focus.length || gotHidden.length !== hidden.length) return false
  if (!focus.every((v, i) => v === got[i]) || !hidden.every((v, i) => v === gotHidden[i])) return false
  return board === ALL || g.boards.length === 1
}

// Adopt a route's values: a present param wins, an absent one keeps the remembered preference.
// Only real choices are persisted, so a bare link never overwrites what the user last picked.
export function applyRoute(r) {
  if (r.mode && MODES.some(m => m.id === r.mode) && r.mode !== $mode.get()) {
    $mode.set(r.mode)
    api?.storage.set('mode', r.mode)
  }
  if (r.board && r.board !== $board.get()) {
    $board.set(r.board)
    api?.storage.set('board', r.board)
  }
  if (r.arrange && KG_MODES.some(([m]) => m === r.arrange) && r.arrange !== $arrange.get()) {
    $arrange.set(r.arrange)
    api?.storage.set('arrange', r.arrange)
  }
}
