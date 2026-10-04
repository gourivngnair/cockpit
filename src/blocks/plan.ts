import { toMin } from '../lib/dates'
import type { Plan } from '../tasks/types'

interface BlockLike {
  taskId: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  minutes: number
}

/**
 * The planned work time Todoist should show for a task: its earliest block that has not
 * finished yet (decided 2026-10-04). No such block means the planned time is cleared.
 */
export function earliestPlan(blocks: BlockLike[], taskId: string, now: Date): Plan | null {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const upcoming = blocks
    .filter((b) => b.taskId === taskId)
    .filter((b) => b.date > today || (b.date === today && toMin(b.start) + b.minutes > nowMin))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const first = upcoming[0]
  return first ? { date: first.date, time: first.start, minutes: first.minutes } : null
}

export const samePlan = (a: Plan | null, b: Plan | null) =>
  a === b || (a !== null && b !== null && a.date === b.date && a.time === b.time && a.minutes === b.minutes)
