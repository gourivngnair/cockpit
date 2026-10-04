import { describe, expect, it } from 'vitest'
import { buildCreate, dueFields, isRepeating, normalizeReply, validLabels, validMinutes } from './body.ts'

describe('normalizeReply (completing a task must not look like a failure)', () => {
  it('turns an empty successful reply into valid JSON with status 200', () => {
    const r = normalizeReply('', true, 204)
    expect(r.status).toBe(200)
    expect(JSON.parse(r.text)).toEqual({ ok: true })
  })
  it('treats a whitespace-only reply as empty', () => {
    expect(JSON.parse(normalizeReply('  \n', true, 200).text)).toEqual({ ok: true })
  })
  it('keeps the error status for an empty failed reply', () => {
    const r = normalizeReply('', false, 404)
    expect(r.status).toBe(404)
    expect(JSON.parse(r.text)).toEqual({ ok: false })
  })
  it('passes a real body and status through untouched', () => {
    expect(normalizeReply('{"id":"1"}', true, 200)).toEqual({ text: '{"id":"1"}', status: 200 })
    expect(normalizeReply('{"error":"x"}', false, 400)).toEqual({ text: '{"error":"x"}', status: 400 })
  })
})

describe('dueFields', () => {
  it('uses due_date for all-day and a floating due_datetime when a time is given', () => {
    expect(dueFields({ date: '2026-10-09' })).toEqual({ due_date: '2026-10-09' })
    expect(dueFields({ date: '2026-10-09', time: '17:00' })).toEqual({ due_datetime: '2026-10-09T17:00:00' })
  })
  it('rejects bad dates and times', () => {
    expect(dueFields({ date: '9 Oct' })).toBeNull()
    expect(dueFields({ date: '2026-13-45' })).toBeNull()
    expect(dueFields({ date: '2026-10-09', time: '5pm' })).toBeNull()
  })
})

describe('validators', () => {
  it('accepts sane labels and rejects odd ones', () => {
    expect(validLabels(['gym', 'morning-routine'])).toEqual(['gym', 'morning-routine'])
    expect(validLabels(['has space'])).toBeNull()
    expect(validLabels('gym')).toBeNull()
  })
  it('accepts whole minutes in a day', () => {
    expect(validMinutes(45)).toBe(45)
    expect(validMinutes(0)).toBeNull()
    expect(validMinutes(1.5)).toBeNull()
    expect(validMinutes(5000)).toBeNull()
  })
})

describe('buildCreate (whitelist: only known fields reach Todoist)', () => {
  it('builds a full task', () => {
    const r = buildCreate({ content: ' Essay ', projectId: 'p1', labels: ['assignments'], durationMin: 90, due: { date: '2026-10-09', time: '17:00' } })
    expect(r).toEqual({
      payload: { content: 'Essay', project_id: 'p1', labels: ['assignments'], duration: 90, duration_unit: 'minute', due_datetime: '2026-10-09T17:00:00' },
    })
  })
  it('builds a minimal task with no due date', () => {
    expect(buildCreate({ content: 'x' })).toEqual({ payload: { content: 'x' } })
  })
  it('ignores unknown fields such as a repeat string', () => {
    const r = buildCreate({ content: 'x', due_string: 'every day', priority: 4 } as never)
    expect(r).toEqual({ payload: { content: 'x' } })
  })
  it('rejects bad input', () => {
    expect(buildCreate({ content: '   ' })).toHaveProperty('error')
    expect(buildCreate({ content: 'x', projectId: '../x' })).toHaveProperty('error')
    expect(buildCreate({ content: 'x', due: { date: 'nope' } })).toHaveProperty('error')
    expect(buildCreate({ content: 'x', durationMin: -3 })).toHaveProperty('error')
  })
})

describe('isRepeating (server-side guard for deadline edits)', () => {
  it('is true only when Todoist says the due date recurs', () => {
    expect(isRepeating({ due: { is_recurring: true } })).toBe(true)
    expect(isRepeating({ due: { is_recurring: false } })).toBe(false)
    expect(isRepeating({ due: null })).toBe(false)
    expect(isRepeating(null)).toBe(false)
  })
})
