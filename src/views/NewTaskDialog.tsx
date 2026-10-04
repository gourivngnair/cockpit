import { useMemo, useRef, useState, type FormEvent } from 'react'
import { addDays, fmtDur, mondayOf, parseDay, todayStr } from '../lib/dates'
import type { Project } from '../tasks'
import { quickParse } from '../tasks/quickParse'
import { SUBGOAL_ORDER, prettyLabel } from '../tasks/rules'
import type { NewTask } from '../tasks/types'

export interface GoalOption {
  project: Project
  name: string
}

interface Props {
  goals: GoalOption[]
  initialGoalId: string
  /** True when the card was opened from a specific goal, so typed words must not move it elsewhere. */
  goalChosen: boolean
  onSubmit: (task: NewTask) => Promise<boolean>
  onClose: () => void
}

const PRESETS = [15, 30, 45, 60, 90, 120]

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-[13px] ${on ? 'border-ink bg-ink text-panel' : 'border-line bg-panel text-ink2'}`

export function NewTaskDialog({ goals, initialGoalId, goalChosen, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [goalId, setGoalId] = useState(initialGoalId)
  const [subgoal, setSubgoal] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [goalTouched, setGoalTouched] = useState(goalChosen)
  const nameRef = useRef<HTMLInputElement>(null)

  const goal = goals.find((g) => g.project.id === goalId) ?? goals[0]
  const subgoals = useMemo(() => SUBGOAL_ORDER[goal?.name ?? ''] ?? [], [goal])
  const today = todayStr()
  const quick: Array<[string, string]> = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['End of week', addDays(mondayOf(today), 6)],
  ]

  // Quick-add: durations, dates and subgoal words typed in the task name fill any field you left empty.
  const parsed = useMemo(() => quickParse(name, todayStr()), [name])
  const detected = [
    parsed.durationMin ? `Time needed ${fmtDur(parsed.durationMin)}` : null,
    parsed.deadline ? `Due ${parseDay(parsed.deadline).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : null,
    parsed.subgoal ? `Subgoal ${prettyLabel(parsed.subgoal)}` : null,
  ].filter(Boolean)

  function pickGoal(id: string) {
    setGoalTouched(true)
    setGoalId(id)
    setSubgoal(null) // subgoals belong to a goal
  }

  function setCustomMinutes(v: string) {
    setCustom(v)
    const n = Number(v)
    setMinutes(v.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 1439 ? n : null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !goal) return
    setBusy(true)
    // Fields you set yourself win; the parser only fills the empty ones.
    let useGoal = goal
    let useSub = subgoal
    if (!useSub && parsed.subgoal && parsed.goalName) {
      const detected = goals.find((g) => g.name === parsed.goalName)
      if (detected && (detected.project.id === goal.project.id || !goalTouched)) {
        useGoal = detected
        useSub = parsed.subgoal
      }
    }
    const ok = await onSubmit({
      content: parsed.title,
      projectId: useGoal.project.inbox ? null : useGoal.project.id,
      label: useSub,
      durationMin: minutes ?? parsed.durationMin,
      deadline: date || parsed.deadline || null,
    })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-panel border border-line bg-panel shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="m-0 text-base font-semibold">New task</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1 text-ink2 hover:bg-soft">
            Cancel
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
          <div>
            <label htmlFor="nt-name" className="mb-1.5 block text-[13px] font-medium text-ink2">
              Task
            </label>
            <input
              id="nt-name"
              ref={nameRef}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What needs doing? e.g. Revise FM1 1h by Fri"
              className="w-full rounded-[10px] border border-line bg-soft px-3 py-2"
            />
            {detected.length > 0 && (
              <p data-detected className="m-0 mt-1.5 text-xs text-muted">
                Detected: {detected.join(' · ')}. Used for any field you leave empty.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="nt-goal" className="mb-1.5 block text-[13px] font-medium text-ink2">
              Goal
            </label>
            <select id="nt-goal" value={goalId} onChange={(e) => pickGoal(e.target.value)} className="w-full rounded-[10px] border border-line bg-soft px-3 py-2">
              {goals.map((g) => (
                <option key={g.project.id} value={g.project.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {subgoals.length > 0 && (
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1.5 text-[13px] font-medium text-ink2">Subgoal</legend>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={subgoal === null} onClick={() => setSubgoal(null)} className={chip(subgoal === null)}>
                  None
                </button>
                {subgoals.map((s) => (
                  <button key={s} type="button" aria-pressed={subgoal === s} onClick={() => setSubgoal(s)} className={chip(subgoal === s)}>
                    {prettyLabel(s)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-medium text-ink2">Time needed</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutes === m}
                  onClick={() => {
                    setMinutes(minutes === m ? null : m)
                    setCustom('')
                  }}
                  className={chip(minutes === m)}
                >
                  {fmtDur(m)}
                </button>
              ))}
              <input
                aria-label="Custom minutes"
                inputMode="numeric"
                value={custom}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="min"
                className="w-16 rounded-full border border-line bg-soft px-3 py-1 text-[13px]"
              />
            </div>
          </fieldset>

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-medium text-ink2">Deadline</legend>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quick.map(([label, d]) => (
                <button key={label} type="button" aria-pressed={date === d} onClick={() => setDate(date === d ? '' : d)} className={chip(date === d)}>
                  {label}
                </button>
              ))}
            </div>
            <input type="date" aria-label="Deadline date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-[10px] border border-line bg-soft px-3 py-2" />
            <p className="m-0 mt-1.5 text-xs text-muted">A deadline is a date. Drag the task onto the calendar to plan when you will work on it.</p>
          </fieldset>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="submit" disabled={!name.trim() || busy} className="rounded-[10px] bg-ink px-5 py-2 font-semibold text-panel disabled:opacity-40">
            {busy ? 'Adding' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  )
}
