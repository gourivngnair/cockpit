import { useEffect, useRef, useState } from 'react'
import type { Task } from '../tasks'
import { PRESETS, ROUNDS, phaseSeconds } from './machine'
import type { useFocus } from './useFocus'

type FocusApi = ReturnType<typeof useFocus>

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

interface Props {
  focus: FocusApi
  /** The task being focused on, if it is still open. */
  task: Task | null
  taskName: string | null
  taskHue: string
  /** Tasks planned for today, to choose from before starting. */
  plannedToday: Task[]
  onDone: (taskId: string) => void
}

const ghostBtn = 'rounded-full border border-white/30 bg-white/10 px-5 py-2.5 font-semibold text-white backdrop-blur-md disabled:opacity-40'

export function FocusScreen({ focus, task, taskName, taskHue, plannedToday, onDone }: Props) {
  const { state, left, dispatch, open, setOpen, mine, armed, volume, setVolume, counting } = focus
  const [editingPlaylist, setEditingPlaylist] = useState(false)
  const [playlistText, setPlaylistText] = useState(state.playlist)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Take keyboard focus when opened, so Space and Escape reach the timer (not the button that opened it).
  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  const total = phaseSeconds(state.preset, state.phase)
  const fraction = total ? left / total : 0
  const C = 2 * Math.PI * 140
  const isFocus = state.phase === 'focus'
  const fresh = !state.running || (isFocus && state.paused && state.left === total)

  const start = () => {
    // Opening the playlist needs a tap, so it happens here, on the Start button.
    if (fresh && isFocus && state.playlist && state.playlistAuto) window.open(state.playlist, '_blank', 'noopener')
    dispatch({ type: 'start', by: focus.device })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') setOpen(false)
      if (e.key === ' ' && t.tagName !== 'BUTTON') {
        e.preventDefault()
        if (counting) dispatch({ type: 'pause' })
        else dispatch({ type: 'start', by: focus.device })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, counting, dispatch, setOpen, focus.device])

  if (!open) return null

  const label = isFocus ? (state.running && state.paused && state.left === total && state.round > 1 ? `Next: round ${state.round} of ${ROUNDS}` : `Focus, round ${state.round} of ${ROUNDS}`) : state.phase === 'short' ? 'Short break' : 'Long break'
  const ring = isFocus ? taskHue : '#2E9E5B'
  const mainLabel = counting ? 'Pause' : state.running ? (isFocus && state.left === total ? 'Start focus' : 'Resume') : 'Start focus'

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Focus mode" className="fixed inset-0 z-70 outline-none" data-focus-phase={state.phase} data-focus-running={state.running} data-focus-paused={state.paused}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#2b2b33,#15151a)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(10,10,12,.35),rgba(10,10,12,.6))' }} />
      <div className="relative flex h-full flex-col items-center justify-center p-6 text-center text-white">
        <div className="absolute right-5 top-[calc(18px+env(safe-area-inset-top,0px))] flex gap-2">
          <button type="button" aria-label="Minimise" title="Minimise" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 12h12" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="End focus"
            title="End focus"
            onClick={() => {
              if (!state.running || window.confirm('End this focus session?')) {
                dispatch({ type: 'end' })
                setOpen(false)
              }
            }}
            className="grid size-9 place-items-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div data-focus-label className="text-[13px] font-semibold uppercase tracking-[0.06em] opacity-80">
          {label}
        </div>
        <div className="mb-6 mt-2 max-w-[620px] text-[22px] font-semibold tracking-tight">
          {isFocus ? (taskName ?? 'Just focus') : 'Stand up, stretch, drink some water.'}
        </div>

        {!state.running && (
          <div className="mb-5 flex flex-col items-center gap-1.5" role="group" aria-label="Choose what to focus on">
            {plannedToday.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={state.taskId === t.id}
                onClick={() => dispatch({ type: 'open', taskId: t.id })}
                className={`min-w-[260px] rounded-xl border border-white/25 px-3.5 py-2 text-left ${state.taskId === t.id ? 'bg-white text-[#111]' : 'bg-white/10 text-white'}`}
              >
                {t.content}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={state.taskId === null}
              onClick={() => dispatch({ type: 'open', taskId: null })}
              className={`min-w-[260px] rounded-xl border border-white/25 px-3.5 py-2 text-left ${state.taskId === null ? 'bg-white text-[#111]' : 'bg-white/10 text-white'}`}
            >
              Just focus
            </button>
          </div>
        )}

        <div className="relative size-[300px]">
          <svg viewBox="0 0 300 300" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
            <circle cx="150" cy="150" r="140" fill="none" stroke={ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} />
          </svg>
          <div data-focus-time className="absolute inset-0 grid place-items-center text-[64px] font-semibold tabular-nums tracking-[-0.03em]" aria-live="off">
            {mmss(left)}
          </div>
        </div>

        <div className="my-5 flex gap-2" aria-label={`Round ${state.round} of ${ROUNDS}`}>
          {Array.from({ length: ROUNDS }, (_, i) => (
            <i key={i} className={`size-[9px] rounded-full ${i + 1 < state.round || (i + 1 === state.round && !isFocus) ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={() => (counting ? dispatch({ type: 'pause' }) : start())} className="min-w-[130px] rounded-full border border-white bg-white px-5 py-2.5 font-semibold text-[#111]">
            {mainLabel}
          </button>
          {state.running && (
            <button type="button" onClick={() => dispatch({ type: 'skip' })} className={ghostBtn}>
              {isFocus ? 'Skip to break' : 'Skip break'}
            </button>
          )}
          {task && isFocus && (
            <button
              type="button"
              onClick={() => {
                onDone(task.id)
                dispatch({ type: 'open', taskId: null })
              }}
              className={ghostBtn}
            >
              Mark task done
            </button>
          )}
        </div>

        {!state.running && (
          <div className="mt-5 flex gap-1.5" role="group" aria-label="Round lengths">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={state.preset === i}
                onClick={() => dispatch({ type: 'preset', index: i })}
                className={`rounded-full border border-white/20 px-3 py-1 text-[12.5px] ${state.preset === i ? 'bg-white/20 text-white' : 'text-white/85'}`}
              >
                {p[0]} / {p[1]}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex max-w-[92vw] flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 text-[12.5px] text-white/80">
          <label className="flex items-center gap-2">
            Beep volume
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Beep volume" className="w-28 accent-white" />
          </label>
          <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
          {editingPlaylist ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                const url = playlistText.trim()
                if (url && !/^https?:\/\//i.test(url)) return
                dispatch({ type: 'playlist', url, auto: state.playlistAuto })
                setEditingPlaylist(false)
              }}
            >
              <input
                autoFocus
                aria-label="Playlist link"
                value={playlistText}
                onChange={(e) => setPlaylistText(e.target.value)}
                placeholder="Paste a Spotify or YouTube link"
                className="w-56 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 text-white placeholder:text-white/50"
              />
              <button type="submit" className="rounded-full border border-white/25 px-3 py-1">
                Save
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => (state.playlist ? window.open(state.playlist, '_blank', 'noopener') : (setPlaylistText(''), setEditingPlaylist(true)))}
                className="rounded-full border border-white/20 px-3 py-1"
              >
                {state.playlist ? 'Open playlist' : 'Add playlist'}
              </button>
              {state.playlist && (
                <>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={state.playlistAuto} onChange={(e) => dispatch({ type: 'playlist', url: state.playlist, auto: e.target.checked })} className="accent-white" />
                    Open with focus
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaylistText(state.playlist)
                      setEditingPlaylist(true)
                    }}
                    className="rounded-full border border-white/20 px-3 py-1"
                  >
                    Change
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <div className="absolute bottom-[calc(22px+env(safe-area-inset-bottom,0px))] text-[13px] opacity-75">
          {mine && state.running && !armed
            ? 'Tap anywhere once to turn on the countdown beeps on this device.'
            : state.running && !mine && state.by
              ? 'Running on another device. Beeps play there.'
              : state.count
                ? `${state.count} ${state.count === 1 ? 'focus session' : 'focus sessions'} today`
                : 'Space to start or pause, Esc to minimise'}
        </div>
      </div>
    </div>
  )
}

/** The small countdown that stays on screen while Focus mode is minimised. */
export function FocusPill({ focus }: { focus: FocusApi }) {
  const { state, left, open, setOpen, counting } = focus
  if (!state.running || open) return null
  const tone = state.paused ? 'bg-muted' : state.phase === 'focus' ? 'bg-accent' : 'bg-[#2E9E5B]'
  return (
    <button
      type="button"
      aria-label="Open focus timer"
      data-focus-pill
      onClick={() => setOpen(true)}
      className="fixed bottom-[calc(18px+env(safe-area-inset-bottom,0px))] right-[18px] z-[65] flex items-center gap-2.5 rounded-full bg-ink py-2 pl-2.5 pr-3.5 font-semibold tabular-nums text-panel shadow-[0_10px_28px_rgba(0,0,0,0.2)]"
    >
      <i className={`size-2.5 rounded-full ${tone}`} />
      {mmss(left)}
      {!counting ? ' paused' : state.phase === 'focus' ? '' : ' break'}
    </button>
  )
}
