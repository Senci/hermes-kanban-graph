// forked from packages/ui-kit at 51feea6, no sync (D41)
// Theme bridge. A plugin never hard-codes a colour: every surface, stroke and tone is one of the
// host's --ui-* custom properties, so the page follows light, dark and user themes without a
// rebuild. `ui('text-tertiary')` is the string `var(--ui-text-tertiary)`.

export const ui = name => `var(--ui-${name})`

// Tones the pages use for state. Values are references, never resolved colours.
export const TONE = {
  text: ui('text-primary'),
  muted: ui('text-tertiary'),
  secondary: ui('text-secondary'),
  faint: ui('text-quaternary'),
  accent: ui('accent'),
  green: ui('green'),
  red: ui('red'),
  yellow: ui('yellow'),
  blue: ui('blue'),
  purple: ui('purple')
}

export const muted = { color: TONE.muted }

// Add a plugin's stylesheet to the document and return the function that removes it. One tag per
// plugin id, tagged so a stray copy is easy to find in the inspector.
export function mountStyle(id, css) {
  const style = document.createElement('style')
  style.dataset.plugin = id
  style.textContent = css
  document.head.appendChild(style)
  return () => style.remove()
}
