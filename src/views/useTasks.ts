import { useCallback, useEffect, useRef, useState } from 'react'
import { todayStr, addDays, dayName, parseDay } from '../lib/dates'
import { samePlan } from '../blocks/plan'
import { taskSource, type Project, type Task } from '../tasks'
import { canTick, labelsWithSubgoal } from '../tasks/rules'
import type { NewTask, Plan } from '../tasks/types'
import { dragLock } from '../ui/dragLock'
import { useToast } from '../ui/toastContext'

interface State {
  projects: Project[]
  tasks: Task[]
  status: 'loading' | 'ok' | 'error'
  error: string | null
  stale: boolean // true when showing the last-known copy because the fetch failed
}

/** Where a moved task should land. subgoal: a label, null to clear it, undefined to keep it when staying in the same goal. */
export interface MoveTarget {
  goalId: string
  subgoal?: string | null
}

/** Where a task lives: its goal (project) and labels (the subgoal is one of them). */
export interface Placement {
  projectId: string
  labels: string[]
}

const KEY = 'cockpit-last-known'

function readCache(): Pick<State, 'projects' | 'tasks'> | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function nextLabel(date: string): string {
  const today = todayStr()
  if (date === addDays(today, 1)) return 'tomorrow'
  const diff = (parseDay(date).getTime() - parseDay(today).getTime()) / 864e5
  return diff > 0 && diff < 7 ? dayName(date) : parseDay(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function rootOf(projects: Project[], id: string): string {
  const byId = new Map(projects.map((p) => [p.id, p]))
  let p = byId.get(id)
  const seen = new Set<string>()
  while (p?.parentId && byId.has(p.parentId) && !seen.has(p.id)) {
    seen.add(p.id)
    p = byId.get(p.parentId)
  }
  return p?.id ?? id
}

/** Short, readable reason from a failed Todoist call. */
const why = (e: unknown) => (e instanceof Error && e.message ? ` (${e.message})` : '')

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function useTasks() {
  const toast = useToast()
  const [state, setState] = useState<State>(() => {
    const c = readCache()
    return { projects: c?.projects ?? [], tasks: c?.tasks ?? [], status: 'loading', error: null, stale: Boolean(c) }
  })
  // Repeating tasks ticked this session, until Todoist reports their next date.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  // Tasks completed this session, so their blocks can stay on the calendar, faded, until you reload.
  const [completed, setCompleted] = useState<Task[]>([])
  const inFlight = useRef(new Set<string>())
  const tasksRef = useRef(state.tasks)
  const projectsRef = useRef(state.projects)
  useEffect(() => {
    tasksRef.current = state.tasks
    projectsRef.current = state.projects
  }, [state.tasks, state.projects])

  const patchTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  }, [])

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const [projects, tasks] = await Promise.all([taskSource.listProjects(), taskSource.listTasks()])
      await dragLock.whenIdle() // never swap the list under a drag in progress
      try {
        localStorage.setItem(KEY, JSON.stringify({ projects, tasks }))
      } catch {
        /* cache is best effort */
      }
      setState({ projects, tasks, status: 'ok', error: null, stale: false })
      setTicked(new Set())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Todoist sync failed.'
      setState((s) => ({ ...s, status: 'error', error: msg, stale: s.projects.length > 0 }))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  /** Completes a task. Resolves to the task when a non-repeating task was completed (so it can be undone), otherwise null. */
  const complete = useCallback(
    async (id: string): Promise<Task | null> => {
      const list = tasksRef.current
      const index = list.findIndex((t) => t.id === id)
      if (index < 0 || inFlight.current.has(id)) return null
      const task = list[index]
      if (!canTick(task, todayStr()) || ticked.has(id)) {
        toast(`Already done for today. Next one is ${task.due ? nextLabel(task.due.date) : 'later'}.`)
        return null
      }
      inFlight.current.add(id)
      if (task.recurring) setTicked((s) => new Set(s).add(id))
      else {
        setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }))
        setCompleted((c) => [...c, task])
      }
      try {
        await taskSource.completeTask(id)
        if (task.recurring) void load() // pick up the next occurrence
        return task.recurring ? null : task
      } catch (e) {
        if (task.recurring) {
          setTicked((s) => {
            const n = new Set(s)
            n.delete(id)
            return n
          })
        } else {
          setCompleted((c) => c.filter((t) => t.id !== id))
          setState((s) => {
            const tasks = [...s.tasks]
            tasks.splice(Math.min(index, tasks.length), 0, task)
            return { ...s, tasks }
          })
        }
        toast(`Could not complete that task${why(e)}. It is back on the list.`)
        return null
      } finally {
        inFlight.current.delete(id)
      }
    },
    [load, ticked, toast],
  )

  const add = useCallback(
    async (input: NewTask) => {
      const text = input.content.trim()
      if (!text) return false
      const tmp: Task = {
        id: `tmp-${Date.now()}`,
        content: text,
        projectId: input.projectId ?? projectsRef.current.find((p) => p.inbox)?.id ?? '',
        labels: input.label ? [input.label] : [],
        recurring: false,
        due: null,
        deadline: input.deadline,
        durationMin: input.durationMin,
        checked: false,
      }
      setState((s) => ({ ...s, tasks: [...s.tasks, tmp] }))
      try {
        const real = await taskSource.createTask({ ...input, content: text })
        setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === tmp.id ? real : t)) }))
        return true
      } catch (e) {
        setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== tmp.id) }))
        toast(`Could not add that task${why(e)}.`)
        return false
      }
    },
    [toast],
  )

  /**
   * Puts a task in a goal (project) with a set of labels: optimistic, then confirmed with Todoist,
   * rolled back on failure. Used by move, drag and undo. Resolves to true when it succeeded.
   */
  const place = useCallback(
    async (id: string, to: Placement): Promise<boolean> => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || id.startsWith('tmp-')) return false
      const projectChanged = to.projectId !== task.projectId
      const labelsChanged = !sameList(to.labels, task.labels)
      if (!projectChanged && !labelsChanged) return false

      const before = { projectId: task.projectId, labels: task.labels }
      patchTask(id, to)
      let moved = false
      try {
        if (projectChanged) {
          await taskSource.moveTask(id, to.projectId)
          moved = true
        }
        if (labelsChanged) await taskSource.setLabels(id, to.labels)
        return true
      } catch (e) {
        if (moved) {
          toast(`Moved, but could not change the subgoal${why(e)}. Showing what Todoist has.`)
          void load()
        } else {
          patchTask(id, before)
          toast(`Could not move that task${why(e)}. It is back where it was.`)
        }
        return false
      }
    },
    [load, patchTask, toast],
  )

  /** Moves a task to a goal or subgoal. Resolves to what changed (so it can be undone), or null. */
  const move = useCallback(
    async (id: string, target: MoveTarget): Promise<{ id: string; before: Placement; after: Placement } | null> => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || id.startsWith('tmp-')) return null
      const projects = projectsRef.current
      const sameGoal = rootOf(projects, task.projectId) === target.goalId
      // Dropping on a goal heading inside the same goal changes nothing.
      if (sameGoal && target.subgoal === undefined) return null

      const subgoal = target.subgoal === undefined ? null : target.subgoal // a different goal starts with no subgoal
      const after: Placement = { projectId: sameGoal ? task.projectId : target.goalId, labels: labelsWithSubgoal(task.labels, subgoal) }
      const before: Placement = { projectId: task.projectId, labels: task.labels }
      return (await place(id, after)) ? { id, before, after } : null
    },
    [place],
  )

  /** Brings back a task that was completed (undo). Never for repeating tasks. */
  const reopen = useCallback(
    async (task: Task): Promise<boolean> => {
      if (task.recurring) return false
      setCompleted((c) => c.filter((t) => t.id !== task.id))
      setState((s) => (s.tasks.some((t) => t.id === task.id) ? s : { ...s, tasks: [...s.tasks, task] }))
      try {
        await taskSource.reopenTask(task.id)
        return true
      } catch (e) {
        setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== task.id) }))
        setCompleted((c) => [...c, task])
        toast(`Could not bring that task back${why(e)}.`)
        return false
      }
    },
    [toast],
  )
  /** Sets or clears a task's real deadline (Todoist's Deadline field, date only). */
  const setDeadline = useCallback(
    async (id: string, date: string | null) => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || id.startsWith('tmp-')) return false
      if (task.recurring) {
        toast('This task repeats in Todoist, so Cockpit will not change its date.')
        return false
      }
      const before = task.deadline
      patchTask(id, { deadline: date })
      try {
        await taskSource.setDeadline(id, date)
        return true
      } catch (e) {
        patchTask(id, { deadline: before })
        toast(`Could not change the deadline${why(e)}. It is back as it was.`)
        return false
      }
    },
    [patchTask, toast],
  )

  /**
   * Mirrors a task's earliest upcoming block into Todoist as its planned time (due date and time,
   * plus length), or clears it when no block is left. Never for repeating tasks.
   */
  const setPlan = useCallback(
    async (id: string, plan: Plan | null) => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || task.recurring || id.startsWith('tmp-')) return true
      const current: Plan | null = task.due?.time ? { date: task.due.date, time: task.due.time, minutes: task.durationMin ?? 0 } : null
      if (samePlan(current, plan)) return true
      const before = { due: task.due, durationMin: task.durationMin }
      patchTask(id, plan ? { due: { date: plan.date, time: plan.time }, durationMin: plan.minutes } : { due: null })
      try {
        await taskSource.setPlan(id, plan)
        return true
      } catch (e) {
        patchTask(id, before)
        toast(`The block was saved, but Todoist's planned time was not updated${why(e)}.`)
        return false
      }
    },
    [patchTask, toast],
  )

  return { ...state, ticked, completed, reload: load, complete, add, move, place, reopen, setDeadline, setPlan }
}
