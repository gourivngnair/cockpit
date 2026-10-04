import { describe, expect, it } from 'vitest'
import { earliestPlan, samePlan } from './plan'

const b = (taskId: string, date: string, start: string, minutes = 30) => ({ taskId, date, start, minutes })
const now = new Date('2026-10-05T10:00:00') // Monday 10:00 local

describe('earliestPlan', () => {
  it('is the earliest upcoming block of that task', () => {
    const blocks = [b('t', '2026-10-07', '09:00', 60), b('t', '2026-10-06', '14:00', 45), b('other', '2026-10-05', '11:00')]
    expect(earliestPlan(blocks, 't', now)).toEqual({ date: '2026-10-06', time: '14:00', minutes: 45 })
  })
  it('ignores blocks that have already finished', () => {
    const blocks = [b('t', '2026-10-05', '08:00', 60), b('t', '2026-10-05', '15:00', 30)]
    expect(earliestPlan(blocks, 't', now)).toEqual({ date: '2026-10-05', time: '15:00', minutes: 30 })
  })
  it('counts a block that is under way as upcoming', () => {
    expect(earliestPlan([b('t', '2026-10-05', '09:30', 60)], 't', now)).toEqual({ date: '2026-10-05', time: '09:30', minutes: 60 })
  })
  it('is null when the task has no block left, so the planned time is cleared', () => {
    expect(earliestPlan([], 't', now)).toBeNull()
    expect(earliestPlan([b('t', '2026-10-04', '09:00')], 't', now)).toBeNull()
    expect(earliestPlan([b('t', '2026-10-05', '09:00', 30)], 't', now)).toBeNull()
  })
  it('breaks ties on the same day by start time', () => {
    const blocks = [b('t', '2026-10-06', '16:00'), b('t', '2026-10-06', '09:15')]
    expect(earliestPlan(blocks, 't', now)?.time).toBe('09:15')
  })
})

describe('samePlan', () => {
  it('compares plans by value', () => {
    const p = { date: '2026-10-06', time: '09:00', minutes: 30 }
    expect(samePlan(p, { ...p })).toBe(true)
    expect(samePlan(p, { ...p, minutes: 45 })).toBe(false)
    expect(samePlan(null, null)).toBe(true)
    expect(samePlan(p, null)).toBe(false)
  })
})
