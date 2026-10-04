import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export interface FakeEvent {
  id: string
  title: string
  date: string
  start_time: string
  end_time: string
  room: string
  kind: 'class' | 'event'
}

export interface FakeTask {
  id: string
  content: string
  project_id: string
  labels?: string[]
  due?: { date: string; is_recurring?: boolean } | null
  deadline?: { date: string } | null
  duration?: { amount: number; unit: string } | null
}

export interface FakeProject {
  id: string
  name: string
  color: string
  parent_id?: string | null
  inbox_project?: boolean
  child_order?: number
}

export const DEFAULT_PROJECTS: FakeProject[] = [
  { id: 'p1', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 },
]

export interface FakeBlock {
  id: string
  task_id: string
  date: string
  start_time: string // HH:MM:SS as Postgres returns it
  minutes: number
}

export interface FakeDone {
  task_id: string
  content: string
  project_id: string
}

export interface BlockWrite {
  method: string
  /** The JSON body Cockpit sent (insert row or update fields). */
  body: Record<string, unknown> | null
  id: string | null
}

export interface Backend {
  events: FakeEvent[]
  tasks: FakeTask[]
  blocks: FakeBlock[]
  done: FakeDone[]
  /** Non-repeating tasks completed through Cockpit, so they can be reopened. */
  closed: FakeTask[]
  /** Deletes on the done table (undoing a completion forgets it). */
  doneDeletes: number
  /** How many times the app asked the server to copy Todoist completions. */
  syncDoneCalls: number
  /** Bodies sent to the notify function (the test button). */
  notifyCalls: Array<Record<string, unknown>>
  /** Inserts and deletes on push_subscriptions. */
  pushWrites: Array<{ method: string; body: Record<string, unknown> | null }>
  failEventWrites: boolean
  failTodoistWrites: boolean
  failBlockWrites: boolean
  eventWrites: number
  /** Every insert, update and delete Cockpit sent for blocks. */
  blockWrites: BlockWrite[]
  /** Every create/close request body the function received. */
  todoistWrites: Array<Record<string, unknown>>
}

interface Opts {
  tasks?: FakeTask[]
  events?: FakeEvent[]
  projects?: FakeProject[]
  blocks?: FakeBlock[]
  done?: FakeDone[]
}

/** Signs the page in with a fake session and mocks Supabase REST and the Todoist function. */
export async function openSignedIn(page: Page, opts: Opts = {}): Promise<Backend> {
  const backend: Backend = {
    events: opts.events ?? [],
    tasks: [...(opts.tasks ?? [])],
    blocks: [...(opts.blocks ?? [])],
    done: [...(opts.done ?? [])],
    closed: [],
    doneDeletes: 0,
    syncDoneCalls: 0,
    notifyCalls: [],
    pushWrites: [],
    failEventWrites: false,
    failTodoistWrites: false,
    failBlockWrites: false,
    eventWrites: 0,
    blockWrites: [],
    todoistWrites: [],
  }
  const projects = (opts.projects ?? DEFAULT_PROJECTS).map((p) => ({ parent_id: null, inbox_project: false, is_archived: false, child_order: 0, ...p }))

  await page.addInitScript(() => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'e2e.fake.token',
        refresh_token: 'fake-refresh',
        expires_in: 3600,
        expires_at: exp,
        token_type: 'bearer',
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'me@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }),
    )
  })

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) })

  await page.route('**/functions/v1/todoist', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const body = req.postDataJSON() as {
      path?: string
      action?: string
      content?: string
      projectId?: string
      labels?: string[]
      durationMin?: number
      deadline?: string | null
      date?: string | null
      plan?: { date: string; time: string; minutes?: number } | null
      id?: string
    }

    if (body.action) {
      backend.todoistWrites.push(body)
      if (backend.failTodoistWrites) return json(route, { error: 'boom' }, 500)
      const t = backend.tasks.find((x) => x.id === body.id)
      switch (body.action) {
        case 'create': {
          const created: FakeTask = {
            id: `new-${backend.tasks.length}`,
            content: body.content ?? '',
            project_id: body.projectId ?? 'inbox',
            labels: body.labels ?? [],
            due: null, // a new task never gets a due date, only a Deadline
            deadline: body.deadline ? { date: body.deadline } : null,
            duration: body.durationMin ? { amount: body.durationMin, unit: 'minute' } : null,
          }
          backend.tasks.push(created)
          return json(route, created)
        }
        case 'close':
          if (t?.due?.is_recurring) {
            // Todoist moves a repeating task to its next occurrence.
            const [d, time] = t.due.date.split('T')
            t.due = { ...t.due, date: addDays(d, 1) + (time ? `T${time}` : '') }
          } else {
            if (t) backend.closed.push(t)
            backend.tasks = backend.tasks.filter((x) => x.id !== body.id)
          }
          return json(route, { ok: true })
        case 'reopen': {
          const back = backend.closed.find((x) => x.id === body.id)
          if (back) {
            backend.closed = backend.closed.filter((x) => x.id !== body.id)
            backend.tasks.push(back)
          }
          return json(route, { ok: true })
        }
        case 'move':
          if (t) t.project_id = body.projectId!
          return json(route, { ok: true })
        case 'setLabels':
          if (t) t.labels = body.labels
          return json(route, { ok: true })
        case 'setDeadline':
        case 'setPlan':
          // Same rule as the real function: a repeating task is never touched.
          if (t?.due?.is_recurring) return json(route, { error: 'This task repeats in Todoist, so Cockpit will not change it.' }, 409)
          if (t && body.action === 'setDeadline') t.deadline = body.date ? { date: body.date } : null
          if (t && body.action === 'setPlan') {
            if (body.plan === null) t.due = null
            else if (body.plan) {
              t.due = { date: `${body.plan.date}T${body.plan.time}:00` }
              if (body.plan.minutes) t.duration = { amount: body.plan.minutes, unit: 'minute' }
            }
          }
          return json(route, { ok: true })
      }
    }
    return json(route, { results: body.path === 'projects' ? projects : backend.tasks })
  })

  await page.route('**/functions/v1/sync-done', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    backend.syncDoneCalls++
    return json(route, { fetched: 0, saved: 0 })
  })

  await page.route('**/functions/v1/notify', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    backend.notifyCalls.push(req.postDataJSON() as Record<string, unknown>)
    return json(route, { sent: 1, devices: 1 })
  })

  await page.route('**/rest/v1/done**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'DELETE') {
      backend.doneDeletes++
      return route.fulfill({ status: 204, headers: CORS, body: '' })
    }
    const m = /task_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(req.url()).replace(/\+/g, ' '))
    const ids = m ? m[1].split(',').map((s) => s.replace(/"/g, '')) : null
    return json(route, ids ? backend.done.filter((d) => ids.includes(d.task_id)) : backend.done)
  })

  await page.route('**/rest/v1/push_subscriptions**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'GET') return json(route, [])
    backend.pushWrites.push({ method: req.method(), body: req.method() === 'DELETE' ? null : (req.postDataJSON() as Record<string, unknown>) })
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, headers: CORS, body: '' })
  })

  await page.route('**/rest/v1/blocks**', async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (method === 'GET') return json(route, backend.blocks)
    const eq = /[?&]id=eq\.([^&]+)/.exec(req.url())
    const id = eq ? decodeURIComponent(eq[1]) : null
    const body = method === 'DELETE' ? null : (req.postDataJSON() as Record<string, unknown>)
    backend.blockWrites.push({ method, body, id })
    if (backend.failBlockWrites) return json(route, { message: 'boom' }, 500)
    if (method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]) as unknown as FakeBlock[]
      rows.forEach((r) => backend.blocks.push({ ...r, start_time: `${(r as unknown as { start_time: string }).start_time}:00` }))
    } else if (method === 'PATCH' && id && body) {
      const b = backend.blocks.find((x) => x.id === id)
      if (b) Object.assign(b, body, { start_time: `${String(body.start_time)}:00` })
    } else if (method === 'DELETE' && id) {
      backend.blocks = backend.blocks.filter((x) => x.id !== id)
    }
    return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: CORS, body: '' })
  })

  await page.route('**/rest/v1/events**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'GET') return json(route, backend.events)
    backend.eventWrites++
    if (backend.failEventWrites) return json(route, { message: 'boom' }, 500)
    if (req.method() === 'POST') {
      const rows = req.postDataJSON() as Omit<FakeEvent, 'id'>[]
      rows.forEach((r, i) => backend.events.push({ ...r, id: `e${backend.events.length}-${i}` }))
      return route.fulfill({ status: 201, headers: CORS, body: '' })
    }
    if (req.method() === 'DELETE') {
      const m = /id=in\.\(([^)]*)\)/.exec(decodeURIComponent(req.url()))
      const eq = /id=eq\.([^&]+)/.exec(req.url())
      const ids = m ? m[1].split(',').map((s) => s.replace(/"/g, '')) : eq ? [eq[1]] : []
      backend.events = backend.events.filter((e) => !ids.includes(e.id))
      return route.fulfill({ status: 204, headers: CORS })
    }
    return route.fulfill({ status: 204, headers: CORS })
  })

  await page.goto('/')
  return backend
}
