import { useCallback, useMemo, useState } from 'react'
import { addDays, dayName, parseDay, shortTime, todayStr } from '../lib/dates'
import { goalRank, hueOf, type Project, type Task } from '../tasks'
import { SUBGOAL_ORDER, buildGoals, canTick, prettyLabel, type Group } from '../tasks/rules'
import type { NewTask } from '../tasks/types'
import type { Block } from '../blocks/useBlocks'
import type { Dragging } from '../dnd/useDnd'
import { Panel } from '../ui/Shell'
import { NewTaskDialog, type GoalOption } from './NewTaskDialog'
import { TaskMenu } from './TaskMenu'
import type { MoveTarget } from './useTasks'

interface Props {
  projects: Project[]
  tasks: Task[]
  status: 'loading' | 'ok' | 'error'
  error: string | null
  stale: boolean
  ticked: ReadonlySet<string>
  complete: (id: string) => void
  add: (task: NewTask) => Promise<boolean>
  move: (id: string, target: MoveTarget) => void
  setDeadline: (id: string, date: string | null) => Promise<boolean>
  blocks: Block[]
  dragging: Dragging
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

interface RowProps {
  task: Task
  hue: string
  complete: (id: string) => void
  locked: boolean
  onMenu: (task: Task, anchor: DOMRect) => void
  plan: Block[]
}

/** When the task is planned: its next block, plus a count if there are more. */
function planChip(plan: Block[]): string | null {
  const today = todayStr()
  const next = plan.filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  if (next.length === 0) return null
  const more = next.length > 1 ? ` +${next.length - 1}` : ''
  return `${relDay(next[0].date)}${shortTime(next[0].start)}${more}`
}

function TaskRow({ task, hue, complete, locked, onMenu, plan }: RowProps) {
  const today = todayStr()
  const planned = planChip(plan)
  const d = task.due
  const repeating = task.recurring
  const disabled = locked || !canTick(task, today)
  // The real deadline is Todoist's Deadline field (a date). The due time is the planned work time, shown as the plan chip.
  const dl = task.deadline
  const deadline = !repeating && dl ? (dl < today ? 'Overdue' : `Due ${relDay(dl) || 'today'}`.trim()) : null
  const rhythm = repeating && d?.time ? `${shortTime(d.time)} daily` : null

  return (
    <div
      className="group flex cursor-grab select-none items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] hover:bg-soft [touch-action:pan-y] [-webkit-touch-callout:none] [@media(pointer:coarse)]:py-2.5"
      data-task={task.id}
      data-drag-task={task.id}
      data-recurring={task.recurring}
      data-minutes={task.durationMin ?? 30}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ['--h' as string]: hue }}
    >
      <button
        type="button"
        aria-label={`Complete ${task.content}`}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => complete(task.id)}
        className="size-[18px] flex-none rounded-[5px] border-[1.5px] border-grey-line bg-panel p-0 hover:border-[var(--h)] disabled:cursor-default disabled:opacity-35 [@media(pointer:coarse)]:size-[22px]"
        style={disabled ? { background: `color-mix(in srgb, ${hue} 20%, var(--panel))` } : undefined}
      />
      <span data-task-title className="min-w-0 flex-1 [overflow-wrap:anywhere] text-ink2">
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
      {planned && (
        <span
          className="flex-none whitespace-nowrap rounded-md px-[7px] py-0.5 text-[11.5px] font-medium"
          style={{ color: hue, background: `color-mix(in srgb, ${hue} 15%, var(--panel))` }}
          title="Planned on the calendar"
        >
          {planned}
        </span>
      )}
      {rhythm && <span className="flex-none whitespace-nowrap rounded-md bg-grey-fill px-[7px] py-0.5 text-[11.5px] font-medium text-grey-ink">{rhythm}</span>}
      <button
        type="button"
        aria-label={`Options for ${task.content}`}
        aria-haspopup="menu"
        onClick={(e) => onMenu(task, e.currentTarget.getBoundingClientRect())}
        className="grid size-6 flex-none place-items-center rounded-md text-muted opacity-0 hover:bg-line focus:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
    </div>
  )
}

interface SubProps {
  group: Group
  goalId: string
  showOther: boolean
  hue: string
  open: boolean
  onToggle: () => void
  ticked: ReadonlySet<string>
  complete: (id: string) => void
  onMenu: RowProps['onMenu']
  blocksByTask: Map<string, Block[]>
}

function Subgoal({ group, goalId, showOther, hue, open, onToggle, ticked, complete, onMenu, blocksByTask }: SubProps) {
  const shown = open ? group.tasks : group.tasks.slice(0, LIMIT)
  const hidden = group.tasks.length - LIMIT
  return (
    <div className="my-0.5 mb-1 ml-3.5 border-l-2 pl-2" style={{ borderColor: `color-mix(in srgb, ${hue} 25%, var(--panel))` }}>
      {(group.label !== null || showOther) && (
        <div
          data-drop-goal={goalId}
          data-drop-sub={group.label ?? ''}
          className="flex items-center gap-[7px] rounded-lg px-1.5 pb-0.5 pt-1.5 text-xs font-semibold tracking-[0.01em]"
          style={{ color: hue }}
        >
          <i className="size-1.5 rounded-full" style={{ background: hue }} />
          {group.label === null ? 'Other' : prettyLabel(group.label)}
          <span className="ml-auto font-medium text-muted">{group.tasks.length}</span>
        </div>
      )}
      {shown.map((t) => (
        <TaskRow key={t.id} task={t} hue={hue} complete={complete} locked={ticked.has(t.id)} onMenu={onMenu} plan={blocksByTask.get(t.id) ?? []} />
      ))}
      {hidden > 0 && (
        <button type="button" onClick={onToggle} className="w-full rounded-[10px] border-0 bg-transparent px-1.5 py-1 text-left text-[12.5px] text-muted hover:bg-soft">
          {open ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}

/** While dragging, every subgoal of a goal is shown (even empty ones) so there is somewhere to drop. */
function withDropZones(name: string, groups: Group[], dragging: boolean): Group[] {
  const subs = SUBGOAL_ORDER[name] ?? []
  if (!dragging || subs.length === 0) return groups
  const byLabel = new Map(groups.map((g) => [g.label, g]))
  const zones = subs.map((s) => byLabel.get(s) ?? { label: s, tasks: [] })
  zones.push(byLabel.get(null) ?? { label: null, tasks: [] })
  return zones
}

export function GoalsPanel({ projects, tasks, status, error, stale, ticked, complete, add, move, setDeadline, blocks, dragging }: Props) {
  const byId = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])
  const goals = buildGoals(projects, tasks)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => load('cockpit-ui', {}))
  const [dialogGoal, setDialogGoal] = useState<string | null>(null)
  const [dialogChosen, setDialogChosen] = useState(false)
  const [menu, setMenu] = useState<{ task: Task; anchor: DOMRect } | null>(null)

  const blocksByTask = useMemo(() => {
    const m = new Map<string, Block[]>()
    for (const b of blocks) m.set(b.taskId, [...(m.get(b.taskId) ?? []), b])
    return m
  }, [blocks])
  const dragTask = dragging?.kind === 'task'

  const allGoals: GoalOption[] = useMemo(
    () =>
      projects
        .filter((p) => !p.parentId || !byId[p.parentId])
        .sort((a, b) => goalRank(a) - goalRank(b))
        .map((p) => ({ project: p, name: p.inbox ? 'Unsorted (Inbox)' : p.name })),
    [projects, byId],
  )
  const firstGoalId = allGoals.find((g) => !g.project.inbox)?.project.id ?? allGoals[0]?.project.id ?? ''

  const flip = (key: string) => {
    const next = { ...collapsed, [key]: !collapsed[key] }
    setCollapsed(next)
    try {
      localStorage.setItem('cockpit-ui', JSON.stringify(next))
    } catch {
      /* per-device preference only */
    }
  }

  const rootGoalOf = useCallback(
    (t: Task) => {
      let p = byId[t.projectId]
      while (p?.parentId && byId[p.parentId]) p = byId[p.parentId]
      return p?.id ?? t.projectId
    },
    [byId],
  )

  return (
    <Panel>
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <h2 className="m-0 text-[15px] font-semibold">Goals</h2>
        <button
          type="button"
          aria-label="New task"
          title="New task"
          disabled={!firstGoalId}
          onClick={() => {
            setDialogChosen(false)
            setDialogGoal(firstGoalId)
          }}
          className="grid size-[30px] place-items-center rounded-lg text-ink2 hover:bg-soft disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {status === 'loading' && <p className="m-0 px-4 pb-2 text-xs text-muted">Syncing with Todoist</p>}
      {status === 'error' && (
        <p role="alert" className="m-0 px-4 pb-2 text-xs text-accent">
          {error}
          {stale ? ' Showing the last saved copy.' : ''}
        </p>
      )}
      <div data-goals-scroll className="min-h-0 flex-1 overflow-auto px-2.5 pb-4">
        {goals.map(({ project, name, tasks: gt, groups }) => {
          const hue = hueOf(project.id, byId)
          const closed = Boolean(collapsed[project.id]) && !dragTask
          const shownGroups = withDropZones(project.inbox ? '' : project.name, groups, dragTask)
          return (
            <div key={project.id} className="mb-1.5" data-goal={name}>
              <button
                type="button"
                data-drop-goal={project.id}
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
                  {shownGroups.map((g) => (
                    <Subgoal
                      key={g.label ?? '_'}
                      group={g}
                      goalId={project.id}
                      showOther={shownGroups.length > 1}
                      hue={hue}
                      open={Boolean(collapsed[`more:${project.id}:${g.label ?? '_'}`])}
                      onToggle={() => flip(`more:${project.id}:${g.label ?? '_'}`)}
                      ticked={ticked}
                      complete={complete}
                      onMenu={(task, anchor) => setMenu({ task, anchor })}
                      blocksByTask={blocksByTask}
                    />
                  ))}
                  <div className="ml-3.5 pl-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDialogChosen(true)
                        setDialogGoal(project.id)
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left text-muted hover:bg-soft"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add task
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
        {status !== 'loading' && goals.length === 0 && <p className="px-1.5 text-xs text-muted">No projects yet.</p>}
      </div>

      {dialogGoal !== null && <NewTaskDialog goals={allGoals} initialGoalId={dialogGoal} goalChosen={dialogChosen} onSubmit={add} onClose={() => setDialogGoal(null)} />}
      {menu && (
        <TaskMenu
          task={menu.task}
          goals={allGoals.map((g) => ({ id: g.project.id, name: g.project.inbox ? 'Unsorted' : g.name }))}
          currentGoalId={rootGoalOf(menu.task)}
          anchor={menu.anchor}
          onMove={(target) => move(menu.task.id, target)}
          onDeadline={(due) => setDeadline(menu.task.id, due)}
          onClose={() => setMenu(null)}
        />
      )}
    </Panel>
  )
}
