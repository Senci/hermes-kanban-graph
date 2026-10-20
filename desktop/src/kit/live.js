// forked from packages/ui-kit at 51feea6, no sync (D41)
// Live data. Polling is the floor, the socket is an accelerator (V6): `ctx.socket` is a no-op on
// OAuth remotes and the SDK has no SSE door, so a page that depends on the socket alone is stale
// there. useLiveQuery therefore always polls; a live socket only stretches the interval, because
// pushed events already invalidate the query.

import { atom, host, queryClient, useQuery, useValue } from '@hermes/plugin-sdk'

// Off-socket poll interval and the slow safety poll while the socket is live.
export const POLL_FLOOR_MS = 15_000
export const LIVE_SAFETY_MS = 60_000

// Data is per backend: a gateway or profile switch must neither reuse nor show another backend's
// data. Put both in every query key.
export function useBackend() {
  return { conn: useValue(host.state.connectionId) ?? '', profile: useValue(host.state.profile) ?? '' }
}

// useQuery with the polling floor built in. `live` is the socket state of the backend on screen;
// `pollMs` may widen the floor for a slow upstream (a rate-limited API), never switch it off.
export function useLiveQuery({ live = false, pollMs = POLL_FLOOR_MS, liveMs = LIVE_SAFETY_MS, ...query }) {
  return useQuery({ ...query, refetchInterval: live ? liveMs : pollMs })
}

// Open the plugin's event socket and keep `status` ('off' or 'live') honest.
//   - A frame marks the socket live; silence past twice the backend's ping interval marks it off.
//   - Event bursts (a dispatcher tick writes several rows) coalesce into one invalidation.
//   - The SDK resolves a socket's backend once at connect while REST follows the window's current
//     gateway and profile, so the socket is reopened on every switch.
// `onTick(now)` runs once a second with epoch seconds, before the liveness check. Returns stop().
export function startLiveChannel(ctx, { status = atom('off'), path = '/events', invalidate, keepaliveS = 15, burstMs = 400, onTick }) {
  let pending = null
  let lastFrame = 0
  let closeSocket = null

  status.set('off')
  ctx.setInterval(() => {
    const now = Math.floor(Date.now() / 1000)
    onTick?.(now)
    if (status.get() === 'live' && now - lastFrame > 2 * keepaliveS + 5) status.set('off')
  }, 1000)

  const onFrame = frame => {
    lastFrame = Math.floor(Date.now() / 1000)
    status.set('live')
    if (!frame || !frame.events || !frame.events.length) return
    if (pending) return
    pending = ctx.setTimeout(() => {
      pending = null
      void queryClient.invalidateQueries({ queryKey: invalidate })
    }, burstMs)
  }

  const open = () => {
    closeSocket?.()
    lastFrame = 0
    status.set('off')
    closeSocket = ctx.socket(path, onFrame)
  }
  open()
  const unlisten = [host.state.connectionId.listen(open), host.state.profile.listen(open)]

  return function stop() {
    unlisten.forEach(off => off())
    closeSocket?.()
    status.set('off')
  }
}
