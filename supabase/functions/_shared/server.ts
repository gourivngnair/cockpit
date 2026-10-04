// Shared plumbing for the scheduled functions (notify, sync-done).
// These two are deployed with --no-verify-jwt because the database scheduler calls them with a
// secret instead of a login. They check access themselves, here, and refuse everything else.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Full-access client. Only ever used on the server, after access has been checked. */
export const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

export type Who = { kind: 'cron' } | { kind: 'user'; userId: string }

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** The scheduler (secret header) or the signed-in owner (their login). Anyone else gets null. */
export async function authorize(req: Request, db: SupabaseClient): Promise<Who | null> {
  const secret = Deno.env.get('CRON_SECRET')
  const given = req.headers.get('x-cron-secret')
  if (secret && given && sameSecret(secret, given)) return { kind: 'cron' }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  return error || !data.user ? null : { kind: 'user', userId: data.user.id }
}

/** Cockpit has one user. The scheduler acts for them. */
export async function ownerId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1 })
  return data?.users[0]?.id ?? null
}

const BASE = 'https://api.todoist.com/api/v1'

/** GET a Todoist list, following the cursor. */
export async function todoistList(path: string, params: Record<string, string>, pages = 10): Promise<{ items: Record<string, unknown>[]; error?: string }> {
  const token = Deno.env.get('TODOIST_TOKEN')
  if (!token) return { items: [], error: 'TODOIST_TOKEN is not set.' }
  const items: Record<string, unknown>[] = []
  let cursor: string | null = null
  for (let i = 0; i < pages; i++) {
    const qs = new URLSearchParams({ ...params, limit: '100', ...(cursor ? { cursor } : {}) })
    const res = await fetch(`${BASE}/${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { items, error: `Todoist ${res.status}: ${(await res.text()).slice(0, 200)}` }
    const body = (await res.json()) as Record<string, unknown>
    const page = (body.results ?? body.events ?? body.items ?? body.tasks ?? []) as Record<string, unknown>[]
    items.push(...page)
    cursor = (body.next_cursor ?? body.nextCursor ?? null) as string | null
    if (!cursor) break
  }
  return { items }
}
