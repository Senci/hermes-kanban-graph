// Module state, bound in register() and reset on dispose.
import { atom, queryClient } from '@hermes/plugin-sdk'

import { DEFAULTS, ID } from './model.js'

export let api = null
export const setApi = ctx => { api = ctx }
export const $now = atom(Math.floor(Date.now() / 1000))
export const $mode = atom(DEFAULTS.mode)
export const $board = atom(DEFAULTS.board)
export const $arrange = atom(DEFAULTS.arrange)
export const $density = atom(DEFAULTS.density)
export const $fields = atom(DEFAULTS.fields)
export const $color = atom(DEFAULTS.color)
// Not remembered: a freeze that outlives the page would look like a broken graph.
export const $paused = atom(false)
export const $socket = atom('off')

// Every remembered choice, by storage key.
const PREFS = { mode: $mode, board: $board, arrange: $arrange, density: $density, fields: $fields, color: $color }

export function setPref(key, value) {
  PREFS[key].set(value)
  api?.storage.set(key, value)
}

// Resuming fetches once, so the page catches up with what it skipped.
export function setPaused(on) {
  if ($paused.get() === on) return
  $paused.set(on)
  if (!on) void queryClient.invalidateQueries({ queryKey: [ID, 'graph'] })
}

// Forget every remembered choice and show the defaults again.
export function resetToolbar() {
  for (const [key, a] of Object.entries(PREFS)) {
    api?.storage.remove(key)
    a.set(DEFAULTS[key])
  }
  setPaused(false)
}
