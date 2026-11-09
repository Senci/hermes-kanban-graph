// Module state, bound in register() and reset on dispose.
import { atom } from '@hermes/plugin-sdk'

import { DEFAULTS } from './model.js'

export let api = null
export const setApi = ctx => { api = ctx }
export const $now = atom(Math.floor(Date.now() / 1000))
export const $mode = atom(DEFAULTS.mode)
export const $board = atom(DEFAULTS.board)
export const $arrange = atom(DEFAULTS.arrange)
export const $socket = atom('off')

// Forget every remembered toolbar choice and show the defaults again.
export function resetToolbar() {
  api?.storage.remove('mode')
  api?.storage.remove('board')
  api?.storage.remove('arrange')
  $mode.set(DEFAULTS.mode)
  $board.set(DEFAULTS.board)
  $arrange.set(DEFAULTS.arrange)
}
