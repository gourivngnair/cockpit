import { mondayOf, toMin, addDays } from '../lib/dates'

export interface NewEvent {
  title: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string // HH:MM
  room: string
  kind: 'class' | 'event'
}

export interface ParseResult {
  events: NewEvent[]
  errors: string[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Parses the pasted weekly schedule: a JSON array of {title,date,start,end,room?,kind?}. kind is "class" (default) or "event". */
export function parseSchedule(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { events: [], errors: ['That is not valid JSON. Paste exactly what Claude gave you.'] }
  }
  if (!Array.isArray(raw)) return { events: [], errors: ['Expected a list of classes.'] }

  const events: NewEvent[] = []
  const errors: string[] = []
  raw.forEach((r, i) => {
    const n = i + 1
    const o = (r ?? {}) as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    const date = typeof o.date === 'string' ? o.date : ''
    const start = typeof o.start === 'string' ? o.start : ''
    const end = typeof o.end === 'string' ? o.end : ''
    const room = typeof o.room === 'string' ? o.room.trim() : ''
    const kind = o.kind === undefined || o.kind === 'class' ? 'class' : o.kind === 'event' ? 'event' : null
    if (!title) return void errors.push(`Item ${n}: missing title.`)
    if (!kind) return void errors.push(`Item ${n} (${title}): kind must be "class" or "event".`)
    if (!DATE.test(date) || Number.isNaN(Date.parse(date))) return void errors.push(`Item ${n} (${title}): bad date "${date}".`)
    if (!TIME.test(start) || !TIME.test(end)) return void errors.push(`Item ${n} (${title}): times must look like 09:30.`)
    if (toMin(end) <= toMin(start)) return void errors.push(`Item ${n} (${title}): ends before it starts.`)
    events.push({ title, date, start, end, room, kind })
  })
  return { events, errors }
}

/** Monday-to-Sunday weeks touched by the events, as [from, to] inclusive. */
export function weeksOf(events: NewEvent[]): Array<[string, string]> {
  const mondays = [...new Set(events.map((e) => mondayOf(e.date)))].sort()
  return mondays.map((m) => [m, addDays(m, 6)])
}
