import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Task } from '../tasks'

/**
 * Looks up finished tasks in Cockpit's saved completion history (table `done`), so a block whose
 * task was completed stays on the calendar, faded, after a reload. Only the ids asked for are fetched.
 */
export function useDoneTasks(taskIds: string[], refresh: number): Task[] {
  const [done, setDone] = useState<Task[]>([])
  const key = [...taskIds].sort().join(',')

  useEffect(() => {
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone([])
      return
    }
    let cancelled = false
    void supabase
      .from('done')
      .select('task_id,content,project_id')
      .in('task_id', key.split(','))
      .then(({ data }) => {
        if (cancelled || !data) return
        const seen = new Set<string>()
        const tasks: Task[] = []
        for (const r of data as Array<{ task_id: string; content: string; project_id: string }>) {
          if (seen.has(r.task_id)) continue
          seen.add(r.task_id)
          tasks.push({ id: r.task_id, content: r.content, projectId: r.project_id, labels: [], recurring: false, due: null, deadline: null, durationMin: null, checked: true })
        }
        setDone(tasks)
      })
    return () => {
      cancelled = true
    }
  }, [key, refresh])

  return done
}

/** Asks the server to copy new Todoist completions (including repeating ones) into `done`. */
export async function syncDone(): Promise<boolean> {
  const { error } = await supabase.functions.invoke('sync-done')
  return !error
}

/** Removes a task's saved completion (used when a completion is undone), so it does not count in progress. */
export async function forgetCompletion(taskId: string): Promise<void> {
  await supabase.from('done').delete().eq('task_id', taskId).eq('recurring', false)
}
