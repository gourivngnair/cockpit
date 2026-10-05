import { describe, expect, it } from 'vitest'
import {
  BRADBURY_START,
  blackoutOn,
  daysDone,
  dietStats,
  focusStats,
  fmtMinutes,
  gpaStats,
  lastDays,
  lastFourWeeks,
  lifeAdminStats,
  milestones,
  reviewsDue,
  streak,
  tasksDoneThisWeek,
  termWeek,
  thisWeek,
  writerStats,
  type DoneItem,
  type OpenItem,
} from './stats'

const done = (over: Partial<DoneItem> & { date: string }): DoneItem => ({
  taskId: `t-${over.date}-${over.labels?.[0] ?? 'x'}`,
  content: 'Something',
  labels: [],
  goal: null,
  completedDate: over.date,
  late: false,
  recurring: true,
  ...over,
})
const open = (over: Partial<OpenItem>): OpenItem => ({ id: 'o1', content: 'Open task', goal: 'Excel Outside Class', recurring: false, deadline: null, ...over })

describe('the term calendar', () => {
  it('counts weeks from the 5th, and is 0 before it starts', () => {
    expect(termWeek('2026-10-04')).toBe(0)
    expect(termWeek('2026-10-05')).toBe(1)
    expect(termWeek('2026-10-11')).toBe(1)
    expect(termWeek('2026-10-12')).toBe(2)
    expect(termWeek('2027-03-01')).toBe(11) // never past the last week
  })
  it('the first weekly review is due on 24 Oct, then every 7 days', () => {
    expect(reviewsDue('2026-10-23')).toBe(0)
    expect(reviewsDue('2026-10-24')).toBe(1)
    expect(reviewsDue('2026-10-30')).toBe(1)
    expect(reviewsDue('2026-10-31')).toBe(2)
  })
  it('the blackout starts on 15 Nov', () => {
    expect(blackoutOn('2026-11-14')).toBe(false)
    expect(blackoutOn('2026-11-15')).toBe(true)
  })
  it('lists the last n days, oldest first', () => {
    expect(lastDays(3, '2026-10-05')).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
  })
})

describe('streaks', () => {
  const days = (...d: string[]) => new Set(d)
  it('counts back from today when today is done', () => {
    expect(streak(days('2026-10-03', '2026-10-04', '2026-10-05'), '2026-10-05')).toBe(3)
  })
  it('a day not done yet does not break the streak', () => {
    expect(streak(days('2026-10-03', '2026-10-04'), '2026-10-05')).toBe(2)
  })
  it('a missed day does', () => {
    expect(streak(days('2026-10-02', '2026-10-04', '2026-10-05'), '2026-10-05')).toBe(2)
    expect(streak(days('2026-10-02'), '2026-10-05')).toBe(0)
  })
  it('no days is no streak', () => {
    expect(streak(new Set(), '2026-10-05')).toBe(0)
  })
})

describe('days done and the weekly trend', () => {
  it('ignores anything before the term and counts a day once', () => {
    const items = [
      done({ date: '2026-10-04', labels: ['gym'] }), // before the term
      done({ date: '2026-10-05', labels: ['gym'] }),
      done({ date: '2026-10-05', labels: ['gym'], taskId: 'again' }),
      done({ date: '2026-10-07', labels: ['gym'] }),
      done({ date: '2026-10-06', labels: ['other'] }),
    ]
    expect([...daysDone(items, 'gym')].sort()).toEqual(['2026-10-05', '2026-10-07'])
  })
  it('counts this week (Monday to Sunday) and the last four weeks, oldest first', () => {
    const gym = new Set(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-21'])
    expect(thisWeek(gym, '2026-10-14')).toBe(2) // week of 12 Oct
    expect(lastFourWeeks(gym, '2026-10-21').map((w) => w.count)).toEqual([0, 3, 2, 1])
    expect(lastFourWeeks(gym, '2026-10-21').map((w) => w.isThisWeek)).toEqual([false, false, false, true])
  })
})

describe('Term 2 GPA', () => {
  it('counts repeating hard-course reviews against the reviews due', () => {
    const items = [
      done({ date: '2026-10-24', labels: ['hard-courses'], recurring: true }),
      done({ date: '2026-10-31', labels: ['hard-courses'], recurring: true }),
      done({ date: '2026-10-18', labels: ['hard-courses'], recurring: false }), // a one-off, not a review
    ]
    expect(gpaStats(items, '2026-10-31')).toMatchObject({ reviewsDone: 2, reviewsDue: 2 })
  })
  it('counts assignments on time (not overdue when ticked)', () => {
    const items = [
      done({ date: '2026-10-08', labels: ['assignments'], recurring: false, late: false }),
      done({ date: '2026-10-09', labels: ['assignments'], recurring: false, late: true }),
      done({ date: '2026-10-10', labels: ['assignments'], recurring: false, late: false }),
    ]
    expect(gpaStats(items, '2026-10-12')).toMatchObject({ assignmentsDone: 3, assignmentsOnTime: 2 })
  })
  it('is all zero with nothing done', () => {
    expect(gpaStats([], '2026-10-05')).toEqual({ reviewsDone: 0, reviewsDue: 0, assignmentsDone: 0, assignmentsOnTime: 0 })
  })
})

describe('milestones', () => {
  it('lists finished and open one-off tasks in date order, undated last, flagging overdue', () => {
    const list = milestones(
      [open({ id: 'a', content: 'Pick the competition', deadline: '2026-10-12' }), open({ id: 'b', content: 'Research paper', deadline: '2027-02-28' }), open({ id: 'c', content: 'Someday' })],
      [done({ taskId: 'z', content: 'Sign up', goal: 'Excel Outside Class', recurring: false, date: '2026-10-06' })],
      'Excel Outside Class',
      '2026-10-20',
    )
    expect(list.map((m) => m.title)).toEqual(['Sign up', 'Pick the competition', 'Research paper', 'Someday'])
    expect(list.map((m) => [m.done, m.late])).toEqual([
      [true, false],
      [false, true], // 12 Oct has passed
      [false, false],
      [false, false],
    ])
  })
  it('leaves out repeating tasks, other goals, and a finished task that is somehow still open', () => {
    const list = milestones(
      [open({ id: 'a', recurring: true }), open({ id: 'b', goal: 'Better Writer' }), open({ id: 'still', content: 'Still open' })],
      [done({ taskId: 'still', goal: 'Excel Outside Class', recurring: false, date: '2026-10-06' }), done({ taskId: 'r', goal: 'Excel Outside Class', recurring: true, date: '2026-10-06' })],
      'Excel Outside Class',
      '2026-10-20',
    )
    expect(list.map((m) => m.title)).toEqual(['Still open'])
  })
})

describe('clean diet', () => {
  it('counts yes-answers among the days answered in the last 14', () => {
    const diet = { '2026-10-05': true, '2026-10-04': false, '2026-10-03': true, '2026-09-01': true }
    expect(dietStats(diet, '2026-10-05')).toEqual({ yes: 2, answered: 3 })
  })
  it('no answers is zero of zero', () => {
    expect(dietStats({}, '2026-10-05')).toEqual({ yes: 0, answered: 0 })
  })
})

describe('Better Writer', () => {
  it('counts Bradbury nights from the start, with the streak, essays and books', () => {
    const items = [
      done({ date: '2026-10-04', labels: ['bradbury'] }), // before the count starts
      done({ date: '2026-10-05', labels: ['bradbury'] }),
      done({ date: '2026-10-06', labels: ['bradbury'] }),
      done({ date: '2026-10-08', labels: ['bradbury'] }),
      done({ date: '2026-10-25', labels: ['substack'], recurring: true }),
      done({ date: '2026-10-31', labels: ['monthly-book'], recurring: true }),
    ]
    expect(BRADBURY_START).toBe('2026-10-05')
    expect(writerStats(items, '2026-10-08')).toEqual({ nights: 3, streak: 1, essays: 1, books: 1 })
    expect(writerStats(items, '2026-10-06').streak).toBe(2)
  })
})

describe('Life Admin', () => {
  it('counts what was done this week, and what is overdue and open', () => {
    const stats = lifeAdminStats(
      [open({ id: 'a', goal: 'Life Admin', deadline: '2026-10-01' }), open({ id: 'b', goal: 'Life Admin', deadline: '2026-10-20' }), open({ id: 'c', goal: 'Life Admin' }), open({ id: 'd', goal: 'Better Writer', deadline: '2026-10-01' })],
      [
        done({ date: '2026-10-13', completedDate: '2026-10-13', goal: 'Life Admin', recurring: false }),
        done({ date: '2026-10-06', completedDate: '2026-10-06', goal: 'Life Admin', recurring: false }), // last week
        done({ date: '2026-10-14', completedDate: '2026-10-14', goal: 'Better Writer', recurring: false }),
      ],
      'Life Admin',
      '2026-10-14',
    )
    expect(stats).toEqual({ doneThisWeek: 1, overdue: 1, open: 3 })
  })
})

describe('focus time', () => {
  const items = [
    { goal: 'Term 2 GPA', minutes: 50, date: '2026-10-14' },
    { goal: 'Term 2 GPA', minutes: 25, date: '2026-10-14' },
    { goal: 'Better Writer', minutes: 30, date: '2026-10-13' },
    { goal: null, minutes: 10, date: '2026-10-12' },
    { goal: 'Term 2 GPA', minutes: 60, date: '2026-10-07' }, // last week
    { goal: 'Term 2 GPA', minutes: 15, date: '2026-09-01' }, // long ago
  ]
  it('totals today and this week, and splits this week by goal', () => {
    const s = focusStats(items, '2026-10-14')
    expect(s.today).toBe(75)
    expect(s.week).toBe(115)
    expect(s.byGoalThisWeek).toEqual({ 'Term 2 GPA': 75, 'Better Writer': 30, 'No goal': 10 })
  })
  it('gives the last four weeks, oldest first', () => {
    expect(focusStats(items, '2026-10-14').weeks.map((w) => w.count)).toEqual([0, 0, 60, 115])
  })
  it('is all zero with nothing logged', () => {
    expect(focusStats([], '2026-10-14')).toMatchObject({ today: 0, week: 0, byGoalThisWeek: {} })
  })
})

describe('the weekly strip', () => {
  it('counts tasks by the day they were ticked, Monday to Sunday', () => {
    const items = [
      done({ date: '2026-10-09', completedDate: '2026-10-12' }), // an occurrence from last week, ticked this week
      done({ date: '2026-10-13', completedDate: '2026-10-13' }),
      done({ date: '2026-10-11', completedDate: '2026-10-11' }), // last Sunday
    ]
    expect(tasksDoneThisWeek(items, '2026-10-14')).toBe(2)
  })
  it('formats minutes', () => {
    expect([fmtMinutes(0), fmtMinutes(45), fmtMinutes(60), fmtMinutes(80), fmtMinutes(125)]).toEqual(['0m', '45m', '1h', '1h 20m', '2h 5m'])
  })
})
