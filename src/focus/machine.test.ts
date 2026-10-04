import { describe, expect, it } from 'vitest'
import { PRESETS, dayOf, focusedMinutes, initialState, phaseSeconds, reduce, remaining, type Action, type FocusState } from './machine'

const T0 = new Date('2026-10-05T09:00:00').getTime()
const MIN = 60_000
const run = (s: FocusState, a: Action, now: number) => reduce(s, a, now)
const started = (preset = 0, now = T0) => {
  let s = initialState(now)
  s = run(s, { type: 'preset', index: preset }, now).state
  s = run(s, { type: 'open', taskId: 'task-1' }, now).state
  return run(s, { type: 'start', by: 'laptop' }, now).state
}

describe('starting', () => {
  it('starts a fresh focus round counting to the end time', () => {
    const s = started()
    expect(s).toMatchObject({ running: true, paused: false, phase: 'focus', round: 1, by: 'laptop', taskId: 'task-1', startedAt: T0, endsAt: T0 + 25 * MIN })
    expect(remaining(s, T0)).toBe(25 * 60)
    expect(remaining(s, T0 + 10 * MIN)).toBe(15 * 60)
  })
  it('uses the chosen preset', () => {
    expect(started(1).endsAt).toBe(T0 + 50 * MIN)
    expect(started(2).endsAt).toBe(T0 + 15 * MIN)
  })
  it('the preset can only change before a session starts', () => {
    const s = started()
    expect(run(s, { type: 'preset', index: 1 }, T0).state).toBe(s)
  })
  it('every change raises seq, and a no-op does not', () => {
    const idle = initialState(T0)
    const a = run(idle, { type: 'open', taskId: 'x' }, T0).state
    expect(a.seq).toBe(idle.seq + 1)
    expect(run(a, { type: 'open', taskId: 'x' }, T0).state).toBe(a)
    expect(run(idle, { type: 'tick' }, T0).state).toBe(idle)
  })
})

describe('pause and resume', () => {
  it('keeps exactly the time that was left', () => {
    let s = started()
    s = run(s, { type: 'pause' }, T0 + 10 * MIN).state
    expect(s).toMatchObject({ paused: true, endsAt: null, left: 15 * 60 })
    // An hour goes by while paused.
    expect(remaining(s, T0 + 70 * MIN)).toBe(15 * 60)
    s = run(s, { type: 'start', by: 'tablet' }, T0 + 70 * MIN).state
    expect(s).toMatchObject({ paused: false, endsAt: T0 + 85 * MIN, by: 'tablet' })
  })
  it('resuming a half-done round keeps its original start for the log', () => {
    let s = started()
    s = run(s, { type: 'pause' }, T0 + 10 * MIN).state
    s = run(s, { type: 'start', by: 'laptop' }, T0 + 20 * MIN).state
    expect(s.startedAt).toBe(T0)
  })
  it('pressing Start while already counting does nothing', () => {
    const s = started()
    expect(run(s, { type: 'start', by: 'tablet' }, T0 + MIN).state).toBe(s)
  })
})

describe('a round finishing', () => {
  it('logs the finished round, counts it and starts the short break on its own', () => {
    const s = started()
    const r = run(s, { type: 'tick' }, T0 + 25 * MIN)
    expect(r.log).toEqual({ id: `focus-${T0 + 25 * MIN}`, taskId: 'task-1', startedAt: T0, minutes: 25, completed: true })
    expect(r.state).toMatchObject({ phase: 'short', round: 1, count: 1, paused: false, endsAt: T0 + 30 * MIN, startedAt: null })
  })
  it('does nothing before the end time', () => {
    const s = started()
    const r = run(s, { type: 'tick' }, T0 + 25 * MIN - 1)
    expect(r.state).toBe(s)
    expect(r.log).toBeNull()
  })
  it('two devices ending the same round log it under the same id', () => {
    const s = started()
    const a = run(s, { type: 'tick' }, T0 + 25 * MIN + 100)
    const b = run(s, { type: 'tick' }, T0 + 25 * MIN + 900)
    expect(a.log!.id).toBe(b.log!.id)
    expect(a.state.seq).toBe(b.state.seq) // so neither overrides the other
  })
  it('after a break, the next focus round waits for Start', () => {
    let s = started()
    s = run(s, { type: 'tick' }, T0 + 25 * MIN).state
    const r = run(s, { type: 'tick' }, T0 + 30 * MIN)
    expect(r.log).toBeNull()
    expect(r.state).toMatchObject({ phase: 'focus', round: 2, running: true, paused: true, endsAt: null, left: 25 * 60 })
  })
  it('a device that slept through the end moves on one step from now, never replaying the past', () => {
    const s = started()
    const r = run(s, { type: 'tick' }, T0 + 3 * 60 * MIN)
    expect(r.state.phase).toBe('short')
    expect(r.state.endsAt).toBe(T0 + 3 * 60 * MIN + 5 * MIN)
    expect(r.state.count).toBe(1)
  })
})

describe('four rounds and a long break', () => {
  it('breaks are short after rounds 1 to 3 and long after round 4, then it starts over', () => {
    let s = started(0)
    let t = T0
    const phases: string[] = []
    for (let i = 0; i < 4; i++) {
      t += 25 * MIN
      s = run(s, { type: 'tick' }, t).state // focus ends, break begins
      phases.push(s.phase)
      t += phaseSeconds(0, s.phase) * 1000
      s = run(s, { type: 'tick' }, t).state // break ends, next round waits
      s = run(s, { type: 'start', by: 'laptop' }, t).state
    }
    expect(phases).toEqual(['short', 'short', 'short', 'long'])
    expect(s.round).toBe(1) // back to round 1
    expect(s.count).toBe(4)
    expect(PRESETS[0][2] * 60).toBe(15 * 60)
  })
  it('the long break length follows the preset (15, 20 and 10 minutes)', () => {
    expect([phaseSeconds(0, 'long'), phaseSeconds(1, 'long'), phaseSeconds(2, 'long')]).toEqual([15 * 60, 20 * 60, 10 * 60])
  })
})

describe('skip and end', () => {
  it('skipping to the break logs the partial round (not as completed) and starts the break', () => {
    const s = started()
    const r = run(s, { type: 'skip' }, T0 + 10 * MIN + 30_000)
    expect(r.log).toMatchObject({ taskId: 'task-1', minutes: 10, completed: false, startedAt: T0 })
    expect(r.state).toMatchObject({ phase: 'short', paused: false, count: 0 })
  })
  it('less than a minute of focus is not logged', () => {
    const s = started()
    expect(run(s, { type: 'skip' }, T0 + 59_000).log).toBeNull()
    expect(run(s, { type: 'end' }, T0 + 59_000).log).toBeNull()
  })
  it('time spent paused is not counted as focus', () => {
    let s = started()
    s = run(s, { type: 'pause' }, T0 + 10 * MIN).state
    expect(focusedMinutes(s, T0 + 50 * MIN)).toBe(10)
    expect(run(s, { type: 'end' }, T0 + 50 * MIN).log).toMatchObject({ minutes: 10, completed: false })
  })
  it('skipping a break goes to the next round, waiting for Start', () => {
    let s = started()
    s = run(s, { type: 'tick' }, T0 + 25 * MIN).state
    const r = run(s, { type: 'skip' }, T0 + 26 * MIN)
    expect(r.state).toMatchObject({ phase: 'focus', round: 2, paused: true })
  })
  it('ending resets the session but keeps the task, preset and count', () => {
    let s = started(1)
    s = run(s, { type: 'tick' }, T0 + 50 * MIN).state
    const r = run(s, { type: 'end' }, T0 + 52 * MIN)
    expect(r.state).toMatchObject({ running: false, paused: true, phase: 'focus', round: 1, left: 50 * 60, endsAt: null, taskId: 'task-1', preset: 1, count: 1, by: null })
  })
  it('skip and end do nothing when nothing is running', () => {
    const idle = initialState(T0)
    expect(run(idle, { type: 'skip' }, T0).state).toBe(idle)
    expect(run(idle, { type: 'end' }, T0).state).toBe(idle)
  })
})

describe('choosing a task', () => {
  it('cannot be changed in the middle of a round', () => {
    const s = started()
    expect(run(s, { type: 'open', taskId: 'other' }, T0 + MIN).state.taskId).toBe('task-1')
  })
  it('can always be cleared, and the timer carries on', () => {
    const s = started()
    const r = run(s, { type: 'open', taskId: null }, T0 + MIN).state
    expect(r).toMatchObject({ taskId: null, running: true, paused: false, endsAt: s.endsAt })
  })
  it('can be changed while the next round is waiting to start', () => {
    let s = started()
    s = run(s, { type: 'tick' }, T0 + 25 * MIN).state
    s = run(s, { type: 'tick' }, T0 + 30 * MIN).state
    expect(run(s, { type: 'open', taskId: 'other' }, T0 + 31 * MIN).state.taskId).toBe('other')
  })
})

describe('the daily count', () => {
  it('starts again on a new day', () => {
    let s = started()
    s = run(s, { type: 'tick' }, T0 + 25 * MIN).state
    expect(s.count).toBe(1)
    const tomorrow = T0 + 24 * 60 * MIN
    const r = run(s, { type: 'playlist', url: 'https://example.com', auto: false }, tomorrow)
    expect(r.state.count).toBe(0)
    expect(r.state.date).toBe(dayOf(tomorrow))
  })
})
