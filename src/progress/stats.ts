/**
 * Everything the Progress page shows, as pure functions of your saved activity. No clock, no
 * network, no screen: `today` is always passed in, so each number can be tested on its own.
 *
 * Progress counts from the first day of Term 2 (decided 2026-10-05); nothing earlier is ever read.
 */
import { addDays, mondayOf, parseDay } from '../lib/dates'

export const TERM = {
  start: '2026-10-05',
  firstReview: '2026-10-24', // the weekly hard-course review starts this Saturday
  blackout: '2026-11-15', // no new competitions or club commitments after this
  end: '2026-12-15', // tentative
}
export const TERM_WEEKS = 11
export const GYM_TARGET = 3
export const BRADBURY_START = '2026-10-05' // counted from this night
export const BRADBURY_GOAL = 1000

/** A task that was completed (one row per occurrence of a repeating task). */
export interface DoneItem {
  taskId: string
  content: string
  labels: string[]
  goal: string | null // the name of the goal (top-level project) it belongs to
  date: string // the day it counts for (an occurrence's due date, or the day it was ticked)
  completedDate: string // the local day it was actually ticked
  late: boolean
  recurring: boolean
}

/** A task that is still open. */
export interface OpenItem {
  id: string
  content: string
  goal: string | null
  recurring: boolean
  deadline: string | null // Todoist's Deadline field
}

/** A focus round (whole or partial). */
export interface FocusItem {
  goal: string | null
  minutes: number
  date: string // the local day it was started
}

export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 864e5)

/** The week of the term (1 to 11), or 0 before it starts. */
export function termWeek(today: string): number {
  return today < TERM.start ? 0 : Math.min(TERM_WEEKS, Math.floor(daysBetween(TERM.start, today) / 7) + 1)
}

/** Weekly hard-course reviews that should have happened by today (the first is due on 24 Oct). */
export function reviewsDue(today: string): number {
  return today < TERM.firstReview ? 0 : Math.floor(daysBetween(TERM.firstReview, today) / 7) + 1
}

/** The last n days ending today, oldest first. */
export const lastDays = (n: number, today: string) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))

const since = (items: DoneItem[], start: string) => items.filter((d) => d.date >= start)
const withLabel = (items: DoneItem[], label: string) => items.filter((d) => d.labels.includes(label))

/** The days a label was done on (one tick a day is enough). */
export const daysDone = (items: DoneItem[], label: string, from: string = TERM.start): Set<string> =>
  new Set(withLabel(since(items, from), label).map((d) => d.date))

/** Consecutive days done, ending today, or yesterday if today is not done yet. */
export function streak(days: ReadonlySet<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

const inWeek = (days: ReadonlySet<string>, monday: string) => [...days].filter((d) => d >= monday && d <= addDays(monday, 6)).length

export interface WeekCount {
  monday: string
  count: number
  isThisWeek: boolean
}

/** How many days in each of the last four weeks (oldest first, this week last). */
export function lastFourWeeks(days: ReadonlySet<string>, today: string): WeekCount[] {
  const monday = mondayOf(today)
  return [3, 2, 1, 0].map((back) => {
    const m = addDays(monday, -7 * back)
    return { monday: m, count: inWeek(days, m), isThisWeek: back === 0 }
  })
}

export const thisWeek = (days: ReadonlySet<string>, today: string) => inWeek(days, mondayOf(today))

// ---- Term 2 GPA ----

export interface GpaStats {
  reviewsDone: number
  reviewsDue: number
  assignmentsDone: number
  assignmentsOnTime: number
}

export function gpaStats(done: DoneItem[], today: string): GpaStats {
  const reviews = withLabel(since(done, TERM.start), 'hard-courses').filter((d) => d.recurring)
  const assignments = withLabel(since(done, TERM.start), 'assignments')
  return {
    reviewsDone: reviews.length,
    reviewsDue: reviewsDue(today),
    assignmentsDone: assignments.length,
    assignmentsOnTime: assignments.filter((d) => !d.late).length,
  }
}

// ---- Excel Outside Class ----

export interface Milestone {
  title: string
  date: string | null
  done: boolean
  late: boolean
}

/** The one-off tasks in a goal: finished ones and open ones, in date order, undated last. */
export function milestones(open: OpenItem[], done: DoneItem[], goal: string, today: string): Milestone[] {
  const openIds = new Set(open.map((o) => o.id))
  const upcoming: Milestone[] = open
    .filter((o) => o.goal === goal && !o.recurring)
    .map((o) => ({ title: o.content, date: o.deadline, done: false, late: o.deadline !== null && o.deadline < today }))
  const finished: Milestone[] = done
    .filter((d) => d.goal === goal && !d.recurring && !openIds.has(d.taskId))
    .map((d) => ({ title: d.content, date: d.date, done: true, late: false }))
  return [...finished, ...upcoming].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.title.localeCompare(b.title))
}

/** True from the blackout date: no new competitions or club commitments. */
export const blackoutOn = (today: string) => today >= TERM.blackout

// ---- Clean diet ----

export interface DietStats {
  yes: number
  answered: number
}

/** Yes-answers and answered days among the last n days. */
export function dietStats(diet: Readonly<Record<string, boolean>>, today: string, n = 14): DietStats {
  const days = lastDays(n, today).filter((d) => diet[d] !== undefined)
  return { yes: days.filter((d) => diet[d]).length, answered: days.length }
}

// ---- Better Writer ----

export interface WriterStats {
  nights: number
  streak: number
  essays: number
  books: number
}

export function writerStats(done: DoneItem[], today: string): WriterStats {
  const nights = daysDone(done, 'bradbury', BRADBURY_START)
  return {
    nights: nights.size,
    streak: streak(nights, today),
    essays: withLabel(since(done, TERM.start), 'substack').length,
    books: withLabel(since(done, TERM.start), 'monthly-book').length,
  }
}

// ---- Life Admin ----

export interface LifeAdminStats {
  doneThisWeek: number
  overdue: number
  open: number
}

export function lifeAdminStats(open: OpenItem[], done: DoneItem[], goal: string, today: string): LifeAdminStats {
  const monday = mondayOf(today)
  const mine = open.filter((o) => o.goal === goal && !o.recurring)
  return {
    doneThisWeek: done.filter((d) => d.goal === goal && d.completedDate >= monday && d.completedDate <= addDays(monday, 6)).length,
    overdue: mine.filter((o) => o.deadline !== null && o.deadline < today).length,
    open: mine.length,
  }
}

// ---- Focus ----

export interface FocusStats {
  today: number
  week: number
  /** Minutes in each of the last four weeks, oldest first. */
  weeks: WeekCount[]
  /** Minutes this week for each goal name. */
  byGoalThisWeek: Record<string, number>
}

export function focusStats(items: FocusItem[], today: string): FocusStats {
  const monday = mondayOf(today)
  const minutesIn = (from: string, to: string) => items.filter((i) => i.date >= from && i.date <= to).reduce((s, i) => s + i.minutes, 0)
  const byGoalThisWeek: Record<string, number> = {}
  for (const i of items) {
    if (i.date >= monday && i.date <= addDays(monday, 6)) {
      const g = i.goal ?? 'No goal'
      byGoalThisWeek[g] = (byGoalThisWeek[g] ?? 0) + i.minutes
    }
  }
  return {
    today: minutesIn(today, today),
    week: minutesIn(monday, addDays(monday, 6)),
    weeks: [3, 2, 1, 0].map((back) => {
      const m = addDays(monday, -7 * back)
      return { monday: m, count: minutesIn(m, addDays(m, 6)), isThisWeek: back === 0 }
    }),
    byGoalThisWeek,
  }
}

// ---- The weekly strip ----

/** Tasks ticked this week (Monday to Sunday), by the day they were actually ticked. */
export function tasksDoneThisWeek(done: DoneItem[], today: string): number {
  const monday = mondayOf(today)
  return done.filter((d) => d.completedDate >= monday && d.completedDate <= addDays(monday, 6)).length
}

/** "1h 20m", "45m", "0m". */
export function fmtMinutes(m: number): string {
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}
