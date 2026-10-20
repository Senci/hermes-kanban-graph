// forked from packages/ui-kit at 51feea6, no sync (D41)
// Stylesheet shared by the graph pages: toolbar, status chips, pan and zoom stage, bands, cards,
// the running-card arc, the side panel. Every class carries the plugin's prefix `p` so two plugins
// never share a rule. `x` splices a plugin's own rules in at the point where its cascade needs
// them (bar, edge, node, nodeText, panel, end); order matters where specificity ties, for example
// a `.hl` edge must still win over a plugin's own edge variants.
// All colours are the host's --ui-* custom properties (see theme.js).

export function graphCss(p, animMs, x = {}) {
  return `
@property --${p}-arc-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.${p}-page{--${p}-anim:${animMs}ms;position:relative;height:100%;width:100%;overflow:hidden;outline:none;color:var(--ui-text-primary)}
.${p}-bar{position:absolute;inset:0 0 auto 0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--ui-stroke-secondary);background:color-mix(in srgb,var(--ui-bg-chrome) 85%,transparent);backdrop-filter:blur(10px)}
.${p}-bar .${p}-sp{flex:1}
${x.bar || ''}
.${p}-bar .${p}-grp{display:inline-flex;align-items:center;gap:6px}
.${p}-foot{position:absolute;inset:auto 0 0 0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:5px 10px;border-top:1px solid var(--ui-stroke-secondary);background:color-mix(in srgb,var(--ui-bg-chrome) 85%,transparent);backdrop-filter:blur(10px)}
.${p}-chip{--c:var(--ui-text-tertiary);display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px 0 6px;border:1px solid color-mix(in srgb,var(--c) 35%,var(--ui-stroke-secondary));border-radius:999px;font-size:12px;cursor:pointer;user-select:none;background:color-mix(in srgb,var(--c) 12%,transparent);color:inherit;transition:opacity .15s,border-color .15s,background .15s}
.${p}-chip:hover{border-color:color-mix(in srgb,var(--c) 70%,var(--ui-stroke-secondary))}
.${p}-chip .codicon{color:var(--c)}
.${p}-chip.off{opacity:.35;background:transparent;border-color:var(--ui-stroke-secondary);filter:grayscale(1)}
.${p}-chip b{font-weight:600;font-variant-numeric:tabular-nums}
.${p}-stage{position:absolute;inset:0;cursor:grab;touch-action:none}
.${p}-stage.drag{cursor:grabbing}
.${p}-world{position:absolute;left:0;top:0;transform-origin:0 0}
.${p}-world svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.${p}-band{position:absolute;left:0;top:0;border:1px dashed var(--ui-stroke-secondary);border-radius:12px;pointer-events:none}
.${p}-band-t{position:absolute;left:24px;right:24px;top:12px;line-height:1.2;font-weight:600;color:var(--ui-text-secondary)}
.${p}-band-t>*{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${p}-band-t small{font-size:.62em;font-weight:400;color:var(--ui-text-tertiary)}
.${p}-edge{fill:none;stroke:var(--ui-stroke-primary);stroke-width:1.6}
${x.edge || ''}
.${p}-edge.hl{stroke:var(--ui-accent);stroke-width:2.4}
.${p}-node{position:absolute;left:0;top:0;display:flex;animation:${p}-in .25s ease-out;flex-direction:column;justify-content:center;gap:3px;padding:0 10px 0 14px;border:1px solid var(--ui-stroke-secondary);border-radius:8px;background:var(--ui-bg-elevated);cursor:pointer;overflow:hidden}
${x.node || ''}
.${p}-node:hover{border-color:var(--ui-accent)}
.${p}-node.sel{border:2px solid var(--ui-accent)}
.${p}-node.rel{border-color:var(--ui-accent)}
.${p}-node .${p}-stripe{position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:0 2px 2px 0}
.${p}-arc{position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;pointer-events:none;background:conic-gradient(from var(--${p}-arc-angle),transparent 0deg,var(--${p}-tone,var(--ui-green)) 55deg,transparent 110deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:${p}-arc-spin 2.2s linear infinite}
.${p}-arc.stale{--${p}-tone:var(--ui-yellow);animation-duration:6s}
@keyframes ${p}-arc-spin{to{--${p}-arc-angle:360deg}}
:root[data-renderer-animations-paused] .${p}-arc{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.${p}-arc{animation:none;--${p}-arc-angle:300deg}}
@keyframes ${p}-in{from{opacity:0}}
.${p}-world.${p}-anim,.${p}-world.${p}-anim .${p}-node,.${p}-world.${p}-anim .${p}-band{transition:transform var(--${p}-anim) ease,width var(--${p}-anim) ease,height var(--${p}-anim) ease}
.${p}-world.${p}-anim .${p}-edge{transition:d var(--${p}-anim) ease}
@media (prefers-reduced-motion:reduce){.${p}-world.${p}-anim,.${p}-world.${p}-anim *{transition:none!important;animation:none!important}}
${x.nodeText || ''}
.${p}-dim{opacity:.16}
.${p}-hint{margin-left:auto;min-width:0;font-size:11.5px;color:var(--ui-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.${p}-panel{position:absolute;top:0;right:0;bottom:0;z-index:4;width:min(460px,92%);display:flex;flex-direction:column;border-left:1px solid var(--ui-stroke-secondary);background:var(--ui-bg-chrome)}
.${p}-panel header{display:flex;align-items:flex-start;gap:6px;padding:12px;border-bottom:1px solid var(--ui-stroke-secondary)}
.${p}-panel header h2{flex:1;margin:0;font-size:14px;word-break:break-word}
.${p}-pbody{overflow:auto;padding:10px 12px 20px;font-size:12.5px}
.${p}-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-bottom:10px}
.${p}-kv>span:nth-child(odd){color:var(--ui-text-tertiary)}
.${p}-pill{display:inline-flex;align-items:center;gap:4px;padding:0 7px;border:1px solid currentColor;border-radius:999px;font-size:11.5px;font-weight:600}
.${p}-pbody h3{margin:12px 0 4px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ui-text-tertiary)}
${x.panel || ''}
.${p}-rl{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer}
.${p}-rl:hover{background:var(--ui-row-hover-background)}
.${p}-rl small{margin-left:auto;white-space:nowrap;color:var(--ui-text-tertiary)}
${x.end || ''}
`
}
