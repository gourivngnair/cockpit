import { useEffect, useRef, useState } from 'react'
import { dragLock } from '../ui/dragLock'
import type { MoveTarget } from './useTasks'

const HOLD_MS = 350 // touch: press and hold to pick a task up, so normal scrolling still works
const MOVE_PX = 6

/**
 * Pointer-event drag for task rows (never the HTML5 drag-and-drop API; lesson 1).
 * Drag sources:  [data-drag-task="<id>"]
 * Drop targets:  [data-drop-goal="<goalId>"] on a goal heading (subgoal untouched or cleared),
 *                plus data-drop-sub="<label>" for a subgoal, or data-drop-sub="" for "no subgoal".
 * Returns the id being dragged (null when idle) so the panel can reveal every drop zone.
 */
export function useTaskDrag(onDrop: (taskId: string, target: MoveTarget) => void): string | null {
  const [dragging, setDragging] = useState<string | null>(null)
  const dropRef = useRef(onDrop)
  useEffect(() => {
    dropRef.current = onDrop
  }, [onDrop])

  useEffect(() => {
    let id: string | null = null
    let src: HTMLElement | null = null
    let pid = -1
    let x0 = 0
    let y0 = 0
    let timer = 0
    let fly: HTMLElement | null = null
    let over: HTMLElement | null = null
    let active = false

    const targetAt = (x: number, y: number): HTMLElement | null =>
      (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop-goal]') ?? null

    const setOver = (el: HTMLElement | null) => {
      if (over === el) return
      over?.removeAttribute('data-over')
      over = el
      over?.setAttribute('data-over', 'true')
    }

    function begin(x: number, y: number) {
      if (!id || !src || active) return
      active = true
      dragLock.set(true)
      document.body.classList.add('dragging-on')
      src.setAttribute('data-dragging', 'true')
      fly = document.createElement('div')
      fly.className = 'flying'
      fly.textContent = src.querySelector('[data-task-title]')?.textContent ?? ''
      document.body.appendChild(fly)
      setDragging(id)
      move(x, y)
    }

    function move(x: number, y: number) {
      if (fly) {
        fly.style.left = `${x + 12}px`
        fly.style.top = `${y + 10}px`
      }
      const scroller = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-goals-scroll]')
      if (scroller) {
        const r = scroller.getBoundingClientRect()
        if (y < r.top + 40) scroller.scrollTop -= 12
        else if (y > r.bottom - 40) scroller.scrollTop += 12
      }
      setOver(targetAt(x, y))
    }

    function end(drop: boolean, x = 0, y = 0) {
      clearTimeout(timer)
      const target = drop && active ? targetAt(x, y) : null
      const taskId = id
      fly?.remove()
      fly = null
      src?.removeAttribute('data-dragging')
      setOver(null)
      document.body.classList.remove('dragging-on')
      const was = active
      active = false
      id = null
      src = null
      pid = -1
      if (was) {
        dragLock.set(false)
        setDragging(null)
      }
      if (target && taskId) {
        const sub = target.dataset.dropSub
        dropRef.current(taskId, { goalId: target.dataset.dropGoal!, subgoal: sub === undefined ? undefined : sub === '' ? null : sub })
      }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || active) return
      const t = e.target as HTMLElement
      if (t.closest('button, a, input, select, textarea')) return
      const row = t.closest<HTMLElement>('[data-drag-task]')
      if (!row) return
      id = row.dataset.dragTask ?? null
      src = row
      pid = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      if (e.pointerType === 'touch') timer = window.setTimeout(() => begin(x0, y0), HOLD_MS)
    }

    const onMove = (e: PointerEvent) => {
      if (!id || e.pointerId !== pid) return
      if (!active) {
        const far = Math.hypot(e.clientX - x0, e.clientY - y0) > MOVE_PX
        if (e.pointerType === 'touch') {
          if (far && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) {
            clearTimeout(timer) // the finger is scrolling, not holding
            id = null
          }
          return
        }
        if (far) begin(e.clientX, e.clientY)
        return
      }
      e.preventDefault()
      move(e.clientX, e.clientY)
    }

    const onUp = (e: PointerEvent) => {
      if (!id || e.pointerId !== pid) return
      end(true, e.clientX, e.clientY)
    }
    const cancel = () => id && end(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && active && end(false)
    const onTouchMove = (e: TouchEvent) => active && e.preventDefault()
    const onDragStart = (e: Event) => (e.target as HTMLElement | null)?.closest?.('[data-drag-task]') && e.preventDefault()

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', onKey)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('dragstart', onDragStart)
    window.addEventListener('blur', cancel)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('dragstart', onDragStart)
      window.removeEventListener('blur', cancel)
      if (active) end(false)
    }
  }, [])

  return dragging
}
