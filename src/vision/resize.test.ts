import { describe, expect, it } from 'vitest'
import { MAX_BYTES, checkFile, fitWithin, thumbPath } from './resize'

describe('fitWithin', () => {
  it('shrinks the longest side to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(4000, 3000, 480)).toEqual({ width: 480, height: 360 })
  })
  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
  it('never collapses to zero for a very thin image', () => {
    expect(fitWithin(10000, 2, 480)).toEqual({ width: 480, height: 1 })
  })
})

describe('checkFile', () => {
  const f = (type: string, size = 1000) => ({ name: 'x', type, size })
  it('accepts normal images', () => {
    expect(checkFile(f('image/jpeg'))).toBeNull()
    expect(checkFile(f('image/png'))).toBeNull()
    expect(checkFile(f('image/webp', MAX_BYTES))).toBeNull()
  })
  it('refuses other files, huge files and empty files, with a reason', () => {
    expect(checkFile(f('application/pdf'))).toBe('not an image')
    expect(checkFile(f('image/png', MAX_BYTES + 1))).toBe('larger than 15 MB')
    expect(checkFile(f('image/png', 0))).toBe('empty')
  })
})

describe('thumbPath', () => {
  it('puts the small copy beside the main one', () => {
    expect(thumbPath('user/abc.jpg')).toBe('user/abc-thumb.jpg')
  })
})
