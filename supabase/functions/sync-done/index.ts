// Copies Todoist task completions into Cockpit's own `done` table (PRD lesson 5).
// Todoist's completed-tasks endpoint omits repeating tasks, so this reads the activity log, whose
// "completed" events carry the due date of the occurrence that was ticked. Run by the app when it
// opens and after a tick, and hourly by the database scheduler.
// Deploy with: supabase functions deploy sync-done --no-verify-jwt   (access is checked in the code)
import { admin, authorize, cors, json, ownerId, todoistList } from '../_shared/server.ts'
import { toDoneRow, type DoneRow } from './done.ts'

const TZ = Deno.env.get('TZ_NAME') ?? 'Asia/Kolkata'
// Progress counts from the first day of Term 2 (decided 2026-10-05). Nothing earlier is ever read, so
// the old test activity cannot come back, whatever the saved position is.
const HISTORY_START = new Date('2026-10-05T00:00:00+05:30')
// Tasks that were only ever tests (made and deleted by me while checking how Todoist behaves). Todoist keeps
// their completions in its log, so they are skipped here.
const IGNORED_TASKS = new Set(['6hgx32PxJ834RXM9', '6hgx37M2Fh4Pmqp9'])
const OVERLAP_MS = 2 * 24 * 3600 * 1000 // re-read a little history each time; duplicates are ignored

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const db = admin()
  const who = await authorize(req, db)
  if (!who) return json({ error: 'Not allowed.' }, 401)
  const userId = who.kind === 'user' ? who.userId : await ownerId(db)
  if (!userId) return json({ error: 'No user.' }, 500)

  const { data: last } = await db.from('done').select('completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1)
  const resume = last?.[0]?.completed_at ? new Date(new Date(last[0].completed_at).getTime() - OVERLAP_MS) : HISTORY_START
  const since = resume > HISTORY_START ? resume : HISTORY_START
  const until = new Date(Date.now() + 60_000)
  const range = { date_from: since.toISOString(), date_to: until.toISOString() }

  // Todoist's filter parameter has changed names and formats over time. Try the known forms in
  // order and use the first that works; if none do, report what each one said.
  const attempts: Array<Record<string, string>> = [
    { object_event_types: '["task:completed"]' },
    { 'object_event_types[]': 'task:completed' },
    { object_type: 'task', event_type: 'completed' },
  ]
  let result: { items: Record<string, unknown>[]; error?: string } = { items: [], error: 'no attempt made' }
  const failures: string[] = []
  for (const filter of attempts) {
    const r = await todoistList('activities', { ...filter, ...range })
    if (!r.error) {
      result = r
      break
    }
    failures.push(`${Object.keys(filter).join('+')}: ${r.error}`)
  }
  if (result.error) return json({ error: 'Todoist rejected every activity filter.', failures }, 502)

  const rows = new Map<string, DoneRow>()
  for (const ev of result.items) {
    const row = toDoneRow(ev, TZ)
    if (row && !IGNORED_TASKS.has(row.task_id)) rows.set(row.id, row)
  }

  if (rows.size === 0 && result.items.length > 0) {
    // Nothing matched the expected shape: show one raw event so the mapping can be corrected.
    return json({ error: 'Events did not match the expected shape.', sample: JSON.stringify(result.items[0]).slice(0, 900) }, 502)
  }

  const all = [...rows.values()].map((r) => ({ user_id: userId, ...r }))
  for (let i = 0; i < all.length; i += 200) {
    const { error } = await db.from('done').upsert(all.slice(i, i + 200), { onConflict: 'user_id,id', ignoreDuplicates: true })
    if (error) return json({ error: error.message }, 500)
  }
  return json({ fetched: result.items.length, saved: all.length, since: since.toISOString() })
})
