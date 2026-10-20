import { useQuery, useValue } from '@hermes/plugin-sdk'

import { useBackend, useLiveQuery } from './kit/live.js'

import { ALL, ID, MODE_PARAMS } from './model.js'
import { $socket, api } from './state.js'

export function graphPath(mode, board) {
  const q = new URLSearchParams(MODE_PARAMS[mode] || {})
  if (board !== ALL) q.set('board', board)
  const s = q.toString()
  return s ? `/graph?${s}` : '/graph'
}

// Data is per backend: a gateway or profile switch must neither reuse nor show another backend's
// graph, so connection and profile are in the key and placeholder data crosses only a same-backend change.
export function useGraph(mode, board) {
  const { conn, profile } = useBackend()
  const live = useValue($socket) === 'live'
  return useLiveQuery({
    queryKey: [ID, 'graph', conn, profile, mode, board],
    queryFn: () => (api ? api.rest(graphPath(mode, board)) : Promise.reject(new Error('kanban-graph not loaded'))),
    placeholderData: (prev, prevQuery) => (prevQuery && prevQuery.queryKey[2] === conn && prevQuery.queryKey[3] === profile ? prev : undefined),
    live
  })
}

export function useBoards() {
  const { conn, profile } = useBackend()
  return useQuery({
    queryKey: [ID, 'boards', conn, profile],
    queryFn: () => api.rest('/boards'),
    staleTime: 60_000
  })
}

export function derive(g) {
  const byK = new Map(g.tasks.map(t => [t.k, t]))
  const up = new Map(g.tasks.map(t => [t.k, []]))
  const down = new Map(g.tasks.map(t => [t.k, []]))
  for (const [p, c] of g.links) {
    down.get(p)?.push(c)
    up.get(c)?.push(p)
  }
  return { byK, up, down }
}
