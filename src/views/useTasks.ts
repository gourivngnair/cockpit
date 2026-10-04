import { useCallback, useEffect, useRef, useState } from 'react'
import { todayStr, addDays, dayName, parseDay } from '../lib/dates'
import { taskSource, type Due, type Project, type Task } from '../tasks'
import { canTick, labelsWithSubgoal } from '../tasks/rules'
import type { NewTask } from '../tasks/types'
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

  const complete = useCallback(
    async (id: string) => {
      const list = tasksRef.current
      const index = list.findIndex((t) => t.id === id)
      if (index < 0 || inFlight.current.has(id)) return
      const task = list[index]
      if (!canTick(task, todayStr()) || ticked.has(id)) {
        toast(`Already done for today. Next one is ${task.due ? nextLabel(task.due.date) : 'later'}.`)
        return
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
        due: input.due,
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

  const move = useCallback(
    async (id: string, target: MoveTarget) => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || id.startsWith('tmp-')) return
      const projects = projectsRef.current
      const sameGoal = rootOf(projects, task.projectId) === target.goalId
      // Dropping on a goal heading inside the same goal changes nothing.
      if (sameGoal && target.subgoal === undefined) return

      const projectId = sameGoal ? task.projectId : target.goalId
      const subgoal = target.subgoal === undefined ? null : target.subgoal // a different goal starts with no subgoal
      const labels = labelsWithSubgoal(task.labels, subgoal)
      const projectChanged = projectId !== task.projectId
      const labelsChanged = !sameList(labels, task.labels)
      if (!projectChanged && !labelsChanged) return

      const before = { projectId: task.projectId, labels: task.labels }
      patchTask(id, { projectId, labels })
      let moved = false
      try {
        if (projectChanged) {
          await taskSource.moveTask(id, projectId)
          moved = true
        }
        if (labelsChanged) await taskSource.setLabels(id, labels)
      } catch (e) {
        if (moved) {
          toast(`Moved, but could not change the subgoal${why(e)}. Showing what Todoist has.`)
          void load()
        } else {
          patchTask(id, before)
          toast(`Could not move that task${why(e)}. It is back where it was.`)
        }
      }
    },
    [load, patchTask, toast],
  )

  const setDeadline = useCallback(
    async (id: string, due: Due | null) => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || id.startsWith('tmp-')) return false
      if (task.recurring) {
        toast('This task repeats in Todoist, so Cockpit will not change its date.')
        return false
      }
      const before = task.due
      patchTask(id, { due })
      try {
        await taskSource.setDeadline(id, due)
        return true
      } catch (e) {
        patchTask(id, { due: before })
        toast(`Could not change the deadline${why(e)}. It is back as it was.`)
        return false
      }
    },
    [patchTask, toast],
  )

  /** Sets a task's time needed in Todoist (used when a block is resized). Never for repeating tasks. */
  const setDuration = useCallback(
    async (id: string, minutes: number) => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || task.recurring || id.startsWith('tmp-') || task.durationMin === minutes) return true
      const before = task.durationMin
      patchTask(id, { durationMin: minutes })
      try {
        await taskSource.setDuration(id, minutes)
        return true
      } catch (e) {
        patchTask(id, { durationMin: before })
        toast(`The block was saved, but Todoist's time needed was not updated${why(e)}.`)
        return false
      }
    },
    [patchTask, toast],
  )

  return { ...state, ticked, completed, reload: load, complete, add, move, setDeadline, setDuration }
}
