import { describe, expect, it } from 'vitest'
import { isReplaced, parseSchedule, weeksOf } from './parse'

describe('parseSchedule', () => {
  it('accepts a valid week', () => {
    const r = parseSchedule(
      JSON.stringify([
        { title: 'Strategy', date: '2026-10-05', start: '09:00', end: '10:30', room: 'B12' },
        { title: 'Operations', date: '2026-10-06', start: '14:00', end: '15:30' },
      ]),
    )
    expect(r.errors).toEqual([])
    expect(r.events).toHaveLength(2)
    expect(r.events[1].room).toBe('')
  })
  it('rejects bad JSON, non-lists and bad rows with clear messages', () => {
    expect(parseSchedule('nope').errors[0]).toMatch(/not valid JSON/)
    expect(parseSchedule('{}').errors[0]).toMatch(/list/)
    const r = parseSchedule(
      JSON.stringify([
        { title: '', date: '2026-10-05', start: '09:00', end: '10:00' },
        { title: 'A', date: '5 Oct', start: '09:00', end: '10:00' },
        { title: 'B', date: '2026-10-05', start: '9am', end: '10:00' },
        { title: 'C', date: '2026-10-05', start: '11:00', end: '10:00' },
      ]),
    )
    expect(r.events).toEqual([])
    expect(r.errors).toHaveLength(4)
  })
})

describe('parseSchedule kind', () => {
  const row = { title: 'Talk', date: '2026-10-09', start: '16:45', end: '18:15' }
  it('defaults to class and accepts event', () => {
    expect(parseSchedule(JSON.stringify([row])).events[0].kind).toBe('class')
    expect(parseSchedule(JSON.stringify([{ ...row, kind: 'event' }])).events[0].kind).toBe('event')
  })
  it('rejects unknown kinds', () => {
    expect(parseSchedule(JSON.stringify([{ ...row, kind: 'meeting' }])).errors[0]).toMatch(/kind must be/)
  })
})

describe('exams', () => {
  const mk = (date: string, kind: 'class' | 'event' | 'exam') => ({ title: 't', date, start: '09:00', end: '10:00', room: '', kind })
  it('are accepted as a kind', () => {
    const row = { title: 'Exam', date: '2026-11-01', start: '10:30', end: '12:00' }
    expect(parseSchedule(JSON.stringify([{ ...row, kind: 'exam' }])).events[0].kind).toBe('exam')
  })
  it('are not wiped by the weekly class import, and do not wipe classes', () => {
    const classes = [mk('2026-11-02', 'class')]
    const exams = [mk('2026-11-01', 'exam')]
    expect(isReplaced({ date: '2026-11-01', kind: 'exam' }, classes)).toBe(false)
    expect(isReplaced({ date: '2026-11-02', kind: 'class' }, exams)).toBe(false)
    expect(isReplaced({ date: '2026-11-02', kind: 'event' }, classes)).toBe(true)
    expect(isReplaced({ date: '2026-11-01', kind: 'exam' }, exams)).toBe(true)
    expect(isReplaced({ date: '2026-11-20', kind: 'class' }, classes)).toBe(false)
  })
})

describe('weeksOf', () => {
  it('groups events by Monday to Sunday week', () => {
    const mk = (date: string) => ({ title: 't', date, start: '09:00', end: '10:00', room: '', kind: 'class' as const })
    expect(weeksOf([mk('2026-10-05'), mk('2026-10-11'), mk('2026-10-12')])).toEqual([
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-18'],
    ])
  })
})
