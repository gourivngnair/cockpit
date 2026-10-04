// Todoist read proxy. Runs on Supabase Edge Functions (Deno).
// The token comes from the TODOIST_TOKEN secret and never reaches the browser.
// Phase 0 is read-only: only GET requests on allow-listed paths.
import { createClient } from 'npm:@supabase/supabase-js@2'

const BASE = 'https://api.todoist.com/api/v1'
const ALLOWED = new Set(['projects', 'tasks', 'labels'])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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

  let body: { path?: string; params?: Record<string, string | number> }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }
  if (!body.path || !ALLOWED.has(body.path)) return json({ error: 'Path not allowed.' }, 400)

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(body.params ?? {})) qs.set(k, String(v))

  const res = await fetch(`${BASE}/${body.path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
})
