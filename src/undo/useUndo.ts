import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../ui/toastContext'

/** One thing the user did that can be taken back, and done again. Each step resolves to whether it worked. */
export interface UndoAction {
  label: string
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
}

const LIMIT = 30

/** True when the key press is going into a text field, where Ctrl+Z means "undo typing". */
export function isTextTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n || !n.tagName) return false
  return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable
}

/** Maps a key press to an undo or redo, or null when it is neither. */
export function undoKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (k === 'y' && !e.shiftKey) return 'redo'
  return null
}

interface Stacks {
  undo: UndoAction[]
  redo: UndoAction[]
}

/** A session-long undo and redo history, with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y. */
export function useUndo() {
  const toast = useToast()
  const [stacks, setStacksState] = useState<Stacks>({ undo: [], redo: [] })
  // The same stacks, readable from event handlers without waiting for a render.
  const live = useRef<Stacks>(stacks)
  const running = useRef(false)
  const setStacks = useCallback((next: Stacks) => {
    live.current = next
    setStacksState(next)
  }, [])

  /** Record something that was just done. Anything that was waiting to be redone is dropped. */
  const push = useCallback(
    (action: UndoAction) => setStacks({ undo: [...live.current.undo.slice(-(LIMIT - 1)), action], redo: [] }),
    [setStacks],
  )

  const undo = useCallback(async () => {
    if (running.current) return
    const action = live.current.undo.at(-1)
    if (!action) return void toast('Nothing to undo.')
    running.current = true
    setStacks({ undo: live.current.undo.slice(0, -1), redo: live.current.redo })
    try {
      if (await action.undo()) {
        setStacks({ undo: live.current.undo, redo: [...live.current.redo, action] })
        toast(`Undid: ${action.label}`)
      } else {
        setStacks({ undo: [...live.current.undo, action], redo: live.current.redo }) // it did not work, so it can be tried again
      }
    } finally {
      running.current = false
    }
  }, [setStacks, toast])

  const redo = useCallback(async () => {
    if (running.current) return
    const action = live.current.redo.at(-1)
    if (!action) return void toast('Nothing to redo.')
    running.current = true
    setStacks({ undo: live.current.undo, redo: live.current.redo.slice(0, -1) })
    try {
      if (await action.redo()) {
        setStacks({ undo: [...live.current.undo, action], redo: live.current.redo })
        toast(`Redid: ${action.label}`)
      } else {
        setStacks({ undo: live.current.undo, redo: [...live.current.redo, action] })
      }
    } finally {
      running.current = false
    }
  }, [setStacks, toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const which = undoKey(e)
      if (!which || isTextTarget(e.target)) return
      e.preventDefault()
      void (which === 'undo' ? undo() : redo())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    push,
    undo,
    redo,
    canUndo: stacks.undo.length > 0,
    canRedo: stacks.redo.length > 0,
    undoLabel: stacks.undo.at(-1)?.label ?? null,
    redoLabel: stacks.redo.at(-1)?.label ?? null,
  }
}