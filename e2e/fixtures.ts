import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export interface FakeEvent {
  id: string
  title: string
  date: string
  start_time: string
  end_time: string
  room: string
}

export interface FakeTask {
  id: string
  content: string
  project_id: string
  labels?: string[]
  due?: { date: string; is_recurring?: boolean } | null
  duration?: { amount: number; unit: string } | null
}

export interface Backend {
  events: FakeEvent[]
  failEventWrites: boolean
  eventWrites: number
}

/** Signs the page in with a fake session and mocks Supabase REST and the Todoist function. */
export async function openSignedIn(page: Page, opts: { tasks?: FakeTask[]; events?: FakeEvent[] } = {}): Promise<Backend> {
  const backend: Backend = { events: opts.events ?? [], failEventWrites: false, eventWrites: 0 }
  const projects = [
    { id: 'p1', name: 'Term 2 GPA', color: 'berry_red', parent_id: null, inbox_project: false, is_archived: false, child_order: 1 },
  ]

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
    const path = (req.postDataJSON() as { path: string }).path
    return json(route, { results: path === 'projects' ? projects : (opts.tasks ?? []) })
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
