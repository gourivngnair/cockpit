// Todoist proxy. Runs on Supabase Edge Functions (Deno).
// The token comes from the TODOIST_TOKEN secret and never reaches the browser.
//
// Allowed requests (anything else is refused):
//   { path: 'projects' | 'tasks' | 'labels', params }          GET (read)
//   { action: 'create', content, projectId?, labels?, durationMin?, due? }
//   { action: 'close', id }
//   { action: 'move', id, projectId }                          change goal (project)
//   { action: 'setLabels', id, labels }                        change subgoal (label)
//   { action: 'setDeadline', id, due: {date,time?} | null }    refused for repeating tasks
//   { action: 'setDuration', id, minutes }                     refused for repeating tasks
// A repeating task's date is never written (CLAUDE.md invariant 1): the function looks the
// task up in Todoist and refuses, so this does not rely on the browser behaving.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCreate, dueFields, ID, isRepeating, normalizeReply, validLabels, validMinutes } from './body.ts'

const BASE = 'https://api.todoist.com/api/v1'
const READABLE = new Set(['projects', 'tasks', 'labels'])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function passThrough(res: Response) {
  const reply = normalizeReply(await res.text(), res.ok, res.status)
  return new Response(reply.text, { status: reply.status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

type Body = {
  path?: string
  params?: Record<string, string | number>
  action?: string
  content?: unknown
  projectId?: unknown
  labels?: unknown
  durationMin?: unknown
  due?: unknown
  minutes?: unknown
  id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Only the signed-in owner may use the proxy.
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: user } = await supa.auth.getUser()
  if (!user?.user) return json({ error: 'Not signed in.' }, 401)

  const token = Deno.env.get('TODOIST_TOKEN')
  if (!token) return json({ error: 'TODOIST_TOKEN is not set in Supabase secrets.' }, 500)
  const auth = { Authorization: `Bearer ${token}` }
  const post = (path: string, payload?: unknown) =>
    fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }

  if (body.action) {
    if (body.action === 'create') {
      const built = buildCreate(body)
      if ('error' in built) return json({ error: built.error }, 400)
      return passThrough(await post('tasks', built.payload))
    }

    const id = body.id
    if (!id || !ID.test(id)) return json({ error: 'Bad task id.' }, 400)

    if (body.action === 'close') return passThrough(await post(`tasks/${id}/close`))

    if (body.action === 'move') {
      if (typeof body.projectId !== 'string' || !ID.test(body.projectId)) return json({ error: 'Bad project.' }, 400)
      return passThrough(await post(`tasks/${id}/move`, { project_id: body.projectId }))
    }

    if (body.action === 'setLabels') {
      const labels = validLabels(body.labels)
      if (!labels) return json({ error: 'Bad labels.' }, 400)
      return passThrough(await post(`tasks/${id}`, { labels }))
    }

    if (body.action === 'setDeadline' || body.action === 'setDuration') {
      // Look the task up first: never touch a repeating task.
      const found = await fetch(`${BASE}/tasks/${id}`, { headers: auth })
      if (!found.ok) return json({ error: 'Task not found.' }, found.status)
      if (isRepeating(await found.json())) return json({ error: 'This task repeats in Todoist, so Cockpit will not change it.' }, 409)

      if (body.action === 'setDuration') {
        const m = validMinutes(body.minutes)
        if (!m) return json({ error: 'Bad time needed.' }, 400)
        return passThrough(await post(`tasks/${id}`, { duration: m, duration_unit: 'minute' }))
      }
      if (body.due === null) return passThrough(await post(`tasks/${id}`, { due_string: 'no date' }))
      const f = dueFields(body.due as { date: string; time?: string | null })
      if (!f) return json({ error: 'Bad deadline.' }, 400)
      return passThrough(await post(`tasks/${id}`, f))
    }

    return json({ error: 'Not allowed.' }, 400)
  }

  if (!body.path || !READABLE.has(body.path)) return json({ error: 'Not allowed.' }, 400)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(body.params ?? {})) qs.set(k, String(v))
  return passThrough(await fetch(`${BASE}/${body.path}?${qs}`, { headers: auth }))
})
