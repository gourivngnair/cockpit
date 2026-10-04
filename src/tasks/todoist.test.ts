import { describe, expect, it } from 'vitest'
import { parseDue, toTask } from './todoist'

describe('parseDue', () => {
  it('handles all-day dates', () => {
    expect(parseDue('2026-10-05')).toEqual({ date: '2026-10-05', time: null })
  })
  it('handles floating local date-times', () => {
    expect(parseDue('2026-10-05T09:30:00')).toEqual({ date: '2026-10-05', time: '09:30' })
  })
  it('returns null for no due date', () => {
    expect(parseDue(undefined)).toBeNull()
  })
})

describe('toTask', () => {
  it('flags repeating tasks and reads duration', () => {
    const t = toTask({
      id: '1',
      content: 'Review notes',
      project_id: 'p',
      labels: ['hard-courses'],
      due: { date: '2026-10-05', is_recurring: true },
      duration: { amount: 45, unit: 'minute' },
    })
    expect(t.recurring).toBe(true)
    expect(t.durationMin).toBe(45)
    expect(t.labels).toEqual(['hard-courses'])
  })
  it('non-repeating with no duration', () => {
    const t = toTask({ id: '2', content: 'x', project_id: 'p', due: { date: '2026-10-05' } })
    expect(t.recurring).toBe(false)
    expect(t.durationMin).toBeNull()
  })
})
