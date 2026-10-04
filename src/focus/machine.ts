/**
 * The Focus timer as a pure state machine: no clock, no network, no screen. Everything the timer
 * does is `reduce(state, action, now)`, so it can be tested move by move.
 *
 * The timer counts toward an end time (`endsAt`), not by ticking down a number, so it stays right
 * when a tab sleeps. `seq` goes up on every change; across devices the higher seq wins.
 */

export type Phase = 'focus' | 'short' | 'long'

/** [focus, short break, long break] in minutes. A long break follows every 4th round. */
export const PRESETS: ReadonlyArray<readonly [number, number, number]> = [
  [25, 5, 15],
  [50, 10, 20],
  [15, 3, 10],
]

export const ROUNDS = 4

export interface FocusState {
  seq: number
  taskId: string | null
  phase: Phase
  round: number // 1 to 4
  preset: number // index into PRESETS
  running: boolean // a session is under way (even while waiting for you to press Start)
  paused: boolean
  endsAt: number | null // epoch ms the current phase ends; only while counting
  left: number // seconds left, when not counting
  startedAt: number | null // epoch ms the current focus round began (for the log)
  by: string | null // the device that pressed Start: it plays the beeps
  count: number // focus rounds finished today
  date: string // the local day `count` belongs to
  playlist: string
  playlistAuto: boolean
}

export type Action =
  | { type: 'open'; taskId: string | null }
  | { type: 'preset'; index: number }
  | { type: 'start'; by: string }
  | { type: 'pause' }
  | { type: 'skip' }
  | { type: 'end' }
  | { type: 'tick' }
  | { type: 'playlist'; url: string; auto: boolean }

/** A finished or partial focus round, to be saved in `focus_sessions`. */
export interface LogEntry {
  id: string
  taskId: string | null
  startedAt: number
  minutes: number
  completed: boolean
}

export const phaseSeconds = (preset: number, phase: Phase): number => PRESETS[preset][phase === 'focus' ? 0 : phase === 'short' ? 1 : 2] * 60

export const dayOf = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function initialState(now: number): FocusState {
  return {
    seq: 0,
    taskId: null,
    phase: 'focus',
    round: 1,
    preset: 0,
    running: false,
    paused: true,
    endsAt: null,
    left: phaseSeconds(0, 'focus'),
    startedAt: null,
    by: null,
    count: 0,
    date: dayOf(now),
    playlist: '',
    playlistAuto: true,
  }
}

/** Seconds left in the current phase. */
export function remaining(s: FocusState, now: number): number {
  if (s.paused || s.endsAt === null) return s.left
  return Math.max(0, Math.ceil((s.endsAt - now) / 1000))
}

/** Whole minutes focused so far in the current focus round (pauses do not count). */
export function focusedMinutes(s: FocusState, now: number): number {
  if (s.phase !== 'focus' || !s.running || s.startedAt === null) return 0
  return Math.max(0, Math.floor((phaseSeconds(s.preset, 'focus') - remaining(s, now)) / 60))
}

export interface Result {
  state: FocusState
  log: LogEntry | null
}

const same = (state: FocusState): Result => ({ state, log: null })
const next = (s: FocusState, patch: Partial<FocusState>): FocusState => ({ ...s, ...patch, seq: s.seq + 1 })

/** The break that follows a focus round: long after the 4th round. */
const breakAfter = (round: number): Phase => (round % ROUNDS === 0 ? 'long' : 'short')

/** Leaves a break for the next focus round, which waits for you to press Start. */
function toNextFocus(s: FocusState): FocusState {
  return next(s, { phase: 'focus', round: (s.round % ROUNDS) + 1, left: phaseSeconds(s.preset, 'focus'), paused: true, endsAt: null, startedAt: null })
}

/** Starts a break straight away. */
function toBreak(s: FocusState, now: number): FocusState {
  const phase = breakAfter(s.round)
  const left = phaseSeconds(s.preset, phase)
  return next(s, { phase, left, paused: false, endsAt: now + left * 1000, startedAt: null })
}

export function reduce(state: FocusState, action: Action, now: number): Result {
  // A new day starts the count again.
  const today = dayOf(now)
  const s = state.date === today ? state : { ...state, count: 0, date: today }
  const full = phaseSeconds(s.preset, 'focus')

  switch (action.type) {
    case 'open': {
      // A task can be chosen before a round starts, or while one is waiting to start. It can always be
      // cleared (for example when it was just marked done), and the timer carries on as plain focus.
      if (action.taskId !== null && s.running && !(s.phase === 'focus' && s.paused && s.left === full)) return same(state)
      if (s.taskId === action.taskId) return same(state)
      return { state: next(s, { taskId: action.taskId }), log: null }
    }

    case 'preset': {
      if (s.running || action.index < 0 || action.index >= PRESETS.length || action.index === s.preset) return same(state)
      return { state: next(s, { preset: action.index, left: phaseSeconds(action.index, 'focus') }), log: null }
    }

    case 'start': {
      if (!s.running) {
        return { state: next(s, { running: true, paused: false, phase: 'focus', round: 1, left: full, endsAt: now + full * 1000, startedAt: now, by: action.by }), log: null }
      }
      if (!s.paused) return same(state)
      const fresh = s.phase === 'focus' && s.left === full
      return { state: next(s, { paused: false, endsAt: now + s.left * 1000, startedAt: fresh ? now : s.startedAt, by: action.by }), log: null }
    }

    case 'pause': {
      if (!s.running || s.paused) return same(state)
      return { state: next(s, { left: remaining(s, now), paused: true, endsAt: null }), log: null }
    }

    case 'tick': {
      if (!s.running || s.paused || s.endsAt === null || now < s.endsAt) return s === state ? same(state) : { state: s, log: null }
      if (s.phase === 'focus') {
        // A finished round. Its id comes from the end time, so two devices cannot log it twice.
        const log: LogEntry | null =
          s.startedAt === null ? null : { id: `focus-${s.endsAt}`, taskId: s.taskId, startedAt: s.startedAt, minutes: Math.round(full / 60), completed: true }
        return { state: toBreak({ ...s, count: s.count + 1 }, now), log }
      }
      return { state: toNextFocus(s), log: null }
    }

    case 'skip': {
      if (!s.running) return same(state)
      if (s.phase === 'focus') {
        const minutes = focusedMinutes(s, now)
        const log: LogEntry | null = minutes >= 1 && s.startedAt !== null ? { id: `focus-part-${now}`, taskId: s.taskId, startedAt: s.startedAt, minutes, completed: false } : null
        return { state: toBreak(s, now), log }
      }
      return { state: toNextFocus(s), log: null }
    }

    case 'end': {
      if (!s.running) return same(state)
      const minutes = focusedMinutes(s, now)
      const log: LogEntry | null = minutes >= 1 && s.startedAt !== null ? { id: `focus-part-${now}`, taskId: s.taskId, startedAt: s.startedAt, minutes, completed: false } : null
      return { state: next(s, { running: false, paused: true, phase: 'focus', round: 1, left: full, endsAt: null, startedAt: null, by: null }), log }
    }

    case 'playlist': {
      if (s.playlist === action.url && s.playlistAuto === action.auto) return same(state)
      return { state: next(s, { playlist: action.url, playlistAuto: action.auto }), log: null }
    }
  }
}
