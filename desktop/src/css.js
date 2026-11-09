// kanban-graph's stylesheet: the graph rules in kit/css.js plus the rules only this page has (status
// icon sizing in the card text, the detail panel code blocks, run table, activity list).
import { graphCss } from './kit/css.js'

import { ANIM_MS } from './model.js'

const bar = `
.kg-bar .kg-seg{grid-auto-columns:auto}
`
const nodeText = `
.kg-node .kg-t{display:flex;align-items:flex-start;gap:6px;font-size:12.5px;font-weight:600;line-height:1.3}
.kg-node .kg-tt{min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}
.kg-node .kg-flags{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px}
.kg-node .kg-stale{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;line-height:1.3;color:var(--ui-text-secondary)}
.kg-node .kg-pri{display:inline-flex;align-items:center;gap:1px;font-size:10px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}
.kg-node .kg-s{font-size:11px;line-height:1.3;color:var(--ui-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.kg-view{display:grid;gap:10px;font-size:12px}
.kg-view-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.kg-view-row>span:first-child,.kg-view-sub>span{color:var(--ui-text-secondary)}
.kg-view-sub{display:grid;gap:6px}
.kg-live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px}
`

export const CSS = graphCss('kg', ANIM_MS, { bar, nodeText, panel, end })
