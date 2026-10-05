import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, todayStr, ymd } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Project, Task } from '../tasks'
import { useToast } from '../ui/toastContext'
import { TERM, type DoneItem, type FocusItem, type OpenItem } from './stats'

interface DoneRow {
  task_id: string
  content: string
  labels: string[] | null
  project_id: string
  date: string
  completed_at: string
  late: boolean
  recurring: boolean
}

interface SessionRow {
  project_id: string
  minutes: number
  started_at: string
}

// Counting starts at midnight India time on the first day of the term; nothing earlier is read.
const START_ISO = `${TERM.start}T00:00:00+05:30`

/** The name of the goal a project belongs to: its top-level project (Inbox is "Unsorted"). */
function goalNameOf(projectId: string, byId: Map<string, Project>): string | null {
  let p = byId.get(projectId)
  const seen = new Set<string>()
  while (p?.parentId && byId.has(p.parentId) && !seen.has(p.id)) {
    seen.add(p.id)
    p = byId.get(p.parentId)
  }
  if (!p) return null
  return p.inbox ? 'Unsorted' : p.name
}

/**
 * Reads what the Progress page needs: completions and focus rounds since the term began, and the
 * clean-diet answers. Turns each project into the goal it belongs to.
 */
export function useProgressData(projects: Project[], tasks: Task[], refresh: number) {
  const toast = useToast()
  const [doneRows, setDoneRows] = useState<DoneRow[]>([])
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([])
  const [diet, setDiet] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const [d, s, t] = await Promise.all([
      supabase.from('done').select('task_id,content,labels,project_id,date,completed_at,late,recurring').gte('completed_at', START_ISO),
      supabase.from('focus_sessions').select('project_id,minutes,started_at').gte('started_at', START_ISO),
      supabase.from('diet').select('date,ok').gte('date', addDays(todayStr(), -60)),
    ])
    if (d.data) setDoneRows(d.data as DoneRow[])
    if (s.data) setSessionRows(s.data as SessionRow[])
    if (t.data) setDiet(Object.fromEntries((t.data as Array<{ date: string; ok: boolean }>).map((r) => [r.date, r.ok])))
    if (!d.error && !s.error && !t.error) setLoaded(true)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, refresh])

  // Keep clean-diet answers in step between devices, and refresh when the app comes back to the front.
  useEffect(() => {
    const channel = supabase
      .channel('diet-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diet' }, () => void load())
      .subscribe()
    const onVisible = () => !document.hidden && void load()
    document.addEventListener('visibilitychange', onVisible)
    const every = setInterval(() => !document.hidden && void load(), 60_000)
    return () => {
      clearInterval(every)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [load])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const done: DoneItem[] = useMemo(
    () =>
      doneRows.map((r) => ({
        taskId: r.task_id,
        content: r.content,
        labels: r.labels ?? [],
        goal: goalNameOf(r.project_id, byId),
        date: r.date,
        completedDate: ymd(new Date(r.completed_at)),
        late: r.late,
        recurring: r.recurring,
      })),
    [doneRows, byId],
  )

  const focus: FocusItem[] = useMemo(
    () => sessionRows.map((r) => ({ goal: goalNameOf(r.project_id, byId), minutes: r.minutes, date: ymd(new Date(r.started_at)) })),
    [sessionRows, byId],
  )

  const open: OpenItem[] = useMemo(
    () => tasks.map((t) => ({ id: t.id, content: t.content, goal: goalNameOf(t.projectId, byId), recurring: t.recurring, deadline: t.deadline })),
    [tasks, byId],
  )

  /** Answer the clean-diet question for a day (null clears it). Shown at once, rolled back if it cannot be saved. */
  const answerDiet = useCallback(
    async (date: string, value: boolean | null): Promise<boolean> => {
      const before = diet
      const next = { ...diet }
      if (value === null) delete next[date]
      else next[date] = value
      setDiet(next)
      let error: unknown = null
      if (value === null) {
        error = (await supabase.from('diet').delete().eq('date', date)).error
      } else {
        const userId = (await supabase.auth.getSession()).data.session?.user.id
        error = userId ? (await supabase.from('diet').upsert({ user_id: userId, date, ok: value }, { onConflict: 'user_id,date' })).error : new Error('not signed in')
      }
      if (error) {
        setDiet(before)
        toast('Could not save that answer.')
        return false
      }
      return true
    },
    [diet, toast],
  )

  return { done, focus, open, diet, loaded, answerDiet, reload: load }
}
