import { describe, expect, it } from 'vitest'
import { END, START, resizedMinutes, slotFromY } from './time'

describe('slotFromY', () => {
  it('maps pixels to 15 minute slots from 7 am', () => {
    expect(slotFromY(0, 0, 30)).toBe(START * 60)
    expect(slotFromY(64, 0, 30)).toBe(8 * 60) // one hour down
    expect(slotFromY(64 * 2 + 16, 0, 30)).toBe(9 * 60 + 15)
  })
  it('snaps to the nearest quarter hour', () => {
    expect(slotFromY(7, 0, 30)).toBe(START * 60) // 6.6 minutes rounds down to 0
    expect(slotFromY(9, 0, 30)).toBe(START * 60 + 15) // 8.4 minutes rounds up
  })
  it('never starts before 7 am', () => {
    expect(slotFromY(-500, 0, 30)).toBe(START * 60)
  })
  it('keeps the whole block inside the day', () => {
    expect(slotFromY(5000, 0, 60)).toBe(END * 60 - 60)
    expect(slotFromY(5000, 0, 30)).toBe(END * 60 - 30)
  })
  it('works relative to the lane top', () => {
    expect(slotFromY(300, 236, 30)).toBe(8 * 60) // 64px below a lane that starts at 236
  })
})

describe('resizedMinutes', () => {
  it('grows and shrinks in 15 minute steps', () => {
    expect(resizedMinutes(540, 30, 16)).toBe(45)
    expect(resizedMinutes(540, 60, -32)).toBe(30)
  })
  it('keeps at least 15 minutes', () => {
    expect(resizedMinutes(540, 30, -1000)).toBe(15)
  })
  it('stops at midnight', () => {
    expect(resizedMinutes(22 * 60, 30, 5000)).toBe(120)
  })
})
