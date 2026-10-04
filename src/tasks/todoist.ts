import { supabase } from '../lib/supabase'
import type { Due, Project, Task, TaskSource } from './types'

/* Raw shapes from the Todoist API v1 (via our Edge Function). Fields are read
   defensively; confirm against a live response in Phase 0 step "verify". */
interface RawProject {
  id: string
  name: string
  color?: string
  parent_id?: string | null
  inbox_project?: boolean
  is_archived?: boolean
  child_order?: number
}
interface RawTask {
  id: string
  content: string
  project_id: string
  labels?: string[]
  checked?: boolean
  is_completed?: boolean
  due?: { date?: string; is_recurring?: boolean } | null
  duration?: { amount?: number; unit?: string } | null
}

export function parseDue(date: string | undefined): Due | null {
  if (!date) return null
  const [d, t] = date.split('T')
  // A trailing Z or offset means a fixed UTC time; Cockpit shows local time.
  if (t && /(Z|[+-]\d\d:\d\d)$/.test(t)) {
    const local = new Date(date)
    const p = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())}`,
      time: `${p(local.getHours())}:${p(local.getMinutes())}`,
    }
  }
  return { date: d, time: t ? t.slice(0, 5) : null }
}

export function toProject(r: RawProject): Project {
  return {
    id: String(r.id),
    name: r.name,
    color: r.color ?? 'charcoal',
    parentId: r.parent_id ? String(r.parent_id) : null,
    inbox: Boolean(r.inbox_project),
    childOrder: r.child_order ?? 0,
  }
}

export function toTask(r: RawTask): Task {
  const dur = r.duration
  const minutes = dur?.amount ? (dur.unit === 'day' ? dur.amount * 1440 : dur.amount) : null
  return {
    id: String(r.id),
    content: r.content,
    projectId: String(r.project_id),
    labels: r.labels ?? [],
    recurring: Boolean(r.due?.is_recurring),
    due: parseDue(r.due?.date),
    durationMin: minutes,
    checked: Boolean(r.checked ?? r.is_completed),
  }
}

interface Page<T> {
  results?: T[]
  next_cursor?: string | null
  // tolerate alternative key names until verified live
  projects?: T[]
  tasks?: T[]
  cursor?: string | null
}

async function fetchAll<T>(path: 'projects' | 'tasks'): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    const params: Record<string, string | number> = { limit: 200 }
    if (cursor) params.cursor = cursor
    const res: { data: Page<T> | null; error: Error | null } = await supabase.functions.invoke('todoist', {
      body: { path, params },
    })
    if (res.error) throw res.error
    const data = res.data
    out.push(...(data?.results ?? data?.projects ?? data?.tasks ?? []))
    cursor = data?.next_cursor ?? data?.cursor ?? null
    if (!cursor) break
  }
  return out
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res: { data: T | null; error: Error | null } = await supabase.functions.invoke('todoist', { body })
  if (res.error) {
    // Supabase hides the function's reply inside error.context; read it so the user sees the real reason.
    let detail = ''
    const ctx = (res.error as { context?: Response }).context
    if (ctx && typeof ctx.clone === 'function') {
      try {
        const j = (await ctx.clone().json()) as { error?: unknown; message?: unknown }
        detail = String(j.error ?? j.message ?? '')
      } catch {
        try {
          detail = await ctx.clone().text()
        } catch {
          /* no body */
        }
      }
    }
    console.error('Todoist call failed', body.action ?? body.path, detail || res.error.message)
    throw new Error((detail || res.error.message).slice(0, 160))
  }
  return res.data as T
}

export const todoistSource: TaskSource = {
  async createTask(input) {
    const raw = await call<RawTask>({
      action: 'create',
      content: input.content,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.label ? { labels: [input.label] } : {}),
      ...(input.durationMin ? { durationMin: input.durationMin } : {}),
      ...(input.due ? { due: input.due } : {}),
    })
    return toTask(raw)
  },
  async completeTask(id) {
    await call({ action: 'close', id })
  },
  async moveTask(id, projectId) {
    await call({ action: 'move', id, projectId })
  },
  async setLabels(id, labels) {
    await call({ action: 'setLabels', id, labels })
  },
  async setDeadline(id, due) {
    await call({ action: 'setDeadline', id, due })
  },
  async setDuration(id, minutes) {
    await call({ action: 'setDuration', id, minutes })
  },
  async listProjects() {
    const raw = await fetchAll<RawProject>('projects')
    return raw.filter((p) => !p.is_archived).map(toProject)
  },
  async listTasks() {
    const raw = await fetchAll<RawTask>('tasks')
    return raw.map(toTask).filter((t) => !t.checked)
  },
}
