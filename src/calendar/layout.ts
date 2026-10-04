export interface Span {
  s: number // start minute
  e: number // end minute (already padded to a minimum visible height)
}
export type Placed<T extends Span> = T & { lane: number; lanes: number }

/** Side-by-side lanes for overlapping items (port of the v2 layout). */
export function layout<T extends Span>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e)
  const out: Placed<T>[] = []
  let cluster: T[] = []
  let clusterEnd = -1

  const flush = () => {
    const laneEnds: number[] = []
    const lanes = new Map<T, number>()
    for (const it of cluster) {
      let l = laneEnds.findIndex((end) => end <= it.s)
      if (l < 0) {
        l = laneEnds.length
        laneEnds.push(0)
      }
      laneEnds[l] = it.e
      lanes.set(it, l)
    }
    for (const it of cluster) out.push({ ...it, lane: lanes.get(it)!, lanes: laneEnds.length })
    cluster = []
  }

  for (const it of sorted) {
    if (it.s >= clusterEnd && cluster.length) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.e)
  }
  if (cluster.length) flush()
  return out
}
