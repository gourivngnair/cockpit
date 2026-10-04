import { describe, expect, it } from 'vitest'
import { addDays, fmtDur, mondayOf, shortTime, toHM, toMin } from './dates'

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-10-05', -1)).toBe('2026-10-04')
  })
  it('finds Monday', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28') // Sunday
    expect(mondayOf('2026-10-05')).toBe('2026-10-05') // Monday
    expect(mondayOf('2026-10-09')).toBe('2026-10-05') // Friday
  })
  it('converts times', () => {
    expect(toMin('09:30')).toBe(570)
    expect(toMin('09:30:00')).toBe(570)
    expect(toHM(570)).toBe('09:30')
  })
  it('formats short times and durations', () => {
    expect(shortTime('09:30')).toBe('9:30a')
    expect(shortTime('13:00')).toBe('1p')
    expect(shortTime('00:00')).toBe('12a')
    expect(fmtDur(45)).toBe('45m')
    expect(fmtDur(90)).toBe('1h 30m')
  })
})
