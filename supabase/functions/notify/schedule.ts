/**
 * Which alerts are due right now. Pure (no network, no clock), so it is unit-tested.
 *
 * Decided 2026-10-04:
 *  - a class: one alert 10 minutes before it starts (events such as talks get none);
 *  - deadlines: one digest at 8:00 local time listing today's deadlines and anything overdue.
 *    If the 8:00 run is missed, the digest still goes out until noon.
 */

import type { Clock } from '../_shared/clock.ts'
export { localClock } from '../_shared/clock.ts'

export const CLASS_LEAD_MIN = 10
export const DIGEST_FROM_MIN = 8 * 60
export const DIGEST_UNTIL_MIN = 12 * 60

export interface EventLite {
  id: string
  title: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  room: string
  kind: 'class' | 'event'
}

export interface TaskLite {
  id: string
  content: string
  deadline: string | null // YYYY-MM-DD
  recurring: boolean
}

export interface Alert {
  key: string // used to remember it was sent
  title: string
  body: string
  tag: string
}

const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

const list = (names: string[], max = 4) => (names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max} more`)

export function dueAlerts(clock: Clock, events: EventLite[], tasks: TaskLite[], sent: ReadonlySet<string>): Alert[] {
  const out: Alert[] = []

  for (const e of events) {
    if (e.kind !== 'class' || e.date !== clock.date) continue
    const start = toMin(e.start)
    const key = `class:${e.id}`
    if (sent.has(key)) continue
    if (clock.minutes >= start - CLASS_LEAD_MIN && clock.minutes < start) {
      const mins = start - clock.minutes
      out.push({
        key,
        title: `${e.title} at ${e.start}`,
        body: `Starts in ${mins} ${mins === 1 ? 'minute' : 'minutes'}${e.room ? `, ${e.room}` : ''}`,
        tag: `class-${e.id}`,
      })
    }
  }

  const digestKey = `digest:${clock.date}`
  if (!sent.has(digestKey) && clock.minutes >= DIGEST_FROM_MIN && clock.minutes < DIGEST_UNTIL_MIN) {
    const real = tasks.filter((t) => !t.recurring && t.deadline)
    const today = real.filter((t) => t.deadline === clock.date).map((t) => t.content)
    const overdue = real.filter((t) => (t.deadline as string) < clock.date).map((t) => t.content)
    if (today.length || overdue.length) {
      const lines = []
      if (today.length) lines.push(`Due today: ${list(today)}`)
      if (overdue.length) lines.push(`Overdue: ${list(overdue)}`)
      out.push({
        key: digestKey,
        title: today.length ? (today.length === 1 ? '1 deadline today' : `${today.length} deadlines today`) : `${overdue.length} overdue`,
        body: lines.join('\n'),
        tag: `digest-${clock.date}`,
      })
    }
  }

  return out
}
