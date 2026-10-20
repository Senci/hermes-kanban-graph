// Module state, bound in register() and reset on dispose.
import { atom } from '@hermes/plugin-sdk'

import { ALL } from './model.js'

export let api = null
export const setApi = ctx => { api = ctx }
export const $now = atom(Math.floor(Date.now() / 1000))
export const $mode = atom('running')
export const $board = atom(ALL)
export const $arrange = atom('flow')
export const $socket = atom('off')
