import { describe, expect, it } from 'vitest'
import { countdownPlan } from './sound'

describe('countdownPlan', () => {
  it('ticks once for each of the last 5 seconds, then a long tone at the end', () => {
    expect(countdownPlan(60)).toEqual([
      { at: 55, kind: 'tick' },
      { at: 56, kind: 'tick' },
      { at: 57, kind: 'tick' },
      { at: 58, kind: 'tick' },
      { at: 59, kind: 'tick' },
      { at: 60, kind: 'end' },
    ])
  })
  it('starts partway through when less than 5 seconds are left', () => {
    expect(countdownPlan(3)).toEqual([
      { at: 0, kind: 'tick' },
      { at: 1, kind: 'tick' },
      { at: 2, kind: 'tick' },
      { at: 3, kind: 'end' },
    ])
  })
  it('just the tone when one second is left', () => {
    expect(countdownPlan(1)).toEqual([
      { at: 0, kind: 'tick' },
      { at: 1, kind: 'end' },
    ])
  })
  it('nothing at all when there is no time left', () => {
    expect(countdownPlan(0)).toEqual([])
  })
})
