// forked from packages/ui-kit at 51feea6, no sync (D41)
import { useEffect, useState } from 'react'

export const stopEvent = e => e.stopPropagation()

// Everything reachable from `k` through `map` (a Map of key to neighbour keys), added to `acc`.
export function walk(k, map, acc) {
  for (const n of map.get(k) || []) {
    if (!acc.has(n)) {
      acc.add(n)
      walk(n, map, acc)
    }
  }
  return acc
}

export function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}
