import { describe, expect, it } from 'vitest'
import { normalizeReply } from './body.ts'

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
