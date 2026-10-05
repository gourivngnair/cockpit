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
  // What the Progress page reads. Defaults are filled in by the test backend.
  labels?: string[]
  date?: string
  completed_at?: string
  late?: boolean
  recurring?: boolean
}

export interface FakeSession {
  task_id: string | null
  minutes: number
  project_id?: string
  started_at?: string
}

export interface FakeVision {
  id: string
  storage_path: string
  caption: string
  theme: string
  created_at: string
  width: number
  height: number
  pinned_on: string | null
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
  /** Clean-diet answers by day, and every write the app made to them. */
  diet: Record<string, boolean>
  dietWrites: Array<{ method: string; body: Record<string, unknown> | null; query: string }>
  failDietWrites: boolean
  /** The vision board rows, and everything the app did to storage and to the table. */
  vision: FakeVision[]
  uploads: Array<{ path: string; body: Buffer }>
  removedPaths: string[]
  visionWrites: Array<{ method: string; body: Record<string, unknown> | null; query: string }>
  signCalls: string[][]
  /** Switches to make things fail. */
  failVisionWrites: boolean
  failVisionReads: boolean
  failSign: boolean
  /** Fail an upload whose path contains this text (for example "-thumb"). */
  failUploadMatch: string | null
  /** Saved focus sessions (the log), and every write the app made to it. */
  sessions: FakeSession[]
  sessionWrites: Array<Record<string, unknown>>
  /** The shared timer row, and every write the app made to it. */
  focusRow: { state: unknown } | null
  focusWrites: Array<Record<string, unknown>>
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
  /** Makes block saves slow, to test what happens while a save is still in flight. */
  blockDelayMs: number
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
  diet?: Record<string, boolean>
  vision?: FakeVision[]
  sessions?: FakeSession[]
  focusState?: unknown
}

/** Signs the page in with a fake session and mocks Supabase REST and the Todoist function. */
export async function openSignedIn(page: Page, opts: Opts = {}): Promise<Backend> {
  const backend: Backend = {
    events: opts.events ?? [],
    tasks: [...(opts.tasks ?? [])],
    blocks: [...(opts.blocks ?? [])],
    done: [...(opts.done ?? [])],
    diet: { ...(opts.diet ?? {}) },
    dietWrites: [],
    failDietWrites: false,
    vision: [...(opts.vision ?? [])],
    uploads: [],
    removedPaths: [],
    visionWrites: [],
    signCalls: [],
    failVisionWrites: false,
    failVisionReads: false,
    failSign: false,
    failUploadMatch: null,
    sessions: [...(opts.sessions ?? [])],
    sessionWrites: [],
    focusRow: opts.focusState ? { state: opts.focusState } : null,
    focusWrites: [],
    closed: [],
    doneDeletes: 0,
    syncDoneCalls: 0,
    notifyCalls: [],
    pushWrites: [],
    failEventWrites: false,
    failTodoistWrites: false,
    failBlockWrites: false,
    blockDelayMs: 0,
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
    const rows = backend.done.map((d) => ({ labels: [], date: '2026-10-05', completed_at: '2026-10-05T07:00:00', late: false, recurring: false, ...d }))
    return json(route, ids ? rows.filter((d) => ids.includes(d.task_id)) : rows)
  })

  await page.route('**/rest/v1/push_subscriptions**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'GET') return json(route, [])
    backend.pushWrites.push({ method: req.method(), body: req.method() === 'DELETE' ? null : (req.postDataJSON() as Record<string, unknown>) })
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, headers: CORS, body: '' })
  })

  await page.route(/\/rest\/v1\/diet/, async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (method === 'GET') return json(route, Object.entries(backend.diet).map(([date, ok]) => ({ date, ok })))
    const query = decodeURIComponent(new URL(req.url()).search)
    const body = method === 'DELETE' ? null : (req.postDataJSON() as Record<string, unknown>)
    backend.dietWrites.push({ method, body, query })
    if (backend.failDietWrites) return json(route, { message: 'boom' }, 500)
    if (method === 'POST' && body) backend.diet[String(body.date)] = Boolean(body.ok)
    if (method === 'DELETE') {
      const date = /[?&]date=eq\.([^&]+)/.exec(query)?.[1]
      if (date) delete backend.diet[date]
    }
    return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: CORS, body: '' })
  })

  // The vision board: rows, private image files and the secure links to them.
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

  await page.route(/\/rest\/v1\/vision/, async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (method === 'GET') return backend.failVisionReads ? json(route, { message: 'offline' }, 500) : json(route, backend.vision)
    const query = decodeURIComponent(new URL(req.url()).search)
    const body = method === 'DELETE' ? null : (req.postDataJSON() as Record<string, unknown>)
    backend.visionWrites.push({ method, body, query })
    if (backend.failVisionWrites) return json(route, { message: 'boom' }, 500)
    const id = /[?&]id=eq\.([^&]+)/.exec(query)?.[1]
    const pinnedOn = /[?&]pinned_on=eq\.([^&]+)/.exec(query)?.[1]
    if (method === 'POST') {
      const b = body as unknown as Partial<FakeVision> & { id: string }
      backend.vision.push({ caption: '', theme: 'Unsorted', width: 0, height: 0, pinned_on: null, created_at: new Date().toISOString(), storage_path: '', ...b })
    } else if (method === 'PATCH') {
      for (const row of backend.vision) if ((id && row.id === id) || (pinnedOn && row.pinned_on === pinnedOn)) Object.assign(row, body)
    } else if (method === 'DELETE' && id) {
      backend.vision = backend.vision.filter((r) => r.id !== id)
    }
    return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: CORS, body: '' })
  })

  // Uploading a file: POST /storage/v1/object/vision/<path>. Removing files: DELETE /storage/v1/object/vision.
  await page.route(/\/storage\/v1\/object\/vision(\/|$)/, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'DELETE') {
      const { prefixes } = req.postDataJSON() as { prefixes: string[] }
      backend.removedPaths.push(...prefixes)
      return json(route, prefixes.map((name) => ({ name })))
    }
    const path = decodeURIComponent(new URL(req.url()).pathname.split('/storage/v1/object/vision/')[1])
    if (backend.failUploadMatch && path.includes(backend.failUploadMatch)) return json(route, { message: 'upload refused', error: 'boom' }, 500)
    backend.uploads.push({ path, body: req.postDataBuffer() ?? Buffer.alloc(0) })
    return json(route, { Key: `vision/${path}`, Id: path })
  })

  // Secure links: POST asks for them, then each link is fetched with GET.
  await page.route(/\/storage\/v1\/object\/sign\/vision(\/|$)/, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'POST') {
      if (backend.failSign) return json(route, { message: 'offline' }, 500)
      const { paths } = req.postDataJSON() as { paths: string[] }
      backend.signCalls.push(paths)
      return json(route, paths.map((path) => ({ error: null, path, signedURL: `/object/sign/vision/${path}?token=t` })))
    }
    if (backend.failSign) return route.abort()
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PIXEL })
  })

  await page.route(/\/rest\/v1\/focus(\?|$)/, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'GET') return json(route, backend.focusRow ? [backend.focusRow] : [])
    const body = req.postDataJSON() as { state: unknown }
    backend.focusWrites.push(body as Record<string, unknown>)
    backend.focusRow = { state: body.state }
    return route.fulfill({ status: 201, headers: CORS, body: '' })
  })

  await page.route(/\/rest\/v1\/focus_sessions/, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'GET') return json(route, backend.sessions.map((s) => ({ project_id: '', started_at: '2026-10-05T09:00:00', ...s })))
    const body = req.postDataJSON() as Record<string, unknown>
    backend.sessionWrites.push(body)
    backend.sessions.push({ task_id: (body.task_id as string | null) ?? null, minutes: Number(body.minutes) })
    return route.fulfill({ status: 201, headers: CORS, body: '' })
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
    if (backend.blockDelayMs) await new Promise((r) => setTimeout(r, backend.blockDelayMs))
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
