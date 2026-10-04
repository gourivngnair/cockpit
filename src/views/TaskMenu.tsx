import { useEffect, useRef, useState } from 'react'
import type { Due, Task } from '../tasks'
import { SUBGOAL_ORDER, prettyLabel, subgoalOf } from '../tasks/rules'
import type { MoveTarget } from './useTasks'

export interface MenuGoal {
  id: string
  name: string
}

interface Props {
  task: Task
  goals: MenuGoal[]
  currentGoalId: string
  anchor: DOMRect
  onMove: (target: MoveTarget) => void
  onDeadline: (due: Due | null) => Promise<boolean>
  onClose: () => void
}

const W = 280

export function TaskMenu({ task, goals, currentGoalId, anchor, onMove, onDeadline, onClose }: Props) {
  const [mode, setMode] = useState<'menu' | 'move' | 'deadline'>('menu')
  const [date, setDate] = useState(task.due?.date ?? '')
  const [time, setTime] = useState(task.due?.time ?? '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  const left = Math.max(8, Math.min(anchor.right - W, window.innerWidth - W - 8))
  const top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - 360))
  const currentGoalName = goals.find((g) => g.id === currentGoalId)?.name ?? ''
  const currentSub = subgoalOf(task, SUBGOAL_ORDER[currentGoalName] ?? [])

  const row = 'block w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-soft disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Options for ${task.content}`}
      className="fixed z-50 max-h-[70vh] overflow-auto rounded-[14px] border border-line bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
      style={{ left, top, width: W }}
    >
      {mode === 'menu' && (
        <>
          <button type="button" role="menuitem" className={row} onClick={() => setMode('move')}>
            Move to…
          </button>
          <button type="button" role="menuitem" className={row} disabled={task.recurring} onClick={() => setMode('deadline')}>
            Deadline…
          </button>
          {task.recurring && <p className="m-0 px-2.5 pb-1.5 text-xs text-muted">This task repeats in Todoist, so its date is locked.</p>}
        </>
      )}

      {mode === 'move' && (
        <div>
          <p className="m-0 px-2.5 pb-1 pt-1 text-xs font-semibold text-muted">Move to</p>
          {goals.map((g) => {
            const subs = SUBGOAL_ORDER[g.name] ?? []
            const here = g.id === currentGoalId
            return (
              <div key={g.id}>
                <button
                  type="button"
                  role="menuitem"
                  className={`${row} font-semibold`}
                  disabled={here && currentSub === null}
                  onClick={() => {
                    onMove({ goalId: g.id, subgoal: here ? null : undefined })
                    onClose()
                  }}
                >
                  {g.name}
                  {here && currentSub === null ? ' (here)' : ''}
                </button>
                {subs.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitem"
                    className={`${row} pl-6 text-ink2`}
                    disabled={here && currentSub === s}
                    onClick={() => {
                      onMove({ goalId: g.id, subgoal: s })
                      onClose()
                    }}
                  >
                    {prettyLabel(s)}
                    {here && currentSub === s ? ' (here)' : ''}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {mode === 'deadline' && (
        <form
          className="p-1.5"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!date) return
            if (await onDeadline({ date, time: time || null })) onClose()
          }}
        >
          <p className="m-0 mb-2 text-[13px] font-semibold">Deadline</p>
          <input type="date" aria-label="Deadline date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-2 w-full rounded-lg border border-line bg-soft px-2.5 py-1.5" />
          <input type="time" aria-label="Deadline time" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} className="mb-3 w-full rounded-lg border border-line bg-soft px-2.5 py-1.5 disabled:opacity-40" />
          <div className="flex gap-2">
            <button type="submit" disabled={!date} className="rounded-lg bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-panel disabled:opacity-40">
              Save
            </button>
            {task.due && (
              <button
                type="button"
                onClick={async () => {
                  if (await onDeadline(null)) onClose()
                }}
                className="rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-accent"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
