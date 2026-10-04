// Sends push notifications. The database scheduler calls this every minute (x-cron-secret).
//  - 10 minutes before a class
//  - 8:00 digest of today's deadlines and anything overdue
// The app can also call it with { test: true } (signed in) to send a test to your own devices.
// Deploy with: supabase functions deploy notify --no-verify-jwt   (access is checked in the code)
import webpush from 'npm:web-push@3.6.7'
import { localClock } from '../_shared/clock.ts'
import { admin, authorize, cors, json, ownerId, todoistList } from '../_shared/server.ts'
import { DIGEST_FROM_MIN, DIGEST_UNTIL_MIN, dueAlerts, type EventLite, type TaskLite } from './schedule.ts'

const TZ = Deno.env.get('TZ_NAME') ?? 'Asia/Kolkata'

interface Sub {
  endpoint: string
  p256dh: string
  auth: string
}

webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const db = admin()
  const who = await authorize(req, db)
  if (!who) return json({ error: 'Not allowed.' }, 401)
  const body = (await req.json().catch(() => ({}))) as { test?: boolean }
  const userId = who.kind === 'user' ? who.userId : await ownerId(db)
  if (!userId) return json({ error: 'No user.' }, 500)

  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', userId)
  const devices = (subs ?? []) as Sub[]

  /** Sends to every device. Returns how many accepted it; forgets devices that have unsubscribed. */
  async function push(payload: { title: string; body: string; tag: string }): Promise<number> {
    let ok = 0
    for (const s of devices) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...payload, url: '/' }))
        ok++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', s.endpoint)
      }
    }
    return ok
  }

  if (body.test) {
    if (who.kind !== 'user') return json({ error: 'Not allowed.' }, 403)
    if (devices.length === 0) return json({ sent: 0, devices: 0, note: 'No device is subscribed yet.' })
    const sent = await push({ title: 'Cockpit notifications are on', body: 'You will get a heads-up 10 minutes before class and a deadline digest at 8 am.', tag: 'cockpit-test' })
    return json({ sent, devices: devices.length })
  }
  if (who.kind !== 'cron') return json({ error: 'Not allowed.' }, 403)

  const clock = localClock(new Date(), TZ)

  const { data: ev } = await db.from('events').select('id,title,date,start_time,room,kind').eq('user_id', userId).eq('date', clock.date).eq('kind', 'class')
  const events: EventLite[] = (ev ?? []).map((e) => ({ id: e.id, title: e.title, date: e.date, start: String(e.start_time).slice(0, 5), room: e.room ?? '', kind: e.kind }))

  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  const { data: done } = await db.from('notified').select('key').eq('user_id', userId).gte('sent_at', since)
  const sent = new Set((done ?? []).map((r) => r.key as string))

  // Only ask Todoist for tasks when the digest could actually go out.
  let tasks: TaskLite[] = []
  const digestOpen = clock.minutes >= DIGEST_FROM_MIN && clock.minutes < DIGEST_UNTIL_MIN && !sent.has(`digest:${clock.date}`)
  if (digestOpen) {
    const res = await todoistList('tasks', {}, 5)
    if (res.error && res.items.length === 0) return json({ error: res.error, sent: 0 }, 502)
    tasks = res.items.map((t) => ({
      id: String(t.id),
      content: String(t.content ?? ''),
      deadline: typeof (t.deadline as { date?: string } | null)?.date === 'string' ? (t.deadline as { date: string }).date.slice(0, 10) : null,
      recurring: Boolean((t.due as { is_recurring?: boolean } | null)?.is_recurring),
    }))
  }

  const alerts = dueAlerts(clock, events, tasks, sent)
  let delivered = 0
  for (const a of alerts) {
    if ((await push(a)) > 0) {
      delivered++
      await db.from('notified').upsert({ user_id: userId, key: a.key }, { onConflict: 'user_id,key', ignoreDuplicates: true })
    }
  }

  // Housekeeping: forget alerts older than a month.
  if (clock.minutes % 60 === 0) await db.from('notified').delete().eq('user_id', userId).lt('sent_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())

  return json({ at: `${clock.date} ${Math.floor(clock.minutes / 60)}:${String(clock.minutes % 60).padStart(2, '0')}`, due: alerts.length, delivered, devices: devices.length })
})
