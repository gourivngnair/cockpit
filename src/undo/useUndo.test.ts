import { describe, expect, it } from 'vitest'
import { isTextTarget, undoKey } from './useUndo'

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})

describe('undoKey', () => {
  it('Ctrl+Z and Cmd+Z undo', () => {
    expect(undoKey(key('z', { ctrlKey: true }))).toBe('undo')
    expect(undoKey(key('Z', { metaKey: true }))).toBe('undo')
  })
  it('Ctrl+Shift+Z and Ctrl+Y redo', () => {
    expect(undoKey(key('z', { ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(undoKey(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo')
    expect(undoKey(key('y', { ctrlKey: true }))).toBe('redo')
  })
  it('ignores a bare Z, Alt combinations and other keys', () => {
    expect(undoKey(key('z'))).toBeNull()
    expect(undoKey(key('z', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(undoKey(key('c', { ctrlKey: true }))).toBeNull()
    expect(undoKey(key('y', { ctrlKey: true, shiftKey: true }))).toBeNull()
  })
})

describe('isTextTarget', () => {
  it('is true for text fields, where Ctrl+Z undoes typing', () => {
    expect(isTextTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTextTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isTextTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
  })
  it('is false for everything else', () => {
    expect(isTextTarget({ tagName: 'BODY', isContentEditable: false } as unknown as EventTarget)).toBe(false)
    expect(isTextTarget(null)).toBe(false)
  })
})
