// forked from packages/ui-kit at 51feea6, no sync (D41)
// Layout shell for a full-page graph view: a focusable page holding the pan and zoom stage, a
// toolbar pinned to the top, a status footer pinned to the bottom and an optional side panel.
// Classes are `<prefix>-page|stage|bar|foot`, styled by graphCss(prefix). The toolbar and footer
// stop pointer events so a click on them never starts a pan or clears the selection.

import { createElement as h } from 'react'

import { stopEvent } from './util.js'

export function Shell({ prefix, pageRef, onKeyDown, children }) {
  return h('div', { ref: pageRef, className: `${prefix}-page`, tabIndex: 0, onKeyDown }, ...[].concat(children))
}

export function Stage({ prefix, stageRef, handlers, children }) {
  return h('div', { ref: stageRef, className: `${prefix}-stage`, ...handlers }, children)
}

export function Bar({ prefix, children }) {
  return h('div', { className: `${prefix}-bar`, onPointerDown: stopEvent, onClick: stopEvent }, ...[].concat(children))
}

export function FootBar({ prefix, footRef, children }) {
  return h('div', { ref: footRef, className: `${prefix}-foot`, onPointerDown: stopEvent, onClick: stopEvent }, ...[].concat(children))
}
