import { useCallback, useEffect, useRef, useState } from 'react'
import { todayStr, addDays, dayName, parseDay } from '../lib/dates'
import { taskSource, type Project, type Task } from '../tasks'
import { canTick } from '../tasks/rules'
import { useToast } from '../ui/toastContext'

interface State {
  projects: Project[]
  tasks: Task[]
  status: 'loading' | 'ok' | 'error'
  error: string | null
  stale: boolean // true when showing the last-known copy because the fetch failed
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

export function useTasks() {
  const toast = useToast()
  const [state, setState] = useState<State>(() => {
    const c = readCache()
    return { projects: c?.projects ?? [], tasks: c?.tasks ?? [], status: 'loading', error: null, stale: Boolean(c) }
  })
  // Repeating tasks ticked this session, until Todoist reports their next date.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const inFlight = useRef(new Set<string>())
  const tasksRef = useRef(state.tasks)
  useEffect(() => {
    tasksRef.current = state.tasks
  }, [state.tasks])

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const [projects, tasks] = await Promise.all([taskSource.listProjects(), taskSource.listTasks()])
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
      else setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }))
      try {
        await taskSource.completeTask(id)
        if (task.recurring) void load() // pick up the next occurrence
      } catch {
        if (task.recurring) {
          setTicked((s) => {
            const n = new Set(s)
            n.delete(id)
            return n
          })
        } else {
          setState((s) => {
            const tasks = [...s.tasks]
            tasks.splice(Math.min(index, tasks.length), 0, task)
            return { ...s, tasks }
          })
        }
        toast('Could not complete that task. It is back on the list.')
      } finally {
        inFlight.current.delete(id)
      }
    },
    [load, ticked, toast],
  )

  const add = useCallback(
    async (content: string, projectId: string | null) => {
      const text = content.trim()
      if (!text) return false
      const tmp: Task = {
        id: `tmp-${Date.now()}`,
        content: text,
        projectId: projectId ?? state.projects.find((p) => p.inbox)?.id ?? '',
        labels: [],
        recurring: false,
        due: null,
        durationMin: null,
        checked: false,
      }
      setState((s) => ({ ...s, tasks: [...s.tasks, tmp] }))
      try {
        const real = await taskSource.createTask(text, projectId)
        setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === tmp.id ? real : t)) }))
        return true
      } catch {
        setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== tmp.id) }))
        toast('Could not add that task.')
        return false
      }
    },
    [state.projects, toast],
  )

  return { ...state, ticked, reload: load, complete, add }
}
