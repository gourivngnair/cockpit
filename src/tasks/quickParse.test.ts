import { describe, expect, it } from 'vitest'
import { quickParse } from './quickParse'

const today = '2026-10-05' // Monday

describe('quickParse: time needed', () => {
  it('reads hours, minutes and combinations', () => {
    expect(quickParse('Revise FM1 1h', today).durationMin).toBe(60)
    expect(quickParse('Revise FM1 for 90 min', today).durationMin).toBe(90)
    expect(quickParse('Read 1.5h', today).durationMin).toBe(90)
    expect(quickParse('Plan 1h30m', today).durationMin).toBe(90)
    expect(quickParse('Plan 2 hours', today).durationMin).toBe(120)
  })
  it('removes the duration words from the title', () => {
    expect(quickParse('Revise FM1 for 1h', today).title).toBe('Revise FM1')
  })
  it('ignores numbers that are not a length', () => {
    const r = quickParse('Read chapter 3', today)
    expect(r.durationMin).toBeNull()
    expect(r.title).toBe('Read chapter 3')
  })
})

describe('quickParse: deadline', () => {
  it('reads today and tomorrow', () => {
    expect(quickParse('Essay today', today).deadline).toBe('2026-10-05')
    expect(quickParse('Essay by tomorrow', today).deadline).toBe('2026-10-06')
    expect(quickParse('Essay tmrw', today).deadline).toBe('2026-10-06')
  })
  it('reads a weekday after by, due or on, and as the last word', () => {
    expect(quickParse('Essay by fri', today).deadline).toBe('2026-10-09')
    expect(quickParse('Essay due Friday', today).deadline).toBe('2026-10-09')
    expect(quickParse('Revise FM1 Fri', today).deadline).toBe('2026-10-09')
    expect(quickParse('Essay next mon', today).deadline).toBe('2026-10-12')
  })
  it('does not turn ordinary words into days', () => {
    expect(quickParse('Sat with the committee notes', today).deadline).toBeNull()
    expect(quickParse('Review Sunday brunch plan', today).deadline).toBeNull()
  })
  it('a weekday that is today means next week', () => {
    expect(quickParse('Essay by mon', today).deadline).toBe('2026-10-12')
  })
  it('reads dates written several ways (day/month, as in India)', () => {
    expect(quickParse('Essay 12 oct', today).deadline).toBe('2026-10-12')
    expect(quickParse('Essay oct 12', today).deadline).toBe('2026-10-12')
    expect(quickParse('Essay by 12th October', today).deadline).toBe('2026-10-12')
    expect(quickParse('Essay 12/10', today).deadline).toBe('2026-10-12')
  })
  it('rolls a date that has passed into next year, and rejects impossible dates', () => {
    expect(quickParse('Renew 3 Jan', today).deadline).toBe('2027-01-03')
    expect(quickParse('Thing 31 feb', today).deadline).toBeNull()
  })
  it('removes the deadline words from the title', () => {
    expect(quickParse('Essay by fri', today).title).toBe('Essay')
    expect(quickParse('Pay fees 20 oct', today).title).toBe('Pay fees')
  })
})

describe('quickParse: subgoal and goal', () => {
  it('finds the subgoal and its goal, leaving the words in the title', () => {
    const r = quickParse('MIS assignments report', today)
    expect(r.subgoal).toBe('assignments')
    expect(r.goalName).toBe('Term 2 GPA')
    expect(r.title).toBe('MIS assignments report')
  })
  it('matches labels written with spaces, and singular forms', () => {
    expect(quickParse('Weekly hard courses review', today).subgoal).toBe('hard-courses')
    expect(quickParse('Pick a competition', today).subgoal).toBe('competition')
    expect(quickParse('gym session', today).goalName).toBe('55 kg and Healthy')
  })
  it('finds nothing in an ordinary task', () => {
    const r = quickParse('Buy a charger', today)
    expect(r.subgoal).toBeNull()
    expect(r.goalName).toBeNull()
  })
})

describe('quickParse: combined and safe', () => {
  it('handles a full line', () => {
    const r = quickParse('Revise FM1 hard courses for 1h by fri', today)
    expect(r).toMatchObject({ durationMin: 60, deadline: '2026-10-09', subgoal: 'hard-courses', goalName: 'Term 2 GPA' })
    expect(r.title).toBe('Revise FM1 hard courses')
  })
  it('never leaves an empty title', () => {
    expect(quickParse('1h tomorrow', today).title).toBe('1h tomorrow')
  })
  it('leaves plain text alone', () => {
    const r = quickParse('Call mum', today)
    expect(r).toMatchObject({ title: 'Call mum', durationMin: null, deadline: null, subgoal: null })
    expect(r.found).toEqual([])
  })
})
