// Todoist proxy. Runs on Supabase Edge Functions (Deno).
// The token comes from the TODOIST_TOKEN secret and never reaches the browser.
//
// Allowed requests (anything else is refused):
//   { path: 'projects' | 'tasks' | 'labels', params }  -> GET (read)
//   { action: 'create', content, projectId? }          -> POST /tasks with only content and project_id
//   { action: 'close', id }                            -> POST /tasks/{id}/close
// There is deliberately no way to send a due date, so Cockpit can never change one (invariant 1).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalizeReply } from './body.ts'

const BASE = 'https://api.todoist.com/api/v1'
const READABLE = new Set(['projects', 'tasks', 'labels'])
const ID = /^[A-Za-z0-9_-]{1,64}$/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function passThrough(res: Response) {
  const reply = normalizeReply(await res.text(), res.ok, res.status)
  return new Response(reply.text, {
    status: reply.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
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

  let body: {
    path?: string
    params?: Record<string, string | number>
    action?: string
    content?: string
    projectId?: string
    id?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }

  if (body.action === 'create') {
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content || content.length > 500) return json({ error: 'Bad task text.' }, 400)
    const payload: { content: string; project_id?: string } = { content }
    if (body.projectId !== undefined) {
      if (!ID.test(body.projectId)) return json({ error: 'Bad project.' }, 400)
      payload.project_id = body.projectId
    }
    const res = await fetch(`${BASE}/tasks`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return passThrough(res)
  }

  if (body.action === 'close') {
    if (!body.id || !ID.test(body.id)) return json({ error: 'Bad task id.' }, 400)
    const res = await fetch(`${BASE}/tasks/${body.id}/close`, { method: 'POST', headers: auth })
    return passThrough(res)
  }

  if (!body.path || !READABLE.has(body.path)) return json({ error: 'Not allowed.' }, 400)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(body.params ?? {})) qs.set(k, String(v))
  const res = await fetch(`${BASE}/${body.path}?${qs}`, { headers: auth })
  return passThrough(res)
})
