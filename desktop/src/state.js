// Module state, bound in register() and reset on dispose.
import { atom } from '@hermes/plugin-sdk'

import { DEFAULTS } from './model.js'

export let api = null
export const setApi = ctx => { api = ctx }
export const $now = atom(Math.floor(Date.now() / 1000))
export const $mode = atom(DEFAULTS.mode)
export const $board = atom(DEFAULTS.board)
export const $arrange = atom(DEFAULTS.arrange)
export const $density = atom(DEFAULTS.density)
export const $socket = atom('off')

// Every remembered choice, by storage key.
const PREFS = { mode: $mode, board: $board, arrange: $arrange, density: $density }

export function setPref(key, value) {
  PREFS[key].set(value)
  api?.storage.set(key, value)
}

// Forget every remembered choice and show the defaults again.
export function resetToolbar() {
  for (const [key, a] of Object.entries(PREFS)) {
    api?.storage.remove(key)
    a.set(DEFAULTS[key])
  }
}
