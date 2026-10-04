import { describe, expect, it } from 'vitest'
import { dueAlerts, localClock, type EventLite, type TaskLite } from './schedule.ts'

const klass = (over: Partial<EventLite> = {}): EventLite => ({ id: 'c1', title: 'Strategy', date: '2026-10-05', start: '10:30', room: 'LC2-LH-16', kind: 'class', ...over })
const task = (over: Partial<TaskLite> = {}): TaskLite => ({ id: 't1', content: 'Essay', deadline: '2026-10-05', recurring: false, ...over })
const none = new Set<string>()

describe('localClock', () => {
  it('reads the date and time in India, not UTC', () => {
    // 2026-10-05 02:30 UTC is 08:00 in Kolkata.
    expect(localClock(new Date('2026-10-05T02:30:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-10-05', minutes: 8 * 60 })
    // 20:00 UTC on the 4th is already 01:30 on the 5th in Kolkata.
    expect(localClock(new Date('2026-10-04T20:00:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-10-05', minutes: 90 })
  })
})

describe('class alerts (10 minutes before)', () => {
  it('fires from 10 minutes before until the start', () => {
    const at = (m: number) => dueAlerts({ date: '2026-10-05', minutes: m }, [klass()], [], none)
    expect(at(10 * 60 + 19)).toHaveLength(0) // 11 minutes before: too early
    expect(at(10 * 60 + 20)).toHaveLength(1) // exactly 10 minutes before
    expect(at(10 * 60 + 29)).toHaveLength(1)
    expect(at(10 * 60 + 30)).toHaveLength(0) // it has started
  })
  it('says what, when and where', () => {
    const [a] = dueAlerts({ date: '2026-10-05', minutes: 10 * 60 + 20 }, [klass()], [], none)
    expect(a).toMatchObject({ key: 'class:c1', title: 'Strategy at 10:30', body: 'Starts in 10 minutes, LC2-LH-16' })
  })
  it('catches up if a minute was missed, but never sends twice', () => {
    const clock = { date: '2026-10-05', minutes: 10 * 60 + 27 }
    expect(dueAlerts(clock, [klass()], [], none)[0].body).toContain('Starts in 3 minutes')
    expect(dueAlerts(clock, [klass()], [], new Set(['class:c1']))).toHaveLength(0)
  })
  it('ignores events (talks), other days, and past classes', () => {
    const clock = { date: '2026-10-05', minutes: 10 * 60 + 20 }
    expect(dueAlerts(clock, [klass({ kind: 'event' })], [], none)).toHaveLength(0)
    expect(dueAlerts(clock, [klass({ date: '2026-10-06' })], [], none)).toHaveLength(0)
  })
})

describe('8 am deadline digest', () => {
  const at8 = { date: '2026-10-05', minutes: 8 * 60 }
  it('lists today and overdue deadlines', () => {
    const [a] = dueAlerts(at8, [], [task(), task({ id: 't2', content: 'Quiz', deadline: '2026-10-03' })], none)
    expect(a.key).toBe('digest:2026-10-05')
    expect(a.title).toBe('1 deadline today')
    expect(a.body).toBe('Due today: Essay\nOverdue: Quiz')
  })
  it('is silent when nothing is due or overdue', () => {
    expect(dueAlerts(at8, [], [task({ deadline: '2026-10-09' }), task({ id: 'x', deadline: null })], none)).toHaveLength(0)
  })
  it('never counts repeating tasks', () => {
    expect(dueAlerts(at8, [], [task({ recurring: true })], none)).toHaveLength(0)
  })
  it('waits until 8:00 and stops at noon', () => {
    expect(dueAlerts({ date: '2026-10-05', minutes: 7 * 60 + 59 }, [], [task()], none)).toHaveLength(0)
    expect(dueAlerts({ date: '2026-10-05', minutes: 11 * 60 + 59 }, [], [task()], none)).toHaveLength(1)
    expect(dueAlerts({ date: '2026-10-05', minutes: 12 * 60 }, [], [task()], none)).toHaveLength(0)
  })
  it('goes out once a day', () => {
    expect(dueAlerts(at8, [], [task()], new Set(['digest:2026-10-05']))).toHaveLength(0)
    expect(dueAlerts({ date: '2026-10-06', minutes: 8 * 60 }, [], [task({ deadline: '2026-10-06' })], new Set(['digest:2026-10-05']))).toHaveLength(1)
  })
  it('shortens a long list', () => {
    const many = Array.from({ length: 7 }, (_, i) => task({ id: `t${i}`, content: `Task ${i + 1}` }))
    expect(dueAlerts(at8, [], many, none)[0].body).toBe('Due today: Task 1, Task 2, Task 3, Task 4 +3 more')
  })
  it('titles an overdue-only digest', () => {
    const [a] = dueAlerts(at8, [], [task({ deadline: '2026-10-01' }), task({ id: 't2', deadline: '2026-10-02' })], none)
    expect(a.title).toBe('2 overdue')
  })
})
