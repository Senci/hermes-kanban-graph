// Formatting helpers for times and durations.

export const fmt = t => (t ? new Date(t * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '')
export const hm = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export function dur(s) {
  s = Math.max(0, Math.round(s))
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
}
// The worker beats about once a minute; five silent minutes is five missed beats and still well short
// of the 15 minute claim window after which the dispatcher reclaims the run. A run that never beat
// counts from its start. Returns the silent seconds, or 0 when the run is not stale.
export const STALE_RUN_S = 300
export const staleAge = (t, run, now) => {
  const since = run.hb || t.hb || run.a
  return since && now - since > STALE_RUN_S ? now - since : 0
}
export const curRun = t => (t.runs || []).find(u => u.s === 'running')
