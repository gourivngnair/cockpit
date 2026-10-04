import { describe, expect, it } from 'vitest'
import { dayOfYear, pickToday, themesOf } from './today'

const img = (id: string, createdAt: string, pinnedOn: string | null = null) => ({ id, createdAt, pinnedOn })

describe('dayOfYear', () => {
  it('counts from 0 on 1 January', () => {
    expect(dayOfYear('2026-01-01')).toBe(0)
    expect(dayOfYear('2026-01-02')).toBe(1)
    expect(dayOfYear('2026-10-05')).toBe(277)
  })
})

describe('pickToday', () => {
  const a = img('a', '2026-09-01T10:00:00Z')
  const b = img('b', '2026-09-02T10:00:00Z')
  const c = img('c', '2026-09-03T10:00:00Z')

  it('has nothing to show with no images', () => {
    expect(pickToday([], '2026-10-05')).toBeNull()
  })
  it('takes turns day by day, in the order they were added', () => {
    const day = dayOfYear('2026-10-05')
    const order = ['a', 'b', 'c']
    expect(pickToday([c, a, b], '2026-10-05')!.id).toBe(order[day % 3])
    expect(pickToday([c, a, b], '2026-10-06')!.id).toBe(order[(day + 1) % 3])
  })
  it('gives every device the same image whatever order it holds them in', () => {
    expect(pickToday([a, b, c], '2026-10-05')!.id).toBe(pickToday([c, b, a], '2026-10-05')!.id)
  })
  it('an image pinned for today wins', () => {
    expect(pickToday([a, img('b', b.createdAt, '2026-10-05'), c], '2026-10-05')!.id).toBe('b')
  })
  it('a pin for another day does nothing', () => {
    const day = dayOfYear('2026-10-05')
    expect(pickToday([a, img('b', b.createdAt, '2026-10-04'), c], '2026-10-05')!.id).toBe(['a', 'b', 'c'][day % 3])
  })
  it('shuffle moves to the next image and wraps around', () => {
    const first = pickToday([a, b, c], '2026-10-05', 0)!.id
    const second = pickToday([a, b, c], '2026-10-05', 1)!.id
    expect(second).not.toBe(first)
    expect(pickToday([a, b, c], '2026-10-05', 3)!.id).toBe(first)
  })
  it('shuffling from a pinned image moves on from the pin', () => {
    const pinned = [a, img('b', b.createdAt, '2026-10-05'), c]
    expect(pickToday(pinned, '2026-10-05', 0)!.id).toBe('b')
    expect(pickToday(pinned, '2026-10-05', 1)!.id).toBe('c')
    expect(pickToday(pinned, '2026-10-05', 2)!.id).toBe('a')
  })
  it('one image is always that image', () => {
    expect(pickToday([a], '2026-10-05', 7)!.id).toBe('a')
  })
})

describe('themesOf', () => {
  it('lists the themes in use, sorted, without Unsorted or blanks', () => {
    expect(themesOf([{ theme: 'Career' }, { theme: 'Unsorted' }, { theme: 'Travel' }, { theme: 'Career' }, { theme: ' ' }])).toEqual(['Career', 'Travel'])
  })
})
