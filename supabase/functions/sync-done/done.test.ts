import { describe, expect, it } from 'vitest'
import { toDoneRow } from './done.ts'

const TZ = 'Asia/Kolkata'

// Shapes copied from a real Todoist activity log reply (camelCase) and its snake_case form.
const repeating = {
  objectType: 'task',
  objectId: '6hcwJ2cHRGVJJQFW',
  eventType: 'completed',
  eventDate: '2026-10-04T02:09:45.873Z',
  parentProjectId: '6hcwHwVpvPcrfrWW',
  extraData: { content: 'Gym', labels: ['gym'], completedDueDateLocal: '2026-09-29T13:00:00', isRecurring: true, wasOverdue: true },
}

describe('toDoneRow', () => {
  it('counts a repeating task on the occurrence it was completed for, not the day it was ticked', () => {
    const r = toDoneRow(repeating, TZ)!
    expect(r).toMatchObject({
      id: '6hcwJ2cHRGVJJQFW@2026-09-29T13:00:00',
      task_id: '6hcwJ2cHRGVJJQFW',
      content: 'Gym',
      labels: ['gym'],
      project_id: '6hcwHwVpvPcrfrWW',
      date: '2026-09-29',
      late: true,
      recurring: true,
    })
    expect(r.completed_at).toBe('2026-10-04T02:09:45.873Z')
  })

  it('gives each occurrence of a repeating task its own row', () => {
    const a = toDoneRow(repeating, TZ)!
    const b = toDoneRow({ ...repeating, extraData: { ...repeating.extraData, completedDueDateLocal: '2026-10-01T13:00:00' } }, TZ)!
    expect(a.id).not.toBe(b.id)
  })

  it('reads the snake_case form too', () => {
    const r = toDoneRow(
      {
        object_type: 'task',
        object_id: '1',
        event_type: 'completed',
        event_date: '2026-10-04T02:09:45.873Z',
        parent_project_id: 'p',
        extra_data: { content: 'x', completed_due_date_local: '2026-09-29T13:00:00', is_recurring: true, was_overdue: false },
      },
      TZ,
    )!
    expect(r).toMatchObject({ id: '1@2026-09-29T13:00:00', date: '2026-09-29', recurring: true, late: false })
  })

  it('reads a real raw event from the Todoist REST activity log (object_type is "item")', () => {
    const raw = {
      event_date: '2026-10-04T02:09:45.873651Z',
      event_type: 'completed',
      extra_data: {
        completed_due_date_local: '2026-09-29T13:00:00',
        content: 'Gym',
        is_recurring: true,
        labels: ['gym'],
        was_overdue: true,
      },
      id: 2.1652825981600756e36,
      initiator_id: '38317862',
      object_id: '6hcwJ2cHRGVJJQFW',
      object_type: 'item',
      parent_item_id: null,
      parent_project_id: '6hcwHwVpvPcrfrWW',
    }
    expect(toDoneRow(raw, TZ)).toMatchObject({ id: '6hcwJ2cHRGVJJQFW@2026-09-29T13:00:00', task_id: '6hcwJ2cHRGVJJQFW', content: 'Gym', date: '2026-09-29', recurring: true, late: true })
  })

  it('counts a plain task on the local day it was ticked', () => {
    // 20:00 UTC on the 4th is already the 5th in India.
    const r = toDoneRow({ objectType: 'task', objectId: '2', eventType: 'completed', eventDate: '2026-10-04T20:00:00Z', parentProjectId: 'p', extraData: { content: 'Laundry' } }, TZ)!
    expect(r.date).toBe('2026-10-05')
    expect(r.recurring).toBe(false)
    expect(r.labels).toEqual([])
    expect(r.id).toBe('2@2026-10-04T20:00:00Z')
  })

  it('ignores events that are not task completions, or are malformed', () => {
    expect(toDoneRow({ ...repeating, eventType: 'added' }, TZ)).toBeNull()
    expect(toDoneRow({ ...repeating, objectType: 'project' }, TZ)).toBeNull()
    expect(toDoneRow({ ...repeating, eventDate: 'not a date' }, TZ)).toBeNull()
    expect(toDoneRow({}, TZ)).toBeNull()
  })
})
