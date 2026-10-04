import { useRef, useState, type KeyboardEvent } from 'react'
import { addDays, dayName, parseDay, shortTime, todayStr } from '../lib/dates'
import { hueOf, type Project, type Task } from '../tasks'
import { buildGoals, canTick, prettyLabel, type Group } from '../tasks/rules'
import { Panel } from '../ui/Shell'

interface Props {
  projects: Project[]
  tasks: Task[]
  status: 'loading' | 'ok' | 'error'
  error: string | null
  stale: boolean
  ticked: ReadonlySet<string>
  complete: (id: string) => void
  add: (content: string, projectId: string | null) => Promise<boolean>
}

const LIMIT = 5 // tasks shown per subgoal before "Show more"

function relDay(s: string): string {
  const t = todayStr()
  if (s === t) return ''
  if (s === addDays(t, 1)) return 'Tmrw '
  const diff = (parseDay(s).getTime() - parseDay(t).getTime()) / 864e5
  if (diff > 0 && diff < 7) return `${dayName(s)} `
  return `${parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} `
}

/** Lightweight *italic* support, as in v2. */
function Title({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g)
  return <>{parts.map((p, i) => (i % 2 ? <em key={i}>{p}</em> : p))}</>
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function TaskRow({ task, hue, complete, locked }: { task: Task; hue: string; complete: (id: string) => void; locked: boolean }) {
  const today = todayStr()
  const d = task.due
  const repeating = task.recurring
  const disabled = locked || !canTick(task, today)
  const overdue = !repeating && d && d.date < today
  const deadline = !repeating && d ? (overdue ? 'Overdue' : `Due ${relDay(d.date) || 'today '}${d.time ? shortTime(d.time) : ''}`.trim()) : null
  const rhythm = repeating && d?.time ? `${shortTime(d.time)} daily` : null

  return (
    <div className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] hover:bg-soft" data-task={task.id} style={{ ['--h' as string]: hue }}>
      <button
        type="button"
        aria-label={`Complete ${task.content}`}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => complete(task.id)}
        className="size-[18px] flex-none rounded-[5px] border-[1.5px] border-grey-line bg-panel p-0 hover:border-[var(--h)] disabled:cursor-default disabled:opacity-35"
        style={disabled ? { background: `color-mix(in srgb, ${hue} 20%, var(--panel))` } : undefined}
      />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-ink2">
        <Title text={task.content} />
      </span>
      {deadline && (
        <span
          className="flex-none whitespace-nowrap rounded-md px-[7px] py-0.5 text-[11.5px] font-medium text-accent"
          style={{ background: 'color-mix(in srgb, var(--red) 12%, var(--panel))' }}
          title="Deadline"
        >
          {deadline}
        </span>
      )}
      {rhythm && <span className="flex-none whitespace-nowrap rounded-md bg-grey-fill px-[7px] py-0.5 text-[11.5px] font-medium text-grey-ink">{rhythm}</span>}
    </div>
  )
}

function Subgoal({ group, showOther, hue, open, onToggle, ticked, complete }: { group: Group; showOther: boolean; hue: string; open: boolean; onToggle: () => void; ticked: ReadonlySet<string>; complete: (id: string) => void }) {
  const shown = open ? group.tasks : group.tasks.slice(0, LIMIT)
  const hidden = group.tasks.length - LIMIT
  return (
    <div className="my-0.5 mb-1 ml-3.5 border-l-2 pl-2" style={{ borderColor: `color-mix(in srgb, ${hue} 25%, var(--panel))` }}>
      {(group.label !== null || showOther) && (
        <div className="flex items-center gap-[7px] px-1.5 pb-0.5 pt-1.5 text-xs font-semibold tracking-[0.01em]" style={{ color: hue }}>
          <i className="size-1.5 rounded-full" style={{ background: hue }} />
          {group.label === null ? 'Other' : prettyLabel(group.label)}
          <span className="ml-auto font-medium text-muted">{group.tasks.length}</span>
        </div>
      )}
      {shown.map((t) => (
        <TaskRow key={t.id} task={t} hue={hue} complete={complete} locked={ticked.has(t.id)} />
      ))}
      {hidden > 0 && (
        <button type="button" onClick={onToggle} className="w-full rounded-[10px] border-0 bg-transparent px-1.5 py-1 text-left text-[12.5px] text-muted hover:bg-soft">
          {open ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}

function AddTask({ projectId, adding, setAdding, add }: { projectId: string; adding: boolean; setAdding: (v: boolean) => void; add: Props['add'] }) {
  const input = useRef<HTMLInputElement>(null)
  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => {
          setAdding(true)
          setTimeout(() => input.current?.focus(), 0)
        }}
        className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left text-muted hover:bg-soft"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add task
      </button>
    )
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setAdding(false)
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      const text = e.currentTarget.value
      e.currentTarget.value = ''
      void add(text, projectId)
    }
  }
  return (
    <input
      ref={input}
      autoFocus
      aria-label="New task"
      placeholder="New task, press Enter"
      onKeyDown={onKey}
      onBlur={(e) => !e.currentTarget.value && setAdding(false)}
      className="my-0.5 mb-1 w-full rounded-[10px] border border-line bg-soft px-2.5 py-2"
    />
  )
}

export function GoalsPanel({ projects, tasks, status, error, stale, ticked, complete, add }: Props) {
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]))
  const goals = buildGoals(projects, tasks)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => load('cockpit-ui', {}))
  const [adding, setAdding] = useState<string | null>(null)

  const flip = (key: string) => {
    const next = { ...collapsed, [key]: !collapsed[key] }
    setCollapsed(next)
    try {
      localStorage.setItem('cockpit-ui', JSON.stringify(next))
    } catch {
      /* per-device preference only */
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <h2 className="m-0 text-[15px] font-semibold">Goals</h2>
      </div>
      {status === 'loading' && <p className="m-0 px-4 pb-2 text-xs text-muted">Syncing with Todoist</p>}
      {status === 'error' && (
        <p role="alert" className="m-0 px-4 pb-2 text-xs text-accent">
          {error}
          {stale ? ' Showing the last saved copy.' : ''}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-4">
        {goals.map(({ project, name, tasks: gt, groups }) => {
          const hue = hueOf(project.id, byId)
          const closed = Boolean(collapsed[project.id])
          return (
            <div key={project.id} className="mb-1.5" data-goal={name}>
              <button
                type="button"
                aria-expanded={!closed}
                onClick={() => flip(project.id)}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-2 text-left hover:bg-soft"
              >
                <span
                  className="grid size-[26px] flex-none place-items-center rounded-lg text-xs font-bold"
                  style={{ color: hue, background: `color-mix(in srgb, ${hue} 15%, var(--panel))` }}
                >
                  {name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 font-semibold">{name}</span>
                <span className="text-xs font-medium text-muted">{gt.length}</span>
                <span className="w-3.5 text-[11px] text-muted" aria-hidden="true">
                  {closed ? '▸' : '▾'}
                </span>
              </button>
              {!closed && (
                <>
                  {groups.map((g) => (
                    <Subgoal
                      key={g.label ?? '_'}
                      group={g}
                      showOther={groups.length > 1}
                      hue={hue}
                      open={Boolean(collapsed[`more:${project.id}:${g.label ?? '_'}`])}
                      onToggle={() => flip(`more:${project.id}:${g.label ?? '_'}`)}
                      ticked={ticked}
                      complete={complete}
                    />
                  ))}
                  <div className="ml-3.5 pl-2.5">
                    <AddTask projectId={project.id} adding={adding === project.id} setAdding={(v) => setAdding(v ? project.id : null)} add={(text, pid) => add(text, project.inbox ? null : pid)} />
                  </div>
                </>
              )}
            </div>
          )
        })}
        {status !== 'loading' && goals.length === 0 && <p className="px-1.5 text-xs text-muted">No projects yet.</p>}
      </div>
    </Panel>
  )
}
