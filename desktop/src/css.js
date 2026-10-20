// kanban-graph's stylesheet: the kit's graph rules plus the rules only this page has (status
// icon sizing in the card text, the detail panel code blocks, run table, activity list).
import { graphCss } from '../../../../packages/ui-kit/src/css.js'

import { ANIM_MS } from './model.js'

const bar = `
.kg-bar .kg-seg{grid-auto-columns:auto}
`
const nodeText = `
.kg-node .kg-t{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;white-space:nowrap}
.kg-node .kg-t span{overflow:hidden;text-overflow:ellipsis}
.kg-node .kg-s{font-size:11px;color:var(--ui-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`
const panel = `
.kg-pbody pre{margin:4px 0 10px;padding:8px;white-space:pre-wrap;word-break:break-word;border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:var(--ui-bg-editor);font:11.5px/1.45 var(--font-mono,ui-monospace,monospace)}
`
const end = `
.kg-runs{width:100%;border-collapse:collapse;font-size:11.5px;margin:4px 0 10px}
.kg-runs td{padding:2px 6px 2px 0;vertical-align:top;border-top:1px solid var(--ui-stroke-secondary)}
.kg-acts{margin:4px 0 10px;font:11px/1.4 var(--font-mono,ui-monospace,monospace)}
.kg-acts>div{display:grid;grid-template-columns:44px 96px 1fr;gap:6px;padding:2px 0;border-top:1px solid var(--ui-stroke-secondary)}
.kg-acts b{font-weight:600;color:var(--ui-green)}
.kg-acts span:last-child{display:-webkit-box;overflow:hidden;word-break:break-word;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.kg-live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px}
`

export const CSS = graphCss('kg', ANIM_MS, { bar, nodeText, panel, end })
