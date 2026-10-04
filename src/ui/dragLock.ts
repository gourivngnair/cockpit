/**
 * While a drag or resize is in progress nothing may replace the dragged element
 * (CLAUDE.md invariant 6). Background refreshes wait on this lock and apply after the drop.
 */
let active = false
let waiters: Array<() => void> = []

export const dragLock = {
  get active() {
    return active
  },
  set(v: boolean) {
    active = v
    if (!v) {
      const ready = waiters
      waiters = []
      ready.forEach((f) => f())
    }
  },
  /** Resolves immediately when idle, otherwise after the current gesture ends. */
  whenIdle(): Promise<void> {
    return active ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve()
  },
}
