import { describe, expect, it } from 'vitest'
import { layout } from './layout'

describe('layout', () => {
  it('puts a lone item in one full-width lane', () => {
    expect(layout([{ s: 60, e: 120 }])).toEqual([{ s: 60, e: 120, lane: 0, lanes: 1 }])
  })
  it('places overlapping items side by side', () => {
    const r = layout([
      { s: 60, e: 120, id: 'a' },
      { s: 90, e: 150, id: 'b' },
    ])
    expect(r.map((x) => [x.id, x.lane, x.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ])
  })
  it('resets lanes after a gap', () => {
    const r = layout([
      { s: 60, e: 90, id: 'a' },
      { s: 60, e: 90, id: 'b' },
      { s: 120, e: 150, id: 'c' },
    ])
    expect(r.find((x) => x.id === 'c')).toMatchObject({ lane: 0, lanes: 1 })
  })
  it('back-to-back items do not overlap', () => {
    const r = layout([
      { s: 60, e: 90 },
      { s: 90, e: 120 },
    ])
    expect(r.every((x) => x.lanes === 1)).toBe(true)
  })
})
