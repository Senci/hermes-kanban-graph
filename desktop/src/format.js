// Formatting helpers for times and durations.

export const fmt = t => (t ? new Date(t * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '')
export const hm = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export function dur(s) {
  s = Math.max(0, Math.round(s))
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
}
export const curRun = t => (t.runs || []).find(u => u.s === 'running')
