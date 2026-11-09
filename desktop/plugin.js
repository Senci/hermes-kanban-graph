// desktop/src/index.js
import { host as host2, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA } from "@hermes/plugin-sdk";
import { createElement as h5 } from "react";

// desktop/src/kit/live.js
import { atom, host, queryClient, useQuery, useValue } from "@hermes/plugin-sdk";
var POLL_FLOOR_MS = 15e3;
var LIVE_SAFETY_MS = 6e4;
function useBackend() {
  return { conn: useValue(host.state.connectionId) ?? "", profile: useValue(host.state.profile) ?? "" };
}
function useLiveQuery({ live = false, paused = false, pollMs = POLL_FLOOR_MS, liveMs = LIVE_SAFETY_MS, ...query }) {
  return useQuery({ ...query, refetchInterval: paused ? false : live ? liveMs : pollMs, ...paused ? { refetchOnWindowFocus: false, refetchOnReconnect: false } : {} });
}
function startLiveChannel(ctx, { status = atom("off"), path = "/events", invalidate, keepaliveS = 15, burstMs = 400, onTick, isPaused }) {
  let pending = null;
  let lastFrame = 0;
  let closeSocket = null;
  status.set("off");
  ctx.setInterval(() => {
    const now = Math.floor(Date.now() / 1e3);
    onTick?.(now);
    if (status.get() === "live" && now - lastFrame > 2 * keepaliveS + 5) status.set("off");
  }, 1e3);
  const onFrame = (frame) => {
    lastFrame = Math.floor(Date.now() / 1e3);
    status.set("live");
    if (!frame || !frame.events || !frame.events.length) return;
    if (pending) return;
    pending = ctx.setTimeout(() => {
      pending = null;
      if (isPaused?.()) return;
      void queryClient.invalidateQueries({ queryKey: invalidate });
    }, burstMs);
  };
  const open = () => {
    closeSocket?.();
    lastFrame = 0;
    status.set("off");
    closeSocket = ctx.socket(path, onFrame);
  };
  open();
  const unlisten = [host.state.connectionId.listen(open), host.state.profile.listen(open)];
  return function stop() {
    unlisten.forEach((off) => off());
    closeSocket?.();
    status.set("off");
  };
}

// desktop/src/kit/theme.js
var ui = (name) => `var(--ui-${name})`;
var TONE = {
  text: ui("text-primary"),
  muted: ui("text-tertiary"),
  secondary: ui("text-secondary"),
  faint: ui("text-quaternary"),
  accent: ui("accent"),
  green: ui("green"),
  red: ui("red"),
  yellow: ui("yellow"),
  blue: ui("blue"),
  purple: ui("purple")
};
var muted = { color: TONE.muted };
function mountStyle(id, css) {
  const style = document.createElement("style");
  style.dataset.plugin = id;
  style.textContent = css;
  document.head.appendChild(style);
  return () => style.remove();
}

// desktop/src/sizes.js
var NW = 240;
var NH = 58;

// desktop/src/layout-start.js
// kg:layout-start @preserve

// desktop/src/kit/layered.js
var GAP_X = 80;
var GAP_Y = 18;
var GAP_DOWN = 64;
var COMP_GAP = 44;
var BAND_GAP = 90;
var BAND_HEAD = 72;
var BAND_MIN_W = 600;
var GRID_COLS = 5;
var HEAD_TOP = 12;
var HEAD_FS_MAX = Math.floor((BAND_HEAD + 8 - HEAD_TOP - 8) / (1.2 + 0.62 * 1.2));
var dagHeadFont = (scale) => Math.min(HEAD_FS_MAX, Math.max(15, 13 / scale));
var ORDER_SWEEPS = 4;
var PLACE_SWEEPS = 4;
function dagLayers(nodes, parents, children, ord) {
  const indeg = new Map(nodes.map((n) => [n, parents.get(n).length]));
  const depth = new Map(nodes.map((n) => [n, 0]));
  const topo = nodes.filter((n) => !indeg.get(n)).sort((a, b) => ord.get(a) - ord.get(b));
  for (let i = 0; i < topo.length; i++) {
    for (const c of children.get(topo[i])) {
      depth.set(c, Math.max(depth.get(c), depth.get(topo[i]) + 1));
      indeg.set(c, indeg.get(c) - 1);
      if (!indeg.get(c)) topo.push(c);
    }
  }
  for (let i = topo.length - 1; i >= 0; i--) {
    const kids = children.get(topo[i]);
    if (kids.length) depth.set(topo[i], Math.min(...kids.map((c) => depth.get(c))) - 1);
  }
  return depth;
}
var dagMean = (xs, f, dflt) => xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : dflt;
function dagComponent(comp, links, ord) {
  const parents = new Map(comp.map((k) => [k, []])), children = new Map(comp.map((k) => [k, []]));
  for (const [p, c] of links) {
    parents.get(c).push(p);
    children.get(p).push(c);
  }
  const depth = dagLayers(comp, parents, children, ord);
  const lo = Math.min(...depth.values());
  const L = [];
  for (const n of [...comp].sort((a, b) => ord.get(a) - ord.get(b))) {
    const d = depth.get(n) - lo;
    while (L.length <= d) L.push([]);
    L[d].push(n);
  }
  const at = /* @__PURE__ */ new Map();
  L.forEach((l) => l.forEach((n, i) => at.set(n, i)));
  for (let s = 0; s < ORDER_SWEEPS; s++) {
    const nb = s % 2 ? children : parents;
    for (const l of s % 2 ? [...L].reverse() : L) {
      const key = new Map(l.map((n) => [n, dagMean(nb.get(n), (m) => at.get(m), at.get(n))]));
      l.sort((a, b) => key.get(a) - key.get(b) || at.get(a) - at.get(b));
      l.forEach((n, i) => at.set(n, i));
    }
  }
  const y = /* @__PURE__ */ new Map();
  L.forEach((l) => l.forEach((n, i) => y.set(n, i - (l.length - 1) / 2)));
  for (let s = 0; s < PLACE_SWEEPS; s++) {
    for (const l of s % 2 ? [...L].reverse() : L) {
      const wish = l.map((n) => dagMean([...parents.get(n), ...children.get(n)], (m) => y.get(m), y.get(n)));
      const out = [];
      wish.forEach((w, i) => out.push(i ? Math.max(w, out[i - 1] + 1) : w));
      const shift = dagMean(wish.map((w, i) => w - out[i]), (v) => v, 0);
      l.forEach((n, i) => y.set(n, out[i] + shift));
    }
  }
  const min = Math.min(...y.values()), max = Math.max(...y.values());
  return { layer: new Map(comp.map((n) => [n, depth.get(n) - lo])), slot: new Map([...y].map(([n, v]) => [n, v - min])), layers: L.length, span: max - min + 1 };
}
function dagGridShape(n, aspect, gapX, sz) {
  const { NW: NW2, NH: NH2 } = sz;
  const cw = NW2 + gapX, ch = NH2 + GAP_Y;
  return [Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect * ch / cw)))), cw, ch];
}
function dagBoard(tasks, links, rank, ord, mode, sz) {
  const { NW: NW2, NH: NH2 } = sz;
  const xy = /* @__PURE__ */ new Map();
  const status = new Map(tasks.map((t) => [t.k, t.s]));
  const byStatus = (a, b) => (rank.get(status.get(a)) ?? 99) - (rank.get(status.get(b)) ?? 99) || ord.get(a) - ord.get(b);
  const ids = tasks.map((t) => t.k);
  if (mode === "grid") {
    const [cols2, cw, ch] = dagGridShape(ids.length, 2.2, GAP_X * 0.3, sz);
    ids.sort(byStatus).forEach((n, i) => xy.set(n, [i % cols2 * cw, BAND_HEAD + Math.floor(i / cols2) * ch]));
    const rows = Math.ceil(ids.length / cols2);
    return { xy, h: BAND_HEAD + rows * ch - GAP_Y, w: Math.max(BAND_MIN_W, cols2 * cw - GAP_X * 0.3) };
  }
  if (mode === "status") {
    const parents = new Map(ids.map((k) => [k, []])), children = new Map(ids.map((k) => [k, []]));
    for (const [p, c] of links) {
      parents.get(c).push(p);
      children.get(p).push(c);
    }
    const depth = dagLayers(ids, parents, children, ord);
    const cols2 = [...new Set(ids.map((k) => status.get(k)))].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
    const maxRows = Math.max(6, Math.ceil(Math.sqrt(ids.length * 2)));
    let x2 = 0, h6 = 0;
    for (const s of cols2) {
      const col = ids.filter((k) => status.get(k) === s).sort((a, b) => depth.get(a) - depth.get(b) || ord.get(a) - ord.get(b));
      for (let i = 0; i < col.length; i++) {
        xy.set(col[i], [x2 + Math.floor(i / maxRows) * (NW2 + GAP_Y), BAND_HEAD + i % maxRows * (NH2 + GAP_Y)]);
      }
      const sub = Math.ceil(col.length / maxRows);
      x2 += sub * (NW2 + GAP_Y) - GAP_Y + GAP_X;
      h6 = Math.max(h6, BAND_HEAD + Math.min(col.length, maxRows) * (NH2 + GAP_Y) - GAP_Y);
    }
    return { xy, h: h6, w: Math.max(BAND_MIN_W, x2 - GAP_X) };
  }
  const root = new Map(ids.map((k) => [k, k]));
  const find = (v) => {
    while (root.get(v) !== v) {
      root.set(v, root.get(root.get(v)));
      v = root.get(v);
    }
    return v;
  };
  for (const [p, c] of links) root.set(find(p), find(c));
  const comps = /* @__PURE__ */ new Map(), compLinks = /* @__PURE__ */ new Map();
  for (const k of ids) {
    const r = find(k);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(k);
  }
  for (const l of links) {
    const r = find(l[0]);
    if (!compLinks.has(r)) compLinks.set(r, []);
    compLinks.get(r).push(l);
  }
  const linked = [...comps.entries()].filter(([, c]) => c.length > 1).sort(([, a], [, b]) => b.length - a.length || ord.get(a[0]) - ord.get(b[0]));
  const single = [...comps.values()].filter((c) => c.length === 1).map((c) => c[0]).sort(byStatus);
  const down = mode === "down";
  let y = BAND_HEAD, x = 0, w = 0, rowH = 0;
  for (const [r, comp] of linked) {
    const d = dagComponent(comp, compLinks.get(r) || [], ord);
    if (down) {
      const sx = NW2 + GAP_Y * 2, cw = d.span * sx - GAP_Y * 2;
      for (const n of comp) xy.set(n, [x + d.slot.get(n) * sx, y + d.layer.get(n) * (NH2 + GAP_DOWN)]);
      x += cw + COMP_GAP * 2;
      rowH = Math.max(rowH, d.layers * (NH2 + GAP_DOWN) - GAP_DOWN);
      w = Math.max(w, x - COMP_GAP * 2);
    } else {
      for (const n of comp) xy.set(n, [d.layer.get(n) * (NW2 + GAP_X), y + d.slot.get(n) * (NH2 + GAP_Y)]);
      y += d.span * (NH2 + GAP_Y) - GAP_Y + COMP_GAP;
      w = Math.max(w, d.layers * (NW2 + GAP_X) - GAP_X);
    }
  }
  if (down && linked.length) y += rowH + COMP_GAP;
  if (linked.length && !single.length) y -= COMP_GAP;
  const cellW = NW2 + GAP_X * 0.3;
  const cols = Math.max(GRID_COLS, Math.floor((w + GAP_X * 0.3) / cellW));
  single.forEach((n, i) => xy.set(n, [i % cols * cellW, y + Math.floor(i / cols) * (NH2 + GAP_Y)]));
  if (single.length) {
    y += Math.ceil(single.length / cols) * (NH2 + GAP_Y) - GAP_Y;
    w = Math.max(w, Math.min(single.length, cols) * cellW - GAP_X * 0.3);
  }
  return { xy, h: y, w: Math.max(w, BAND_MIN_W) };
}
function dagReduce(links) {
  const kids = /* @__PURE__ */ new Map();
  for (const [p, c] of links) {
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(c);
  }
  const reachesAround = (p, c) => {
    const seen = /* @__PURE__ */ new Set([p]), stack = (kids.get(p) || []).filter((k) => k !== c);
    while (stack.length) {
      const n = stack.pop();
      if (n === c) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const k of kids.get(n) || []) if (!seen.has(k)) stack.push(k);
    }
    return false;
  };
  return links.filter(([p, c]) => !reachesAround(p, c));
}
var PORT_DOWN = 22;
var PORT_FLOW = 11;
function dagPorts(links, pos, down, sz) {
  const { NW: NW2, NH: NH2 } = sz;
  const out = /* @__PURE__ */ new Map(), inn = /* @__PURE__ */ new Map(), off = /* @__PURE__ */ new Map();
  for (const l of links) {
    if (!out.has(l[0])) out.set(l[0], []);
    if (!inn.has(l[1])) inn.set(l[1], []);
    out.get(l[0]).push(l);
    inn.get(l[1]).push(l);
  }
  const axis = down ? 0 : 1, step = down ? PORT_DOWN : PORT_FLOW, span = (down ? NW2 : NH2) * 0.6;
  const spread = (groups, end2, far) => {
    for (const ls of groups.values()) {
      ls.sort((a, b) => pos.get(a[far])[axis] - pos.get(b[far])[axis] || pos.get(a[far])[1 - axis] - pos.get(b[far])[1 - axis]);
      const s = ls.length > 1 ? Math.min(step, span / (ls.length - 1)) : 0;
      ls.forEach((l, i) => {
        const key = `${l[0]}>${l[1]}`;
        if (!off.has(key)) off.set(key, [0, 0]);
        off.get(key)[end2] = (i - (ls.length - 1) / 2) * s;
      });
    }
  };
  spread(out, 0, 1);
  spread(inn, 1, 0);
  return off;
}
function dagEdge(a, b, down, oa, ob, sz) {
  const { NW: NW2, NH: NH2 } = sz;
  if (down && b[1] >= a[1] + NH2) {
    const x1 = a[0] + NW2 / 2 + oa, y12 = a[1] + NH2, x2 = b[0] + NW2 / 2 + ob, y22 = b[1], dy = Math.max(24, (y22 - y12) / 2);
    return `M${x1},${y12} C${x1},${y12 + dy} ${x2},${y22 - dy} ${x2},${y22}`;
  }
  const y1 = a[1] + NH2 / 2 + (down ? 0 : oa), y2 = b[1] + NH2 / 2 + (down ? 0 : ob);
  if (b[0] >= a[0] + NW2) {
    const x1 = a[0] + NW2, x2 = b[0], dx = Math.max(30, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }
  if (b[0] + NW2 <= a[0]) {
    const x1 = a[0], x2 = b[0] + NW2, dx = Math.max(30, (x1 - x2) / 2);
    return `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}`;
  }
  const x = a[0] + NW2, bulge = 28 + Math.min(60, Math.abs(y2 - y1) / 6);
  return `M${x},${y1} C${x + bulge},${y1} ${x + bulge},${y2} ${x},${y2}`;
}
var ARRANGE_MODES = [
  ["flow", "Flow, left to right"],
  ["down", "Flow, top down"],
  ["status", "Columns by status"],
  ["grid", "Compact grid"]
];
function dagPlace(g, shown, links, aspect, mode, sz, sameBoardOnly) {
  const rank = new Map(g.statuses.map((s, i) => [s, i]));
  const ord = new Map(g.tasks.map((t, i) => [t.k, i]));
  const board = new Map(g.tasks.map((t) => [t.k, t.b]));
  const tasksBy = /* @__PURE__ */ new Map(), linksBy = /* @__PURE__ */ new Map();
  for (const t of g.tasks) {
    if (!shown.has(t.k)) continue;
    if (!tasksBy.has(t.b)) tasksBy.set(t.b, []);
    tasksBy.get(t.b).push(t);
  }
  for (const l of links) {
    const b = board.get(l[0]);
    if (sameBoardOnly && b !== board.get(l[1])) continue;
    if (!linksBy.has(b)) linksBy.set(b, []);
    linksBy.get(b).push(l);
  }
  const placed = g.boards.filter((b) => tasksBy.has(b.slug)).map((b) => ({ b, n: tasksBy.get(b.slug).length, ...dagBoard(tasksBy.get(b.slug), linksBy.get(b.slug) || [], rank, ord, mode, sz) }));
  const area = placed.reduce((s, p) => s + (p.w + BAND_GAP) * (p.h + BAND_GAP), 0);
  const shelfW = Math.max(Math.sqrt(area * aspect), ...placed.map((p) => p.w));
  const pos = /* @__PURE__ */ new Map(), bands = [];
  let x = 0, y = 0, rowH = 0;
  for (const p of [...placed].sort((a, b) => b.h - a.h)) {
    if (x > 0 && x + p.w > shelfW) {
      x = 0;
      y += rowH + BAND_GAP;
      rowH = 0;
    }
    for (const [k, [tx, ty]] of p.xy) pos.set(k, [x + tx, y + ty]);
    bands.push({ ...p.b, x, y, w: p.w, h: p.h, shown: p.n });
    x += p.w + BAND_GAP;
    rowH = Math.max(rowH, p.h);
  }
  const down = mode === "down", ports = dagPorts(links, pos, down, sz);
  const routes = new Map(links.map(([p, c]) => {
    const key = `${p}>${c}`, [oa, ob] = ports.get(key);
    return [key, dagEdge(pos.get(p), pos.get(c), down, oa, ob, sz)];
  }));
  let box = null;
  for (const b of bands) {
    box = box || [Infinity, Infinity, -Infinity, -Infinity];
    box = [Math.min(box[0], b.x - 24), Math.min(box[1], b.y - 8), Math.max(box[2], b.x + b.w + 24), Math.max(box[3], b.y + b.h + 8)];
  }
  return { pos, bands, routes, box, down };
}

// desktop/src/layout.js
var SZ = { NW, NH };
var KG_MODES = ARRANGE_MODES;
var kgHeadFont = dagHeadFont;
function kgLayout(g, shown, aspect = 1.6, mode = "flow") {
  const visible = g.links.filter(([p, c]) => shown.has(p) && shown.has(c));
  const links = dagReduce(visible);
  const { pos, bands, routes, box } = dagPlace(g, shown, links, aspect, mode, SZ, false);
  return { pos, bands, links, implied: visible.length - links.length, routes, box, quiet: mode === "grid" };
}

// desktop/src/layout-end.js
// kg:layout-end @preserve

// desktop/src/kit/css.js
function graphCss(p, animMs, x = {}) {
  return `
@property --${p}-arc-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
.${p}-page{--${p}-anim:${animMs}ms;position:relative;height:100%;width:100%;overflow:hidden;outline:none;color:var(--ui-text-primary)}
.${p}-bar{position:absolute;inset:0 0 auto 0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--ui-stroke-secondary);background:color-mix(in srgb,var(--ui-bg-chrome) 85%,transparent);backdrop-filter:blur(10px)}
.${p}-bar .${p}-sp{flex:1}
${x.bar || ""}
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
${x.edge || ""}
.${p}-edge.hl{stroke:var(--ui-accent);stroke-width:2.4}
.${p}-node{position:absolute;left:0;top:0;display:flex;animation:${p}-in .25s ease-out;flex-direction:column;justify-content:center;gap:3px;padding:0 10px 0 14px;border:1px solid var(--ui-stroke-secondary);border-radius:8px;background:var(--ui-bg-elevated);cursor:pointer;overflow:hidden}
${x.node || ""}
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
${x.nodeText || ""}
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
${x.panel || ""}
.${p}-rl{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer}
.${p}-rl:hover{background:var(--ui-row-hover-background)}
.${p}-rl small{margin-left:auto;white-space:nowrap;color:var(--ui-text-tertiary)}
${x.end || ""}
`;
}

// desktop/src/model.js
var ID = "kanban-graph";
var PATH = "/kanban-graph";
var ALL = "__all__";
var KEEPALIVE_S = 15;
var ANIM_MS = 350;
var SEARCH_DEBOUNCE_MS = 150;
var STATUS = {
  triage: { icon: "inbox", tone: ui("text-tertiary") },
  todo: { icon: "circle-outline", tone: ui("text-secondary") },
  scheduled: { icon: "watch", tone: ui("purple") },
  ready: { icon: "play-circle", tone: ui("blue") },
  running: { icon: "sync", tone: ui("green") },
  blocked: { icon: "error", tone: ui("red") },
  review: { icon: "eye", tone: ui("yellow") },
  done: { icon: "pass", tone: ui("text-tertiary") },
  archived: { icon: "archive", tone: ui("text-quaternary") }
};
var meta = (s) => STATUS[s] || STATUS.todo;
var MODES = [
  { id: "running", label: "Running + lineage" },
  { id: "open", label: "Open" },
  { id: "all", label: "All" }
];
var DEFAULTS = { mode: "running", board: ALL, arrange: "flow", density: "comfortable", color: "status", fields: ["id", "assignee", "model"] };
var DENSITIES = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" }
];
var COLOR_BYS = [
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "assignee", label: "Assignee" }
];
var PEOPLE = [ui("blue"), ui("purple"), ui("green"), ui("yellow"), ui("red")];
function stripeTone(t, color, maxP) {
  if (color === "priority") {
    if (!(t.p > 0)) return ui("text-quaternary");
    const r = t.p / maxP;
    return r >= 0.75 ? ui("red") : r >= 0.4 ? ui("yellow") : ui("blue");
  }
  if (color === "assignee") {
    if (!t.a) return ui("text-quaternary");
    let n = 0;
    for (const ch of t.a) n = n * 31 + ch.charCodeAt(0) >>> 0;
    return PEOPLE[n % PEOPLE.length];
  }
  return meta(t.s).tone;
}
var SUBTITLE_FIELDS = [
  { id: "id", label: "Id" },
  { id: "assignee", label: "Assignee" },
  { id: "model", label: "Model" }
];
var MODE_PARAMS = { running: { focus: "running" }, open: { hide: "done" }, all: {} };

// desktop/src/css.js
var bar = `
.kg-bar .kg-seg{grid-auto-columns:auto}
`;
var nodeText = `
.kg-node .kg-t{display:flex;align-items:flex-start;gap:6px;font-size:12.5px;font-weight:600;line-height:1.3}
.kg-node .kg-tt{min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}
.kg-node .kg-flags{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px}
.kg-node .kg-stale{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;line-height:1.3;color:var(--ui-text-secondary)}
.kg-node .kg-pri{padding:0 5px;border:1px solid var(--ui-stroke-primary);border-radius:999px;font-size:10px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums;color:var(--ui-text-secondary)}
.kg-node .kg-s{font-size:11px;line-height:1.3;color:var(--ui-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;
var panel = `
.kg-pbody pre{margin:4px 0 10px;padding:8px;white-space:pre-wrap;word-break:break-word;border:1px solid var(--ui-stroke-secondary);border-radius:6px;background:var(--ui-bg-editor);font:11.5px/1.45 var(--font-mono,ui-monospace,monospace)}
`;
var end = `
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
`;
var CSS = graphCss("kg", ANIM_MS, { bar, nodeText, panel, end });

// desktop/src/page.js
import { EmptyState, ErrorState, Loader, useValue as useValue5 } from "@hermes/plugin-sdk";
import { createElement as h4, Fragment as Fragment2, useCallback as useCallback2, useEffect as useEffect2, useLayoutEffect, useMemo, useRef as useRef2, useState as useState2 } from "react";

// desktop/src/kit/shell.js
import { createElement as h } from "react";

// desktop/src/kit/util.js
import { useEffect, useState } from "react";
var stopEvent = (e) => e.stopPropagation();
function walk(k, map, acc) {
  for (const n of map.get(k) || []) {
    if (!acc.has(n)) {
      acc.add(n);
      walk(n, map, acc);
    }
  }
  return acc;
}
function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// desktop/src/kit/shell.js
function Shell({ prefix, pageRef, onKeyDown, children }) {
  return h("div", { ref: pageRef, className: `${prefix}-page`, tabIndex: 0, onKeyDown }, ...[].concat(children));
}
function Stage({ prefix, stageRef, handlers, children }) {
  return h("div", { ref: stageRef, className: `${prefix}-stage`, ...handlers }, children);
}
function Bar({ prefix, children }) {
  return h("div", { className: `${prefix}-bar`, onPointerDown: stopEvent, onClick: stopEvent }, ...[].concat(children));
}
function FootBar({ prefix, footRef, children }) {
  return h("div", { ref: footRef, className: `${prefix}-foot`, onPointerDown: stopEvent, onClick: stopEvent }, ...[].concat(children));
}

// desktop/src/kit/viewport.js
import { useCallback, useRef } from "react";
function useViewport(stageRef, worldRef, onScale, { prefix, animMs = 350, minScale = 0.05 }) {
  const v = useRef({ x: 0, y: 0, s: 1 });
  const animT = useRef(null);
  const animate = useCallback((on) => {
    const w = worldRef.current;
    if (!w) return;
    clearTimeout(animT.current);
    w.classList.toggle(`${prefix}-anim`, on);
    if (on) animT.current = setTimeout(() => w.classList.remove(`${prefix}-anim`), animMs + 50);
  }, [worldRef, prefix, animMs]);
  const apply = useCallback(() => {
    const w = worldRef.current;
    if (w) w.style.transform = `translate(${v.current.x}px,${v.current.y}px) scale(${v.current.s})`;
    onScale(v.current.s);
  }, [worldRef, onScale]);
  const zoomAt = useCallback((f, cx, cy) => {
    const c = v.current, ns = Math.min(3, Math.max(minScale, c.s * f));
    c.x = cx - (cx - c.x) * ns / c.s;
    c.y = cy - (cy - c.y) * ns / c.s;
    c.s = ns;
    animate(false);
    apply();
  }, [apply, animate, minScale]);
  const fitBox = useCallback((box, topPad, rightPad, anim = false, bottomPad = 30) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !box) return;
    const [x0, y0, x1, y1] = box;
    const W = r.width - rightPad - 40, H = r.height - topPad - bottomPad;
    const s = Math.min(1.4, W / (x1 - x0), H / (y1 - y0));
    v.current = { s, x: 20 - x0 * s + (W - (x1 - x0) * s) / 2, y: topPad - y0 * s + (H - (y1 - y0) * s) / 2 };
    animate(anim);
    apply();
  }, [stageRef, apply, animate]);
  const shift = useCallback((dx, dy) => {
    v.current.x += dx * v.current.s;
    v.current.y += dy * v.current.s;
    animate(true);
    apply();
  }, [apply, animate]);
  const centerOn = useCallback((x, y, rightPad) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    const c = v.current;
    c.s = Math.max(c.s, 0.9);
    c.x = (r.width - rightPad) / 2 - x * c.s;
    c.y = r.height / 2 - y * c.s;
    animate(true);
    apply();
  }, [stageRef, apply, animate]);
  return { v, apply, animate, zoomAt, fitBox, shift, centerOn };
}

// desktop/src/components.js
import {
  Button as Button2,
  Codicon as Codicon2,
  CopyButton,
  SearchField,
  SegmentedControl as SegmentedControl2,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tip as Tip2,
  useValue as useValue3
} from "@hermes/plugin-sdk";
import { createElement as h3, Fragment } from "react";

// desktop/src/format.js
var fmt = (t) => t ? new Date(t * 1e3).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "";
var hm = (t) => new Date(t * 1e3).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dur(s) {
  s = Math.max(0, Math.round(s));
  const d = Math.floor(s / 86400), hr = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}
var STALE_RUN_S = 300;
var staleAge = (t, run, now) => {
  const since = run.hb || t.hb || run.a;
  return since && now - since > STALE_RUN_S ? now - since : 0;
};
var curRun = (t) => (t.runs || []).find((u) => u.s === "running");

// desktop/src/view.js
import { Button, Codicon, Popover, PopoverContent, PopoverTrigger, SegmentedControl, Switch, Tip, useValue as useValue2 } from "@hermes/plugin-sdk";
import { createElement as h2 } from "react";

// desktop/src/state.js
import { atom as atom2, queryClient as queryClient2 } from "@hermes/plugin-sdk";
var api = null;
var setApi = (ctx) => {
  api = ctx;
};
var $now = atom2(Math.floor(Date.now() / 1e3));
var $minute = atom2(Math.floor(Date.now() / 6e4));
var $mode = atom2(DEFAULTS.mode);
var $board = atom2(DEFAULTS.board);
var $arrange = atom2(DEFAULTS.arrange);
var $density = atom2(DEFAULTS.density);
var $fields = atom2(DEFAULTS.fields);
var $color = atom2(DEFAULTS.color);
var $paused = atom2(false);
var $socket = atom2("off");
var PREFS = { mode: $mode, board: $board, arrange: $arrange, density: $density, fields: $fields, color: $color };
function setPref(key, value) {
  PREFS[key].set(value);
  api?.storage.set(key, value);
}
function setPaused(on) {
  if ($paused.get() === on) return;
  $paused.set(on);
  if (!on) void queryClient2.invalidateQueries({ queryKey: [ID, "graph"] });
}
function resetToolbar() {
  for (const [key, a] of Object.entries(PREFS)) {
    api?.storage.remove(key);
    a.set(DEFAULTS[key]);
  }
  setPaused(false);
}

// desktop/src/view.js
function CardView() {
  const density = useValue2($density), fields = useValue2($fields), color = useValue2($color);
  const toggleField = (id) => setPref("fields", SUBTITLE_FIELDS.map((f) => f.id).filter((x) => x === id ? !fields.includes(x) : fields.includes(x)));
  return h2(
    Popover,
    null,
    h2(Tip, { label: "Card view" }, h2(PopoverTrigger, { asChild: true }, h2(Button, { size: "icon-xs", variant: "ghost", "aria-label": "Card view" }, h2(Codicon, { name: "settings-gear" })))),
    h2(
      PopoverContent,
      { align: "end", className: "kg-view" },
      h2(
        "div",
        { className: "kg-view-row", role: "group", "aria-label": "Density" },
        h2("span", null, "Density"),
        h2(SegmentedControl, { options: DENSITIES, value: density, onChange: (id) => setPref("density", id) })
      ),
      h2(
        "div",
        { className: "kg-view-row", role: "group", "aria-label": "Stripe color" },
        h2("span", null, "Stripe color"),
        h2(SegmentedControl, { options: COLOR_BYS, value: color, onChange: (id) => setPref("color", id) })
      ),
      h2(
        "div",
        { className: "kg-view-sub", role: "group", "aria-label": "Subtitle fields" },
        h2("span", null, "Subtitle shows"),
        ...SUBTITLE_FIELDS.map((f) => h2(
          "label",
          { key: f.id, className: "kg-view-row" },
          h2("span", null, f.label),
          h2(Switch, { size: "xs", checked: fields.includes(f.id), disabled: density === "compact", onCheckedChange: () => toggleField(f.id), "aria-label": `Show ${f.label.toLowerCase()} in the subtitle` })
        ))
      )
    )
  );
}

// desktop/src/components.js
var STALE_HEARTBEAT_S = 120;
function Arc({ hb }) {
  const now = useValue3($now);
  return h3("span", { "aria-hidden": true, className: `kg-arc${hb && now - hb > STALE_HEARTBEAT_S ? " stale" : ""}` });
}
function LiveDuration({ since, suffix = "" }) {
  const now = useValue3($now);
  return h3(Fragment, null, dur(now - since) + suffix);
}
var SEP = " · ";
var plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
var onActivate = (fn) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }
};
var Node = ({ t, at, cls, view, onPick }) => {
  const m = meta(t.s), run = curRun(t), warn = t.f > 0 || t.bk;
  const minute = useValue3($minute);
  const silent = run ? Math.floor(staleAge(t, run, minute * 60) / 60) : 0;
  const show = (id) => view.fields.includes(id);
  const sub = [show("id") && t.id, show("assignee") && t.a, show("model") && t.m && t.m.replace("claude-", "")].filter(Boolean).join(SEP);
  return h3(
    "div",
    {
      className: `kg-node${run ? " live" : ""}${cls}`,
      style: { transform: `translate(${at[0]}px,${at[1]}px)`, width: NW, height: NH },
      title: t.t,
      role: "button",
      tabIndex: 0,
      "aria-label": `${t.t}, ${t.s}${t.p > 0 ? `, priority ${t.p}` : ""}${view.color === "assignee" && t.a ? `, ${t.a}` : ""}${silent ? `, no heartbeat for ${silent} min` : ""}`,
      "data-k": t.k,
      "data-id": t.id,
      onClick: (e) => {
        e.stopPropagation();
        onPick(t.k);
      },
      onKeyDown: onActivate(() => onPick(t.k))
    },
    h3("div", { className: "kg-stripe", style: { background: stripeTone(t, view.color, view.maxP) } }),
    run ? h3(Arc, { hb: run.hb || t.hb }) : null,
    h3(
      "div",
      { className: "kg-t" },
      h3(Codicon2, { name: m.icon, style: { color: m.tone }, spinning: !!run }),
      h3("span", { className: "kg-tt" }, t.t),
      t.p > 0 || warn || silent ? h3(
        "span",
        { className: "kg-flags" },
        silent ? h3("span", { className: "kg-stale", title: `No heartbeat for ${silent} min` }, h3(Codicon2, { name: "watch", style: { color: TONE.yellow } }), `stale ${silent}m`) : null,
        t.p > 0 ? h3("span", { className: "kg-pri", title: `Priority ${t.p}` }, `P${t.p}`) : null,
        warn ? h3(
          "span",
          { title: [t.bk && `Blocked: ${t.bk}`, t.f > 0 && `${t.f} failed run${t.f > 1 ? "s" : ""}`].filter(Boolean).join(". "), style: { display: "inline-flex" } },
          h3(Codicon2, { name: "warning", style: { color: TONE.red } })
        ) : null
      ) : null
    ),
    view.density === "compact" || !(run || sub) ? null : h3(
      "div",
      { className: "kg-s", style: run ? { color: TONE.green } : null },
      run ? h3(Fragment, null, "running ", h3(LiveDuration, { since: run.a }), t.a && show("assignee") ? `${SEP}${t.a}` : "") : sub
    )
  );
};
function Row({ t, onPick }) {
  const m = meta(t.s);
  return h3(
    "div",
    { className: "kg-rl", role: "button", tabIndex: 0, "aria-label": `${t.t}, ${t.s}`, onClick: () => onPick(t.k, true), onKeyDown: onActivate(() => onPick(t.k, true)) },
    h3(Codicon2, { name: m.icon, style: { color: m.tone } }),
    h3("span", null, t.t),
    h3("small", null, t.id)
  );
}
function KV({ rows }) {
  const kept = rows.filter(([, v]) => v !== "" && v !== null && v !== void 0 && v !== 0 && v !== false);
  return h3("div", { className: "kg-kv" }, ...kept.flatMap(([k, v], i) => [h3("span", { key: `k${i}` }, k), h3("span", { key: `v${i}` }, v)]));
}
function LiveRun({ t, run, generated }) {
  const L = t.live;
  const rows = [
    ["Run", `#${run.id} on ${run.pr}`],
    ["Running for", h3(Fragment, null, h3(LiveDuration, { since: run.a }), ` (since ${fmt(run.a)})`)],
    ["Heartbeat", run.hb ? h3(LiveDuration, { since: run.hb, suffix: " ago" }) : "none yet"],
    ["Runtime cap", t.mx ? dur(t.mx) : ""],
    ["First claimed", t.st ? fmt(t.st) : ""]
  ];
  if (L && !L.err) {
    rows.push(
      ["Session", L.sid],
      ["Activity", `${L.calls} tool calls, ${L.api} API calls, ${L.msgs} msgs`],
      ["Tokens", `${(L.out / 1e3).toFixed(1)}k out, ${(L.cr / 1e6).toFixed(2)}M cache read`],
      ["Est. cost", L.cost != null ? `$${Number(L.cost).toFixed(2)}` : ""],
      ["Last activity", L.last ? `${L.desc} (${hm(L.last)})` : ""]
    );
  }
  return h3(
    Fragment,
    null,
    h3("h3", null, `Live run (data ${hm(generated)})`),
    h3(KV, { rows }),
    L && L.err ? h3("pre", null, L.err) : null,
    L && L.say ? h3(Fragment, null, h3("h3", null, "Last worker note"), h3("pre", null, L.say)) : null,
    L && L.acts && L.acts.length ? h3(
      Fragment,
      null,
      h3("h3", null, `Recent actions (newest first, ${L.acts.length})`),
      h3("div", { className: "kg-acts" }, ...L.acts.map(([ts, n, a], i) => h3("div", { key: i }, h3("span", null, hm(ts)), h3("b", null, n), h3("span", null, a))))
    ) : null
  );
}
function Panel({ t, A, B, byK, hidden, generated, onPick, onClose }) {
  const m = meta(t.s), run = curRun(t);
  const sortK = (s) => [...s].sort((a, b) => (byK.get(a).c || 0) - (byK.get(b).c || 0));
  const cli = `hermes kanban --board ${t.b} show ${t.id}`;
  return h3(
    "aside",
    { className: "kg-panel", onClick: (e) => e.stopPropagation(), onPointerDown: (e) => e.stopPropagation() },
    h3(
      "header",
      null,
      h3("h2", null, t.t),
      h3(Tip2, { label: "Close (Esc)" }, h3(Button2, { size: "icon-xs", variant: "ghost", onClick: onClose, "aria-label": "Close" }, h3(Codicon2, { name: "close" })))
    ),
    h3(
      "div",
      { className: "kg-pbody" },
      h3(KV, { rows: [
        ["Status", h3(Fragment, null, h3("span", { className: "kg-pill", style: { color: m.tone } }, h3(Codicon2, { name: m.icon }), t.s), t.bk ? ` (${t.bk})` : "")],
        ["Id", t.id],
        ["Board", t.b],
        ["Assignee", t.a],
        ["Model", [t.m, t.e].filter(Boolean).join(" / ")],
        ["Priority", t.p || ""],
        ["Created", fmt(t.c)],
        ["Started", fmt(t.st)],
        ["Completed", fmt(t.d)],
        ["Failures", t.f || ""]
      ] }),
      A.size ? h3(Fragment, null, h3("h3", null, `Upstream (${A.size})`), ...sortK(A).map((k) => h3(Row, { key: k, t: byK.get(k), onPick }))) : null,
      B.size ? h3(Fragment, null, h3("h3", null, `Downstream (${B.size})`), ...sortK(B).map((k) => h3(Row, { key: k, t: byK.get(k), onPick }))) : null,
      !A.size && !B.size ? h3(Fragment, null, h3("h3", null, "Linked tasks"), h3("div", { style: { color: TONE.muted } }, t.hx ? "None shown." : "None: this task has no parent or child links.")) : null,
      t.hx ? h3("div", { style: { color: TONE.muted, margin: "4px 0" } }, `${t.hx.p} parent and ${t.hx.c} child links go to tasks outside this view${hidden.length ? ` (hidden: ${hidden.join(", ")})` : ""}.`) : null,
      run ? h3(LiveRun, { t, run, generated }) : null,
      t.runs && t.runs.length ? h3(
        Fragment,
        null,
        h3("h3", null, `Runs (${t.runs.length})`),
        h3("table", { className: "kg-runs" }, h3("tbody", null, ...t.runs.slice().reverse().map((u) => h3(
          "tr",
          { key: u.id },
          h3("td", null, `#${u.id}`),
          h3("td", null, u.o || u.s),
          h3("td", null, fmt(u.a)),
          h3("td", null, u.z ? dur(u.z - u.a) : h3(LiveDuration, { since: u.a })),
          h3("td", null, u.e)
        ))))
      ) : null,
      t.err ? h3(Fragment, null, h3("h3", null, "Last failure"), h3("pre", null, t.err)) : null,
      t.res ? h3(Fragment, null, h3("h3", null, "Result"), h3("pre", null, t.res)) : null,
      t.body ? h3(Fragment, null, h3("h3", null, "Body"), h3("pre", null, t.body)) : null,
      h3("h3", null, "CLI"),
      h3(
        "div",
        { style: { display: "flex", alignItems: "flex-start", gap: 6 } },
        h3("pre", { style: { flex: 1, margin: 0 } }, cli),
        h3(CopyButton, { text: cli, label: "Copy command" })
      )
    )
  );
}
function Toolbar({ boards, search, setSearch, onFit, onZoom, failed }) {
  const mode = useValue3($mode), board = useValue3($board), arrange = useValue3($arrange), sock = useValue3($socket), paused = useValue3($paused);
  const link = failed ? "offline" : sock === "live" ? "live" : "polling";
  const frozen = paused && !failed;
  const linkTip = frozen ? "Paused: the graph keeps what it shows until you resume" : { live: "Live: board events stream in", polling: "Polling every 15 s (event socket unavailable)", offline: `Backend unreachable: ${failed}` }[link];
  return h3(
    Bar,
    { prefix: "kg" },
    h3(Codicon2, { name: "type-hierarchy", style: { color: TONE.accent } }),
    h3("strong", { style: { fontSize: 13, marginRight: 4 } }, "Kanban graph"),
    h3(SegmentedControl2, { className: "kg-seg", options: MODES, value: mode, onChange: (id) => {
      $mode.set(id);
      api?.storage.set("mode", id);
    } }),
    h3("div", { style: { flex: "1 1 140px", maxWidth: 260 } }, h3(SearchField, { value: search, onChange: setSearch, placeholder: "Search id, title, assignee" })),
    h3(
      Select,
      { value: board, onValueChange: (v) => {
        $board.set(v);
        api?.storage.set("board", v);
      } },
      h3(SelectTrigger, { style: { width: 180 }, "aria-label": "Board" }, h3(SelectValue, null)),
      h3(
        SelectContent,
        null,
        h3(SelectItem, { value: ALL }, "All boards"),
        ...(boards || []).map((b) => h3(SelectItem, { key: b.slug, value: b.slug }, b.name))
      )
    ),
    h3(
      Select,
      { value: arrange, onValueChange: (v) => {
        $arrange.set(v);
        api?.storage.set("arrange", v);
      } },
      h3(SelectTrigger, { style: { width: 150 }, "aria-label": "Arrange" }, h3(SelectValue, null)),
      h3(SelectContent, null, ...KG_MODES.map(([id, label]) => h3(SelectItem, { key: id, value: id }, label)))
    ),
    h3("span", { className: "kg-sp" }),
    // Status and zoom wrap as one group, so a narrow window never strands a lone button on row two.
    h3(
      "span",
      { className: "kg-grp" },
      h3(
        Tip2,
        { label: linkTip },
        h3(
          "span",
          { style: { fontSize: 11.5, color: TONE.muted, display: "inline-flex", alignItems: "center" } },
          h3("span", { className: "kg-live-dot", style: { background: link === "live" ? TONE.green : link === "offline" ? TONE.red : TONE.faint } }),
          frozen ? "paused" : link
        )
      ),
      h3(
        Tip2,
        { label: paused ? "Resume live updates" : "Pause live updates" },
        h3(
          Button2,
          { size: "icon-xs", variant: paused ? "secondary" : "ghost", onClick: () => setPaused(!paused), "aria-label": "Pause live updates", "aria-pressed": paused },
          h3(Codicon2, { name: paused ? "debug-start" : "debug-pause" })
        )
      ),
      h3(CardView, null),
      h3(Tip2, { label: "Zoom out (-)" }, h3(Button2, { size: "icon-xs", variant: "ghost", onClick: () => onZoom(0.8), "aria-label": "Zoom out" }, h3(Codicon2, { name: "zoom-out" }))),
      h3(Tip2, { label: "Fit (0)" }, h3(Button2, { size: "icon-xs", variant: "ghost", onClick: onFit, "aria-label": "Fit" }, h3(Codicon2, { name: "screen-full" }))),
      h3(Tip2, { label: "Zoom in (+)" }, h3(Button2, { size: "icon-xs", variant: "ghost", onClick: () => onZoom(1.25), "aria-label": "Zoom in" }, h3(Codicon2, { name: "zoom-in" }))),
      h3(Tip2, { label: "Reset mode, board and arrange to the defaults" }, h3(Button2, { size: "icon-xs", variant: "ghost", onClick: resetToolbar, "aria-label": "Reset toolbar to defaults" }, h3(Codicon2, { name: "discard" })))
    )
  );
}
function Footer({ g, off, toggle, hint, footRef }) {
  const present = g ? g.statuses.filter((s) => g.tasks.some((t) => t.s === s)) : [];
  const counts = (s) => g.tasks.filter((t) => t.s === s).length;
  return h3(
    FootBar,
    { prefix: "kg", footRef },
    ...present.map((s) => h3(
      Tip2,
      { key: s, label: `${s} (${counts(s)}). Click: toggle. Shift+click: only ${s}.` },
      h3("button", {
        type: "button",
        className: `kg-chip${off.has(s) ? " off" : ""}`,
        style: { "--c": meta(s).tone },
        "aria-label": s,
        "aria-pressed": !off.has(s),
        onMouseDown: (e) => e.shiftKey && e.preventDefault(),
        onClick: (e) => toggle(s, e.shiftKey, present)
      }, h3(Codicon2, { name: meta(s).icon }), h3("b", null, counts(s)))
    )),
    h3("span", { className: "kg-hint", title: "Drag to pan, wheel to zoom, click a task for its lineage, Esc clears." }, hint)
  );
}

// desktop/src/data.js
import { useQuery as useQuery2, useValue as useValue4 } from "@hermes/plugin-sdk";
function graphPath(mode, board) {
  const q = new URLSearchParams(MODE_PARAMS[mode] || {});
  if (board !== ALL) q.set("board", board);
  const s = q.toString();
  return s ? `/graph?${s}` : "/graph";
}
function useGraph(mode, board) {
  const { conn, profile } = useBackend();
  const live = useValue4($socket) === "live", paused = useValue4($paused);
  return useLiveQuery({
    queryKey: [ID, "graph", conn, profile, mode, board],
    queryFn: () => api ? api.rest(graphPath(mode, board)) : Promise.reject(new Error("kanban-graph not loaded")),
    placeholderData: (prev, prevQuery) => prevQuery && prevQuery.queryKey[2] === conn && prevQuery.queryKey[3] === profile ? prev : void 0,
    live,
    paused
  });
}
function useBoards() {
  const { conn, profile } = useBackend();
  return useQuery2({
    queryKey: [ID, "boards", conn, profile],
    queryFn: () => api.rest("/boards"),
    staleTime: 6e4
  });
}
function derive(g) {
  const byK = new Map(g.tasks.map((t) => [t.k, t]));
  const up = new Map(g.tasks.map((t) => [t.k, []]));
  const down = new Map(g.tasks.map((t) => [t.k, []]));
  for (const [p, c] of g.links) {
    down.get(p)?.push(c);
    up.get(c)?.push(p);
  }
  return { byK, up, down };
}

// desktop/src/kit/route.js
function createRoute(path, { select, params }) {
  const split = () => window.location.hash.replace(/^#/, "").split("?");
  const on = () => (window.location.hash || "").replace(/^#/, "").split("?")[0] === path;
  const read = () => {
    const [here, qs = ""] = split();
    if (here !== path) return null;
    const q = new URLSearchParams(qs);
    const view = { [select]: q.get(select) || null };
    for (const k of params) view[k] = q.get(k);
    return view;
  };
  const href = (view) => {
    const q = new URLSearchParams();
    for (const k of [select, ...params]) if (view[k]) q.set(k, view[k]);
    const qs = q.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const write = (view) => {
    if (!on()) return;
    const next = href(view);
    if (window.location.hash.replace(/^#/, "") === next) return;
    window.history.replaceState(null, "", `#${next}`);
  };
  return { path, on, read, href, write };
}

// desktop/src/route.js
var route = createRoute(PATH, { select: "task", params: ["mode", "board", "arrange"] });
function payloadIsFor(g, mode, board) {
  const want = MODE_PARAMS[mode] || {};
  const focus = (want.focus || "").split(",").filter(Boolean).sort();
  const hidden = [...(want.hide || "").split(",").filter(Boolean), "archived"].sort();
  const got = (g.focus || []).slice().sort();
  const gotHidden = (g.hidden || []).slice().sort();
  if (got.length !== focus.length || gotHidden.length !== hidden.length) return false;
  if (!focus.every((v, i) => v === got[i]) || !hidden.every((v, i) => v === gotHidden[i])) return false;
  return board === ALL || g.boards.length === 1;
}
function applyRoute(r) {
  if (r.mode && MODES.some((m) => m.id === r.mode) && r.mode !== $mode.get()) {
    $mode.set(r.mode);
    api?.storage.set("mode", r.mode);
  }
  if (r.board && r.board !== $board.get()) {
    $board.set(r.board);
    api?.storage.set("board", r.board);
  }
  if (r.arrange && KG_MODES.some(([m]) => m === r.arrange) && r.arrange !== $arrange.get()) {
    $arrange.set(r.arrange);
    api?.storage.set("arrange", r.arrange);
  }
}

// desktop/src/page.js
function GraphPage() {
  const [entry] = useState2(() => {
    const r = route.read();
    if (r) applyRoute(r);
    return r;
  });
  const mode = useValue5($mode), board = useValue5($board);
  const { data: g, error, isLoading, isFetching, isPlaceholderData } = useGraph(mode, board);
  const { data: boardList } = useBoards();
  const backend = useBackend();
  useEffect2(() => () => setPaused(false), []);
  const [sel, setSel] = useState2(() => entry?.task || null);
  const [search, setSearch] = useState2("");
  const [off, setOff] = useState2(() => /* @__PURE__ */ new Set());
  const stageRef = useRef2(null), worldRef = useRef2(null), pageRef = useRef2(null), barRef = useRef2(null), footRef = useRef2(null);
  const arrange = useValue5($arrange);
  const density = useValue5($density);
  const fields = useValue5($fields);
  const color = useValue5($color);
  const maxP = useMemo(() => Math.max(1, ...g ? g.tasks.map((t2) => t2.p || 0) : []), [g]);
  const view = useMemo(() => ({ density, fields, color, maxP }), [density, fields, color, maxP]);
  const bandRefs = useRef2([]);
  const deepTask = useRef2(entry?.task || null);
  const onScale = useCallback2((s) => {
    const fs = kgHeadFont(s);
    for (const el of bandRefs.current) if (el) el.style.fontSize = `${fs}px`;
  }, []);
  const vp = useViewport(stageRef, worldRef, onScale, { prefix: "kg", animMs: ANIM_MS, minScale: 0.05 });
  const userMoved = useRef2(false);
  const fittedFor = useRef2("");
  const d = useMemo(() => g ? derive(g) : null, [g]);
  const lineage = useMemo(() => {
    if (!d || !sel || !d.byK.has(sel)) return null;
    return { A: walk(sel, d.up, /* @__PURE__ */ new Set()), B: walk(sel, d.down, /* @__PURE__ */ new Set()) };
  }, [d, sel]);
  const rel = useMemo(() => lineage ? /* @__PURE__ */ new Set([...lineage.A, ...lineage.B]) : /* @__PURE__ */ new Set(), [lineage]);
  useEffect2(() => {
    if (!g || !deepTask.current || !payloadIsFor(g, mode, board) || d.byK.has(deepTask.current)) return;
    if (mode !== "all") {
      $mode.set("all");
      api?.storage.set("mode", "all");
      return;
    }
    deepTask.current = null;
  }, [g, d, mode, board]);
  useEffect2(() => {
    if (!g || !deepTask.current || !d.byK.has(deepTask.current)) return;
    setSel(deepTask.current);
  }, [g, d]);
  useEffect2(() => {
    if (sel && g && !d.byK.has(sel) && !deepTask.current) setSel(null);
  }, [g, d, sel]);
  const q = useDebounced(search.trim().toLowerCase(), SEARCH_DEBOUNCE_MS);
  const shownSig = useMemo(() => {
    if (!g) return "";
    const match = (t2) => !off.has(t2.s) && (!q || [t2.id, t2.t, t2.a, t2.b, t2.m].some((v) => String(v || "").toLowerCase().includes(q)));
    return g.tasks.filter((t2) => t2.k === sel || rel.has(t2.k) || match(t2)).map((t2) => t2.k).join("\n");
  }, [g, off, q, sel, rel]);
  const lay = useMemo(() => {
    if (!g) return null;
    const r = stageRef.current?.getBoundingClientRect();
    return kgLayout(g, new Set(shownSig ? shownSig.split("\n") : []), r && r.height > 0 ? r.width / r.height : 1.6, arrange);
  }, [g, shownSig, arrange]);
  const filterSig = `${[...off].sort().join(",")}|${q}|${arrange}`;
  const panelW = sel && lineage ? Math.min(460, (stageRef.current?.clientWidth || 900) * 0.92) : 0;
  const barH = () => barRef.current?.firstElementChild?.offsetHeight || 44;
  const topPad = () => barH() + 10;
  const fit = useCallback2((anim = false) => {
    if (lay) vp.fitBox(lay.box, topPad(), panelW, anim, (footRef.current?.offsetHeight || 34) + 10);
  }, [lay, vp, panelW]);
  const prev = useRef2({ lay: null, filterSig: "" });
  useLayoutEffect(() => {
    const key = `${mode}|${board}`;
    const p = prev.current;
    if (!lay || isPlaceholderData) {
      vp.apply();
      return;
    }
    if (fittedFor.current !== key) {
      fittedFor.current = key;
      userMoved.current = false;
      fit(false);
    } else if (p.lay && p.lay !== lay) {
      vp.animate(true);
      const both = (k) => p.lay.pos.has(k) && lay.pos.has(k);
      let anchor = sel && both(sel) ? sel : null;
      if (!anchor && p.filterSig !== filterSig) {
        userMoved.current = false;
        fit(true);
      } else {
        if (!anchor) {
          const r = stageRef.current?.getBoundingClientRect(), c = vp.v.current;
          if (r) {
            const cx = (r.width / 2 - c.x) / c.s, cy = (r.height / 2 - c.y) / c.s;
            let best = Infinity;
            for (const [k, [x, y]] of p.lay.pos) {
              if (!lay.pos.has(k)) continue;
              const dd = (x + NW / 2 - cx) ** 2 + (y + NH / 2 - cy) ** 2;
              if (dd < best) {
                best = dd;
                anchor = k;
              }
            }
          }
        }
        if (anchor) {
          const [ox, oy] = p.lay.pos.get(anchor), [nx, ny] = lay.pos.get(anchor);
          if (ox !== nx || oy !== ny) vp.shift(ox - nx, oy - ny);
          else vp.apply();
        } else fit(true);
      }
    } else vp.apply();
    prev.current = { lay, filterSig };
  });
  const fitRef = useRef2(fit);
  fitRef.current = fit;
  const selRef = useRef2(sel);
  selRef.current = sel;
  useEffect2(() => {
    route.write({ task: sel, mode, board, arrange });
  }, [sel, mode, board, arrange]);
  useEffect2(() => {
    const onHash = () => {
      const r = route.read();
      if (!r) return;
      applyRoute(r);
      if (r.task && r.task !== selRef.current) {
        deepTask.current = r.task;
        setSel(r.task);
      } else if (!r.task && selRef.current) setSel(null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect2(() => {
    const k = deepTask.current;
    if (!k || !lay || !lay.pos.has(k)) return;
    deepTask.current = null;
    userMoved.current = false;
    vp.animate(true);
    const [x, y] = lay.pos.get(k);
    vp.centerOn(x + NW / 2, y + NH / 2, 470);
  }, [lay, vp]);
  useEffect2(() => {
    const st = stageRef.current;
    if (!st) return void 0;
    const onWheel = (e) => {
      e.preventDefault();
      userMoved.current = true;
      const r = st.getBoundingClientRect();
      vp.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 15e-4)), e.clientX - r.left, e.clientY - r.top);
    };
    st.addEventListener("wheel", onWheel, { passive: false });
    let size = "";
    const ro = new ResizeObserver(() => {
      const s = `${st.clientWidth}x${st.clientHeight}x${barH()}`;
      if (s === size) return;
      const first = !size;
      size = s;
      if (!first && !userMoved.current && !selRef.current) fitRef.current(false);
    });
    ro.observe(st);
    if (barRef.current?.firstElementChild) ro.observe(barRef.current.firstElementChild);
    return () => {
      st.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [vp]);
  const drag = useRef2(null);
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: vp.v.current.x, vy: vp.v.current.y, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const dr = drag.current;
    if (!dr || dr.id !== e.pointerId) return;
    const dx = e.clientX - dr.x, dy = e.clientY - dr.y;
    if (!dr.moved && Math.hypot(dx, dy) < 4) return;
    if (!dr.moved) {
      dr.moved = true;
      userMoved.current = true;
      vp.animate(false);
      stageRef.current.setPointerCapture(e.pointerId);
      stageRef.current.classList.add("drag");
    }
    vp.v.current.x = dr.vx + dx;
    vp.v.current.y = dr.vy + dy;
    vp.apply();
  };
  const onPointerUp = () => {
    stageRef.current?.classList.remove("drag");
  };
  const onStageClick = (e) => {
    if (drag.current?.moved) {
      drag.current = null;
      return;
    }
    drag.current = null;
    if (!e.target.closest(".kg-node")) setSel(null);
  };
  const pick = useCallback2((k, center) => {
    setSel((prevSel) => prevSel === k && !center ? null : k);
    const at = center && lay ? lay.pos.get(k) : null;
    if (at) vp.centerOn(at[0] + NW / 2, at[1] + NH / 2, 470);
  }, [lay, vp]);
  const toggle = (s, solo, present) => setOff((prevOff) => {
    const n = new Set(prevOff);
    if (solo) {
      const isSolo = !prevOff.has(s) && present.every((x) => x === s || prevOff.has(x));
      n.clear();
      if (!isSolo) present.forEach((x) => x !== s && n.add(x));
    } else if (n.has(s)) n.delete(s);
    else n.add(s);
    return n;
  });
  const zoomCenter = (f) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (r) vp.zoomAt(f, r.width / 2, r.height / 2);
  };
  const onKeyDown = (e) => {
    if (e.target.tagName === "INPUT") {
      if (e.key === "Escape") {
        setSearch("");
        e.target.blur();
      }
      return;
    }
    if (e.key === "Escape") setSel(null);
    else if (e.key === "0") fit(true);
    else if (e.key === "+" || e.key === "=") zoomCenter(1.25);
    else if (e.key === "-") zoomCenter(0.8);
    else if (e.key === "/") {
      e.preventDefault();
      pageRef.current?.querySelector(".kg-bar input")?.focus();
    } else return;
    e.stopPropagation();
  };
  let body;
  if (error && !g) {
    const where = backend.conn ? `backend "${backend.conn}", profile "${backend.profile || "default"}"` : `profile "${backend.profile || "default"}"`;
    body = h4("div", { style: { paddingTop: 80 } }, h4(ErrorState, { title: "Kanban graph backend unreachable", description: `${error.message || error} (${where}). The Python half answers only on a backend where kanban-graph is installed, in plugins.enabled and restarted since; a remote gateway needs its own install. To see this machine's boards, switch the window to This device.` }));
  } else if (isLoading || !g) {
    body = h4("div", { style: { paddingTop: 120, display: "grid", placeItems: "center" } }, h4(Loader, null));
  } else if (!g.tasks.length) {
    body = h4("div", { style: { paddingTop: 80 } }, h4(EmptyState, { title: mode === "running" ? "Nothing is running" : "No tasks", description: mode === "running" ? "No task is in the running state on these boards. Switch to Open to see queued work." : "These boards have no tasks in this view." }));
  } else {
    const any = !!lineage;
    const on = (k) => k === sel || rel.has(k);
    bandRefs.current = [];
    body = h4(
      "div",
      { ref: worldRef, className: "kg-world" },
      ...lay.bands.map((b, i) => h4(
        "div",
        { key: `b-${b.slug}`, className: "kg-band", style: { transform: `translate(${b.x - 24}px,${b.y - 8}px)`, width: b.w + 48, height: b.h + 16 } },
        h4(
          "div",
          { className: "kg-band-t", ref: (el) => {
            bandRefs.current[i] = el;
          } },
          h4("span", null, b.name),
          h4("small", null, [b.slug, b.shown === b.n ? `${b.n} tasks` : `${b.shown}/${b.n} tasks`, ...g.statuses.filter((s) => b.counts[s]).map((s) => `${b.counts[s]} ${s}`)].join(SEP))
        )
      )),
      h4(
        "svg",
        { width: 1, height: 1, key: "edges" },
        h4("defs", null, h4(
          "marker",
          { id: "kg-ah", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" },
          h4("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--ui-text-tertiary)" })
        )),
        ...lay.links.map(([p, c]) => {
          const hl = any && on(p) && on(c);
          if (lay.quiet && !hl) return null;
          const path = lay.routes.get(`${p}>${c}`);
          return h4("path", { key: `${p}>${c}`, className: `kg-edge${hl ? " hl" : ""}${any && !hl ? " kg-dim" : ""}`, d: path, style: { d: `path("${path}")` }, markerEnd: "url(#kg-ah)" });
        })
      ),
      ...g.tasks.filter((t2) => lay.pos.has(t2.k)).map((t2) => h4(Node, {
        key: t2.k,
        t: t2,
        at: lay.pos.get(t2.k),
        view,
        onPick: pick,
        cls: `${t2.k === sel ? " sel" : ""}${rel.has(t2.k) ? " rel" : ""}${any && !on(t2.k) ? " kg-dim" : ""}`
      }))
    );
  }
  const shown = lay ? lay.pos.size : 0;
  const t = sel && d ? d.byK.get(sel) : null;
  return h4(
    Shell,
    { prefix: "kg", pageRef, onKeyDown },
    h4(Stage, { prefix: "kg", stageRef, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture: onStageClick } }, body),
    h4("div", { ref: barRef }, h4(Toolbar, { boards: boardList?.boards, search, setSearch, onFit: () => fit(true), onZoom: zoomCenter, failed: error ? String(error.message || error) : "" })),
    g ? h4(Footer, { g, off, toggle, footRef, hint: `${shown}/${g.tasks.length} tasks, ${lay ? lay.links.length : 0}/${g.links.length} links, ${plural(lay ? lay.bands.length : 0, "board")}${lay && lay.implied ? `, ${lay.implied} implied hidden` : ""}${g.hidden.length ? ` (hidden: ${g.hidden.join(", ")})` : ""}${lay && lay.quiet && !sel ? ", arrows on select" : ""}${isFetching ? ", refreshing" : ""}. Data ${hm(g.generated)}` }) : null,
    t && lineage ? h4(Panel, { t, A: lineage.A, B: lineage.B, byK: d.byK, hidden: g.hidden, generated: g.generated, onPick: pick, onClose: () => setSel(null) }) : null
  );
}

// desktop/src/index.js
var index_default = {
  id: ID,
  name: "Kanban Graph",
  register(ctx) {
    setApi(ctx);
    $mode.set(ctx.storage.get("mode", DEFAULTS.mode));
    $board.set(ctx.storage.get("board", DEFAULTS.board));
    $arrange.set(KG_MODES.some(([m]) => m === ctx.storage.get("arrange")) ? ctx.storage.get("arrange") : DEFAULTS.arrange);
    $density.set(DENSITIES.some((d) => d.id === ctx.storage.get("density")) ? ctx.storage.get("density") : DEFAULTS.density);
    $color.set(COLOR_BYS.some((c) => c.id === ctx.storage.get("color")) ? ctx.storage.get("color") : DEFAULTS.color);
    const fields = ctx.storage.get("fields", null);
    $fields.set(Array.isArray(fields) ? SUBTITLE_FIELDS.map((f) => f.id).filter((id) => fields.includes(id)) : DEFAULTS.fields);
    const unmountStyle = mountStyle(ID, CSS);
    const stopLive = startLiveChannel(ctx, {
      status: $socket,
      invalidate: [ID, "graph"],
      keepaliveS: KEEPALIVE_S,
      isPaused: () => $paused.get(),
      onTick: (now) => {
        if ($paused.get()) return;
        $now.set(now);
        $minute.set(Math.floor(now / 60));
      }
    });
    ctx.onDispose(() => {
      stopLive();
      unmountStyle();
      setApi(null);
    });
    const openGraph = () => {
      host2.navigate(route.on() ? window.location.hash.replace(/^#/, "") : PATH);
    };
    ctx.registerMany([
      { id: "page", area: ROUTES_AREA, data: { path: PATH }, render: () => h5(GraphPage) },
      { id: "nav", area: SIDEBAR_NAV_AREA, order: 51, data: { path: PATH, label: "Kanban graph", codicon: "type-hierarchy" } },
      {
        id: "open",
        area: PALETTE_AREA,
        data: {
          id: "kanban-graph.open",
          action: "kanban-graph.open",
          label: "Open kanban graph",
          keywords: ["kanban", "graph", "dependencies", "lineage", "running"],
          run: openGraph
        }
      }
    ]);
  }
};
export {
  index_default as default
};
