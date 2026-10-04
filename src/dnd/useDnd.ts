import { useEffect, useRef, useState } from 'react'
import { END, START, resizedMinutes, slotFromY } from '../calendar/time'
import { toHM } from '../lib/dates'
import { dragLock } from '../ui/dragLock'
import type { MoveTarget } from '../views/useTasks'

const HOLD_MS = 350 // touch: press and hold to pick something up, so normal scrolling still works
const MOVE_PX = 6
const DEFAULT_MIN = 30

export interface DndHandlers {
  moveTask: (taskId: string, target: MoveTarget) => void
  placeTask: (taskId: string, date: string, startMin: number) => void
  moveBlock: (blockId: string, date: string, startMin: number) => void
  resizeBlock: (blockId: string, minutes: number) => void
  refuse: (message: string) => void
}

export type Dragging = { kind: 'task' | 'block'; id: string } | null

/**
 * One pointer-event drag system (never the HTML5 drag-and-drop API; lesson 1).
 *
 * Sources:  [data-drag-task]   a task row (data-recurring, data-minutes)
 *           [data-drag-block]  a block on the calendar (data-block-minutes)
 *           [data-resize]      a block's bottom edge
 * Targets:  [data-drop-goal] (+ data-drop-sub)  a goal or subgoal heading (tasks only)
 *           [data-lane="<YYYY-MM-DD>"]          a day column on the calendar
 *
 * While a gesture runs, dragLock is held so background refreshes wait (invariant 6).
 */
export function useDnd(handlers: DndHandlers): Dragging {
  const [dragging, setDragging] = useState<Dragging>(null)
  const h = useRef(handlers)
  useEffect(() => {
    h.current = handlers
  }, [handlers])

  useEffect(() => {
    type Source = { kind: 'task' | 'block'; id: string; el: HTMLElement; minutes: number; recurring: boolean; grabDY: number }
    let src: Source | null = null
    let pid = -1
    let x0 = 0
    let y0 = 0
    let timer = 0
    let fly: HTMLElement | null = null
    let ghost: HTMLElement | null = null
    let over: HTMLElement | null = null
    let active = false
    let justDropped = 0
    let resize: { id: string; el: HTMLElement; start: number; m0: number; m: number; y0: number; hourPx: number; pid: number } | null = null

    const under = (x: number, y: number) => document.elementFromPoint(x, y) as HTMLElement | null
    const goalAt = (x: number, y: number) => under(x, y)?.closest<HTMLElement>('[data-drop-goal]') ?? null
    const laneAt = (x: number, y: number) => under(x, y)?.closest<HTMLElement>('[data-lane]') ?? null

    const setOver = (el: HTMLElement | null) => {
      if (over === el) return
      over?.removeAttribute('data-over')
      over = el
      over?.setAttribute('data-over', 'true')
    }
    const clearGhost = () => {
      ghost?.remove()
      ghost = null
    }

    function begin(x: number, y: number) {
      if (!src || active) return
      active = true
      dragLock.set(true)
      document.body.classList.add('dragging-on')
      src.el.setAttribute('data-dragging', 'true')
      fly = document.createElement('div')
      fly.className = 'flying'
      fly.textContent = src.el.querySelector('[data-task-title]')?.textContent ?? src.el.querySelector('b')?.textContent ?? ''
      document.body.appendChild(fly)
      setDragging({ kind: src.kind, id: src.id })
      move(x, y)
    }

    function autoScroll(x: number, y: number) {
      const el = under(x, y)?.closest<HTMLElement>('[data-goals-scroll], [data-calscroll]')
      if (!el) return
      const r = el.getBoundingClientRect()
      if (y < r.top + 40) el.scrollTop -= 12
      else if (y > r.bottom - 40) el.scrollTop += 12
    }

    function slotAt(lane: HTMLElement, y: number) {
      const r = lane.getBoundingClientRect()
      const hourPx = r.height / (END - START)
      const minutes = src?.minutes ?? DEFAULT_MIN
      const topY = y - (src?.grabDY ?? 8)
      return { start: slotFromY(topY, r.top, minutes, hourPx), minutes, hourPx, laneTop: r.top }
    }

    function move(x: number, y: number) {
      if (!src) return
      if (fly) {
        fly.style.left = `${x + 12}px`
        fly.style.top = `${y + 10}px`
      }
      autoScroll(x, y)
      clearGhost()
      const lane = laneAt(x, y)
      if (lane && !src.recurring) {
        setOver(null)
        const s = slotAt(lane, y)
        ghost = document.createElement('div')
        ghost.className = 'ghost'
        ghost.style.top = `${((s.start - START * 60) / 60) * s.hourPx}px`
        ghost.style.height = `${(s.minutes / 60) * s.hourPx - 2}px`
        ghost.textContent = `${toHM(s.start)} to ${toHM(Math.min(s.start + s.minutes, END * 60 - 1))}`
        lane.appendChild(ghost)
        return
      }
      setOver(src.kind === 'task' ? goalAt(x, y) : null)
    }

    function end(drop: boolean, x = 0, y = 0) {
      clearTimeout(timer)
      const s = src
      const was = active
      const goal = drop && was && s?.kind === 'task' ? goalAt(x, y) : null
      const lane = drop && was ? laneAt(x, y) : null
      const slot = lane && s && !s.recurring ? slotAt(lane, y) : null

      fly?.remove()
      fly = null
      clearGhost()
      s?.el.removeAttribute('data-dragging')
      setOver(null)
      document.body.classList.remove('dragging-on')
      active = false
      src = null
      pid = -1
      if (was) {
        justDropped = Date.now()
        dragLock.set(false)
        setDragging(null)
      }
      if (!s || !was) return
      if (lane && s.recurring) return h.current.refuse('Repeating tasks keep their Todoist time.')
      if (slot && lane) {
        if (s.kind === 'task') h.current.placeTask(s.id, lane.dataset.lane!, slot.start)
        else h.current.moveBlock(s.id, lane.dataset.lane!, slot.start)
      } else if (goal) {
        const sub = goal.dataset.dropSub
        h.current.moveTask(s.id, { goalId: goal.dataset.dropGoal!, subgoal: sub === undefined ? undefined : sub === '' ? null : sub })
      }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || active || resize) return
      const t = e.target as HTMLElement

      const handle = t.closest<HTMLElement>('[data-resize]')
      if (handle) {
        const el = handle.closest<HTMLElement>('[data-drag-block]')
        const lane = handle.closest<HTMLElement>('[data-lane]')
        if (!el || !lane) return
        e.preventDefault()
        const start = Number(el.dataset.blockStart)
        const m0 = Number(el.dataset.blockMinutes)
        resize = { id: handle.dataset.resize!, el, start, m0, m: m0, y0: e.clientY, hourPx: lane.getBoundingClientRect().height / (END - START), pid: e.pointerId }
        handle.setPointerCapture?.(e.pointerId)
        dragLock.set(true)
        document.body.classList.add('resizing-on')
        return
      }

      if (t.closest('button, a, input, select, textarea')) return
      const taskRow = t.closest<HTMLElement>('[data-drag-task]')
      const blockEl = taskRow ? null : t.closest<HTMLElement>('[data-drag-block]')
      const el = taskRow ?? blockEl
      if (!el) return
      const kind = taskRow ? 'task' : 'block'
      const id = (taskRow ? el.dataset.dragTask : el.dataset.dragBlock) ?? ''
      src = {
        kind,
        id,
        el,
        minutes: Number((taskRow ? el.dataset.minutes : el.dataset.blockMinutes) || DEFAULT_MIN),
        recurring: el.dataset.recurring === 'true',
        grabDY: kind === 'block' ? e.clientY - el.getBoundingClientRect().top : 8,
      }
      pid = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      if (e.pointerType === 'touch') timer = window.setTimeout(() => begin(x0, y0), HOLD_MS)
    }

    const onMove = (e: PointerEvent) => {
      if (resize && e.pointerId === resize.pid) {
        e.preventDefault()
        const m = resizedMinutes(resize.start, resize.m0, e.clientY - resize.y0, resize.hourPx)
        resize.m = m
        resize.el.style.height = `${(m / 60) * resize.hourPx - 4}px`
        const len = resize.el.querySelector('[data-block-len]')
        if (len) len.textContent = `${m}m`
        return
      }
      if (!src || e.pointerId !== pid) return
      if (!active) {
        const dist = Math.hypot(e.clientX - x0, e.clientY - y0)
        if (e.pointerType === 'touch') {
          if (dist > 10) {
            clearTimeout(timer) // the finger is scrolling, not holding
            src = null
          }
          return
        }
        if (dist > MOVE_PX) begin(e.clientX, e.clientY)
        return
      }
      e.preventDefault()
      move(e.clientX, e.clientY)
    }

    const onUp = (e: PointerEvent) => {
      if (resize && e.pointerId === resize.pid) {
        const r = resize
        resize = null
        document.body.classList.remove('resizing-on')
        justDropped = Date.now()
        dragLock.set(false)
        if (r.m !== r.m0) h.current.resizeBlock(r.id, r.m)
        return
      }
      if (!src || e.pointerId !== pid) return
      end(true, e.clientX, e.clientY)
    }

    const cancel = () => {
      if (resize) {
        const r = resize
        resize = null
        document.body.classList.remove('resizing-on')
        r.el.style.height = `${(r.m0 / 60) * r.hourPx - 4}px`
        dragLock.set(false)
      }
      if (src) end(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (active || resize) && cancel()
    const onTouchMove = (e: TouchEvent) => (active || resize) && e.preventDefault()
    const onDragStart = (e: Event) => (e.target as HTMLElement | null)?.closest?.('[data-drag-task], [data-drag-block]') && e.preventDefault()
    // A drag that ends over its own source must not also count as a click that opens a card.
    const onClickCapture = (e: MouseEvent) => {
      if (Date.now() - justDropped < 300) {
        e.stopPropagation()
        e.preventDefault()
      }
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', onKey)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('blur', cancel)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('blur', cancel)
      cancel()
    }
  }, [])

  return dragging
}
