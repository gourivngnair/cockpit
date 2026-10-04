import { localClock } from '../_shared/clock.ts'

/** One row of Cockpit's own copy of Todoist completions (table `done`). */
export interface DoneRow {
  id: string // "<task id>@<occurrence>", so each occurrence of a repeating task is one row
  task_id: string
  content: string
  labels: string[]
  project_id: string
  date: string // the day the work counts for (the occurrence's due date), YYYY-MM-DD
  completed_at: string // when it was ticked, ISO
  late: boolean
  recurring: boolean
}

type Raw = Record<string, unknown>
const pick = (o: Raw | undefined, ...keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

/**
 * Turns one Todoist "task completed" activity event into a `done` row. Reads both snake_case
 * and camelCase names, since the activity log is the only place repeating-task completions
 * appear (the completed-tasks endpoint omits them: PRD lesson 5).
 */
export function toDoneRow(ev: Raw, timeZone: string): DoneRow | null {
  const objectId = pick(ev, 'object_id', 'objectId')
  const eventDate = pick(ev, 'event_date', 'eventDate')
  if (objectId === undefined || typeof eventDate !== 'string') return null
  // The raw activity log calls a task an "item"; the SDKs call it a "task".
  const objectType = pick(ev, 'object_type', 'objectType')
  if ((objectType !== 'task' && objectType !== 'item') || pick(ev, 'event_type', 'eventType') !== 'completed') return null

  const x = (pick(ev, 'extra_data', 'extraData') as Raw | undefined) ?? {}
  const due = pick(x, 'completed_due_date_local', 'completedDueDateLocal')
  const completedAt = new Date(eventDate)
  if (Number.isNaN(completedAt.getTime())) return null

  // The occurrence a repeating task was completed for; a plain task counts on the day it was ticked.
  const occurrence = typeof due === 'string' && due ? due : eventDate
  const date = typeof due === 'string' && due ? due.slice(0, 10) : localClock(completedAt, timeZone).date
  const labels = pick(x, 'labels')

  return {
    id: `${String(objectId)}@${occurrence}`.replace(/[^\w.~:@+-]/g, '_'),
    task_id: String(objectId),
    content: String(pick(x, 'content') ?? ''),
    labels: Array.isArray(labels) ? labels.map(String) : [],
    project_id: String(pick(ev, 'parent_project_id', 'parentProjectId') ?? ''),
    date,
    completed_at: completedAt.toISOString(),
    late: Boolean(pick(x, 'was_overdue', 'wasOverdue')),
    recurring: Boolean(pick(x, 'is_recurring', 'isRecurring')),
  }
}
