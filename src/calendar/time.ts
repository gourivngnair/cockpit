export const START = 7 // calendar starts at 7 am
export const END = 24 // and runs to midnight
export const HOUR_PX = 64
export const STEP = 15 // minutes: blocks snap to this

const snap = (m: number) => Math.round(m / STEP) * STEP

/**
 * Start minute for a block whose top edge is at pixel `topY`, in a lane whose top is `laneTop`.
 * Snapped to 15 minutes and kept inside the calendar, leaving room for `minutes` before midnight.
 */
export function slotFromY(topY: number, laneTop: number, minutes: number, hourPx = HOUR_PX): number {
  const raw = START * 60 + snap(((topY - laneTop) / hourPx) * 60)
  const latest = Math.max(START * 60, END * 60 - Math.max(minutes, STEP))
  return Math.max(START * 60, Math.min(latest, raw))
}

/** New length after dragging the bottom edge by `dy` pixels. 15 minutes minimum, midnight maximum. */
export function resizedMinutes(start: number, minutes: number, dy: number, hourPx = HOUR_PX): number {
  const next = minutes + snap((dy / hourPx) * 60)
  return Math.max(STEP, Math.min(next, END * 60 - start))
}
