/**
 * Pure helpers for the Todoist proxy (no Deno or network here, so they are unit-tested).
 *
 * Model (CLAUDE.md, decided 2026-10-04): a task's Todoist *Deadline* field (date only) is its
 * real deadline. Its *due* date and time is the planned work time, mirrored from Cockpit's
 * earliest upcoming block. A repeating task's due date is never written.
 */

/**
 * Todoist answers some writes (like closing a task) with an empty body. Browser clients
 * parse JSON replies, so an empty one looks like a failure. Always return valid JSON.
 */
export function normalizeReply(text: string, ok: boolean, status: number): { text: string; status: number } {
  if (!text.trim()) return { text: JSON.stringify({ ok }), status: ok ? 200 : status }
  return { text, status }
}

export const ID = /^[A-Za-z0-9_-]{1,64}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const LABEL = /^[^\s,]{1,60}$/

export function validDate(v: unknown): string | null {
  return typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null
}

export interface PlanInput {
  date: string // YYYY-MM-DD
  time: string // HH:MM, local
  minutes?: number
}

/** Body fields for a planned time: a floating local due_datetime plus the block length. */
export function planFields(p: PlanInput): Record<string, unknown> | null {
  const date = validDate(p?.date)
  if (!date || typeof p.time !== 'string' || !TIME.test(p.time)) return null
  const out: Record<string, unknown> = { due_datetime: `${date}T${p.time}:00` }
  if (p.minutes !== undefined) {
    const m = validMinutes(p.minutes)
    if (!m) return null
    out.duration = m
    out.duration_unit = 'minute'
  }
  return out
}

export function validLabels(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 10) return null
  if (!v.every((l) => typeof l === 'string' && LABEL.test(l))) return null
  return v as string[]
}

export function validMinutes(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1439 ? v : null
}

export interface CreateInput {
  content?: unknown
  projectId?: unknown
  labels?: unknown
  durationMin?: unknown
  deadline?: unknown
}

/**
 * Builds the POST /tasks body, or an error message. Only whitelisted fields are ever sent.
 * A new task never gets a due date here: its deadline goes in the Deadline field.
 */
export function buildCreate(i: CreateInput): { payload: Record<string, unknown> } | { error: string } {
  const content = typeof i.content === 'string' ? i.content.trim() : ''
  if (!content || content.length > 500) return { error: 'Bad task text.' }
  const payload: Record<string, unknown> = { content }
  if (i.projectId !== undefined && i.projectId !== null) {
    if (typeof i.projectId !== 'string' || !ID.test(i.projectId)) return { error: 'Bad project.' }
    payload.project_id = i.projectId
  }
  if (i.labels !== undefined) {
    const labels = validLabels(i.labels)
    if (!labels) return { error: 'Bad labels.' }
    payload.labels = labels
  }
  if (i.durationMin !== undefined && i.durationMin !== null) {
    const m = validMinutes(i.durationMin)
    if (!m) return { error: 'Bad time needed.' }
    payload.duration = m
    payload.duration_unit = 'minute'
  }
  if (i.deadline !== undefined && i.deadline !== null) {
    const d = validDate(i.deadline)
    if (!d) return { error: 'Bad deadline.' }
    payload.deadline_date = d
  }
  return { payload }
}

/** True when Todoist reports the task as repeating, so date writes must be refused. */
export function isRepeating(task: unknown): boolean {
  const due = (task as { due?: { is_recurring?: boolean } | null } | null)?.due
  return Boolean(due?.is_recurring)
}
