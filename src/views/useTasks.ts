import { useCallback, useEffect, useState } from 'react'
import { taskSource, type Project, type Task } from '../tasks'

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

export function useTasks() {
  const [state, setState] = useState<State>(() => {
    const c = readCache()
    return { projects: c?.projects ?? [], tasks: c?.tasks ?? [], status: 'loading', error: null, stale: Boolean(c) }
  })

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Todoist sync failed.'
      setState((s) => ({ ...s, status: 'error', error: msg, stale: s.projects.length > 0 }))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return { ...state, reload: load }
}
