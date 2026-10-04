import { addDays, parseDay, ymd } from '../lib/dates'
import { SUBGOAL_ORDER } from './rules'

export interface QuickParse {
  /** The text with the recognised duration and deadline words removed. */
  title: string
  durationMin: number | null
  deadline: string | null // YYYY-MM-DD
  subgoal: string | null
  goalName: string | null // the goal that subgoal belongs to
  /** Human-readable pieces that were recognised, for the preview chips. */
  found: string[]
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const LEAD = String.raw`(?:(?:by|due|on|before|this|next)\s+)`

const strip = (s: string, m: RegExpExecArray) => `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`

function findDuration(text: string): { minutes: number; rest: string } | null {
  const combo = /\b(?:for\s+)?(\d{1,2})\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?\b/i.exec(text)
  if (combo) return { minutes: Number(combo[1]) * 60 + Number(combo[2]), rest: strip(text, combo) }
  const hours = /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(text)
  if (hours) return { minutes: Math.round(Number(hours[1]) * 60), rest: strip(text, hours) }
  const mins = /\b(?:for\s+)?(\d{1,4})\s*(?:m|min|mins|minute|minutes)\b/i.exec(text)
  if (mins) return { minutes: Number(mins[1]), rest: strip(text, mins) }
  return null
}

/** The next occurrence of a weekday strictly after today (so "fri" on a Friday means next week). */
function nextWeekday(today: string, wd: number): string {
  const diff = (wd - parseDay(today).getDay() + 7) % 7 || 7
  return addDays(today, diff)
}

/** A day and month with no year: this year, or next year if it has already passed. */
function dayMonth(today: string, day: number, month: number): string | null {
  const year = Number(today.slice(0, 4))
  for (const y of [year, year + 1]) {
    const d = new Date(y, month, day)
    if (d.getMonth() !== month || d.getDate() !== day) return null // e.g. 31 Feb
    const s = ymd(d)
    if (s >= today) return s
  }
  return null
}

function findDeadline(text: string, today: string): { date: string; label: string; rest: string } | null {
  const rel = new RegExp(String.raw`\b${LEAD}?(today|tomorrow|tmrw|tmr)\b`, 'i').exec(text)
  if (rel) {
    const w = rel[1].toLowerCase()
    return { date: w === 'today' ? today : addDays(today, 1), label: w === 'today' ? 'today' : 'tomorrow', rest: strip(text, rel) }
  }

  const dmy = new RegExp(String.raw`\b${LEAD}?(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTHS.join('|')})[a-z]*\b`, 'i').exec(text)
  const mdy = new RegExp(String.raw`\b${LEAD}?(${MONTHS.join('|')})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b`, 'i').exec(text)
  const slash = new RegExp(String.raw`\b${LEAD}?(\d{1,2})/(\d{1,2})\b`, 'i').exec(text) // day/month, as in India
  const pick = dmy ?? mdy ?? slash
  if (pick) {
    let day: number
    let month: number
    if (pick === dmy) [day, month] = [Number(dmy![1]), MONTHS.indexOf(dmy![2].toLowerCase())]
    else if (pick === mdy) [day, month] = [Number(mdy![2]), MONTHS.indexOf(mdy![1].toLowerCase())]
    else [day, month] = [Number(slash![1]), Number(slash![2]) - 1]
    const date = dayMonth(today, day, month)
    if (date) return { date, label: date, rest: strip(text, pick) }
  }

  // A weekday counts only after "by", "due", "on", "next" and so on, or as the last word,
  // so ordinary words like "sat" or "sun" inside a title are left alone.
  const wd = new RegExp(String.raw`\b${LEAD}(${WEEKDAYS.join('|')})[a-z]*\b|\b(${WEEKDAYS.join('|')})(?:day|sday|nesday|rsday|urday)?\s*$`, 'i').exec(text.trim())
  if (wd) {
    const key = (wd[1] ?? wd[2]).toLowerCase()
    const idx = WEEKDAYS.indexOf(key.slice(0, 3))
    if (idx >= 0) {
      const t = text.trim()
      return { date: nextWeekday(today, idx), label: key, rest: strip(t, wd) }
    }
  }
  return null
}

/** Finds a subgoal word (and so the goal) in the text. Words are left in the title. */
function findSubgoal(text: string): { subgoal: string; goalName: string } | null {
  const lower = text.toLowerCase()
  for (const [goalName, labels] of Object.entries(SUBGOAL_ORDER)) {
    for (const label of labels) {
      const words = label.replace(/-/g, ' ')
      const variants = [words, words.replace(/s$/, ''), `${words}s`]
      if (variants.some((v) => new RegExp(String.raw`\b${v}\b`).test(lower))) return { subgoal: label, goalName }
    }
  }
  return null
}

export function quickParse(input: string, today: string): QuickParse {
  let text = input
  const found: string[] = []

  const dur = findDuration(text)
  let durationMin: number | null = null
  if (dur && dur.minutes >= 1 && dur.minutes <= 1439) {
    durationMin = dur.minutes
    text = dur.rest
    found.push(`${dur.minutes >= 60 ? `${Math.floor(dur.minutes / 60)}h${dur.minutes % 60 ? ` ${dur.minutes % 60}m` : ''}` : `${dur.minutes}m`}`)
  }

  const dl = findDeadline(text, today)
  let deadline: string | null = null
  if (dl) {
    deadline = dl.date
    text = dl.rest
    found.push(`due ${dl.date}`)
  }

  const sub = findSubgoal(input)
  if (sub) found.push(sub.subgoal)

  let title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:for|by|due|on|before|at)\s*$/i, '')
    .trim()
  if (!title) title = input.trim() // never strip a title away completely

  return { title, durationMin, deadline, subgoal: sub?.subgoal ?? null, goalName: sub?.goalName ?? null, found }
}
