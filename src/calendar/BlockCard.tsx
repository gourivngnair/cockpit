import { useEffect, useRef } from 'react'
import { fmtDur, shortTime, todayStr, addDays, dayName, parseDay } from '../lib/dates'
import type { Task } from '../tasks'

const LENGTHS = [15, 30, 45, 60, 90, 120]
const W = 270

function relDay(s: string): string {
  const t = todayStr()
  if (s === t) return 'today'
  if (s === addDays(t, 1)) return 'tomorrow'
  const diff = (parseDay(s).getTime() - parseDay(t).getTime()) / 864e5
  return diff > 0 && diff < 7 ? dayName(s) : parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Props {
  task: Task
  projectName: string
  minutes: number
  x: number
  y: number
  onLength: (minutes: number) => void
  onDone: () => void
  onFocus: () => void
  onRemove: () => void
  onClose: () => void
}

/** The small card that opens when you click a block. */
export function BlockCard({ task, projectName, minutes, x, y, onLength, onDone, onFocus, onRemove, onClose }: Props) {
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

  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - 230))
  const d = task.due
  const btn = 'rounded-[9px] border border-line bg-panel px-3 py-1.5 text-[13px] font-medium'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Block for ${task.content}`}
      className="fixed z-50 rounded-[14px] border border-line bg-panel p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
      style={{ left, top, width: W }}
    >
      <h6 className="m-0 mb-1 text-sm font-semibold">{task.content}</h6>
      <p className="m-0 text-[12.5px] text-muted">
        {projectName}
        {d && !task.recurring ? `, due ${relDay(d.date)}${d.time ? ` ${shortTime(d.time)}` : ''}` : ''}
      </p>
      <div className="my-3 flex flex-wrap gap-1.5" role="group" aria-label="Length">
        {LENGTHS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === minutes}
            onClick={() => onLength(m)}
            className={`rounded-[7px] border px-2.5 py-[3px] text-[12.5px] ${m === minutes ? 'border-ink bg-ink text-panel' : 'border-line bg-panel'}`}
          >
            {fmtDur(m)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={`${btn} border-ink bg-ink text-panel`} onClick={onFocus}>
          Focus
        </button>
        <button type="button" className={btn} onClick={onDone}>
          Mark done
        </button>
        <button type="button" className={`${btn} text-accent`} onClick={onRemove}>
          Remove block
        </button>
      </div>
    </div>
  )
}
