import { describe, expect, it } from 'vitest'
import { buildCreate, isRepeating, normalizeReply, planFields, validDate, validLabels, validMinutes } from './body.ts'

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

describe('validDate', () => {
  it('accepts real calendar dates only', () => {
    expect(validDate('2026-10-09')).toBe('2026-10-09')
    expect(validDate('9 Oct')).toBeNull()
    expect(validDate('2026-13-45')).toBeNull()
    expect(validDate(20261009)).toBeNull()
  })
})

describe('planFields (the planned work time)', () => {
  it('builds a floating local due_datetime with the block length', () => {
    expect(planFields({ date: '2026-10-09', time: '09:30', minutes: 45 })).toEqual({
      due_datetime: '2026-10-09T09:30:00',
      duration: 45,
      duration_unit: 'minute',
    })
  })
  it('works without a length', () => {
    expect(planFields({ date: '2026-10-09', time: '09:30' })).toEqual({ due_datetime: '2026-10-09T09:30:00' })
  })
  it('rejects bad dates, times and lengths', () => {
    expect(planFields({ date: 'nope', time: '09:30' })).toBeNull()
    expect(planFields({ date: '2026-10-09', time: '9am' })).toBeNull()
    expect(planFields({ date: '2026-10-09', time: '09:30', minutes: 0 })).toBeNull()
    expect(planFields({ date: '2026-10-09', time: '09:30', minutes: 2.5 })).toBeNull()
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
  it('builds a full task, with the deadline in the Deadline field and no due date', () => {
    const r = buildCreate({ content: ' Essay ', projectId: 'p1', labels: ['assignments'], durationMin: 90, deadline: '2026-10-09' })
    expect(r).toEqual({
      payload: { content: 'Essay', project_id: 'p1', labels: ['assignments'], duration: 90, duration_unit: 'minute', deadline_date: '2026-10-09' },
    })
    expect('payload' in r && 'due_date' in r.payload).toBe(false)
    expect('payload' in r && 'due_datetime' in r.payload).toBe(false)
  })
  it('builds a minimal task', () => {
    expect(buildCreate({ content: 'x' })).toEqual({ payload: { content: 'x' } })
  })
  it('ignores unknown fields such as a repeat string or a due date', () => {
    const r = buildCreate({ content: 'x', due_string: 'every day', due: { date: '2026-10-09' }, priority: 4 } as never)
    expect(r).toEqual({ payload: { content: 'x' } })
  })
  it('rejects bad input', () => {
    expect(buildCreate({ content: '   ' })).toHaveProperty('error')
    expect(buildCreate({ content: 'x', projectId: '../x' })).toHaveProperty('error')
    expect(buildCreate({ content: 'x', deadline: 'nope' })).toHaveProperty('error')
    expect(buildCreate({ content: 'x', durationMin: -3 })).toHaveProperty('error')
  })
})

describe('isRepeating (server-side guard for date writes)', () => {
  it('is true only when Todoist says the due date recurs', () => {
    expect(isRepeating({ due: { is_recurring: true } })).toBe(true)
    expect(isRepeating({ due: { is_recurring: false } })).toBe(false)
    expect(isRepeating({ due: null })).toBe(false)
    expect(isRepeating(null)).toBe(false)
  })
})
