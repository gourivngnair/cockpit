import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../ui/toastContext'
import type { LogEntry } from './machine'

/** Saves a focus round (whole or partial) in `focus_sessions`. A finished round has a fixed id, so two devices cannot log it twice. */
export function useFocusLog() {
  const toast = useToast()
  const [version, setVersion] = useState(0)

  const log = useCallback(
    async (entry: LogEntry, task: { content: string; projectId: string } | null) => {
      const userId = (await supabase.auth.getSession()).data.session?.user.id
      if (!userId) return
      const { error } = await supabase.from('focus_sessions').upsert(
        {
          user_id: userId,
          id: entry.id,
          task_id: entry.taskId,
          content: task?.content ?? '',
          project_id: task?.projectId ?? '',
          started_at: new Date(entry.startedAt).toISOString(),
          minutes: entry.minutes,
          completed: entry.completed,
        },
        { onConflict: 'user_id,id', ignoreDuplicates: true },
      )
      if (error) toast('Could not save that focus session.')
      else setVersion((n) => n + 1)
    },
    [toast],
  )

  return { log, version }
}

/** Total focused minutes for each task, from the saved sessions. */
export function useFocusTotals(refresh: number): Map<string, number> {
  const [totals, setTotals] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('focus_sessions')
      .select('task_id,minutes')
      .then(({ data }) => {
        if (cancelled || !data) return
        const m = new Map<string, number>()
        for (const r of data as Array<{ task_id: string | null; minutes: number }>) {
          if (r.task_id) m.set(r.task_id, (m.get(r.task_id) ?? 0) + r.minutes)
        }
        setTotals(m)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  return totals
}
