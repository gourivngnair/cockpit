import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../ui/toastContext'
import { initialState, reduce, remaining, type Action, type FocusState, type LogEntry } from './machine'
import { createBeeper } from './sound'

const CACHE = 'cockpit-focus-state'
const DEVICE = 'cockpit-device'
const VOLUME = 'cockpit-focus-volume'
const POLL_MS = 5000 // a backstop for the live connection, so devices agree within seconds

/** A stable id for this browser, so the timer knows which device pressed Start. */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE, id)
    }
    return id
  } catch {
    return `device-${Math.random().toString(36).slice(2)}`
  }
}

function readCache(): FocusState | null {
  try {
    const raw = localStorage.getItem(CACHE)
    const s = raw ? (JSON.parse(raw) as FocusState) : null
    return s && typeof s.seq === 'number' ? s : null
  } catch {
    return null
  }
}

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME))
    return localStorage.getItem(VOLUME) !== null && v >= 0 && v <= 1 ? v : 0.6
  } catch {
    return 0.6
  }
}

/**
 * The Focus timer: runs the state machine against the real clock, keeps it in step with your
 * other devices, plays the countdown beeps on the device that pressed Start, and keeps the
 * screen awake while it runs.
 */
export function useFocus(onLog: (entry: LogEntry) => void) {
  const toast = useToast()
  const [device] = useState(deviceId)
  const [state, setState] = useState<FocusState>(() => readCache() ?? initialState(Date.now()))
  const ref = useRef(state)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [beeper] = useState(createBeeper)
  const [armed, setArmed] = useState(false)
  const [volume, setVolumeState] = useState(readVolume)
  const onLogRef = useRef(onLog)
  const userId = useRef<string | null>(null)
  const pushTimer = useRef(0)
  const pushFailed = useRef(false)

  useEffect(() => {
    onLogRef.current = onLog
  }, [onLog])

  const writeCache = (s: FocusState) => {
    try {
      localStorage.setItem(CACHE, JSON.stringify(s))
    } catch {
      /* the saved copy is a convenience */
    }
  }

  /** Save the timer so the other devices can follow it. */
  const push = useCallback(async () => {
    try {
      userId.current ??= (await supabase.auth.getSession()).data.session?.user.id ?? null
      if (!userId.current) return
      const { error } = await supabase.from('focus').upsert({ user_id: userId.current, state: ref.current, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      pushFailed.current = false
    } catch {
      if (!pushFailed.current) toast('Could not sync the timer to your other devices.')
      pushFailed.current = true
    }
  }, [toast])

  const apply = useCallback(
    (next: FocusState) => {
      ref.current = next
      setState(next)
      writeCache(next)
      window.clearTimeout(pushTimer.current)
      pushTimer.current = window.setTimeout(() => void push(), 250)
    },
    [push],
  )

  const dispatch = useCallback(
    (action: Action) => {
      const result = reduce(ref.current, action, Date.now())
      if (result.state !== ref.current) apply(result.state)
      if (result.log) onLogRef.current(result.log)
    },
    [apply],
  )

  /** Take another device's timer if it is newer than ours. Never written back. */
  const adopt = useCallback((remote: unknown) => {
    const r = remote as FocusState | null
    if (!r || typeof r.seq !== 'number' || r.seq <= ref.current.seq) return
    ref.current = r
    setState(r)
    writeCache(r)
  }, [])

  const pull = useCallback(async () => {
    const { data } = await supabase.from('focus').select('state').maybeSingle()
    if (data?.state) adopt(data.state)
    else if (ref.current.seq > 0) void push() // nothing saved yet: share ours
  }, [adopt, push])

  // Stay in step with the other devices: live changes, plus a gentle poll and a check on return.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void pull()
    const channel = supabase
      .channel('focus-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'focus' }, (payload) => adopt((payload.new as { state?: unknown } | undefined)?.state))
      .subscribe()
    const poll = setInterval(() => !document.hidden && void pull(), POLL_MS)
    const onVisible = () => {
      if (document.hidden) return
      dispatch({ type: 'tick' })
      void pull()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [pull, adopt, dispatch])

  // Count toward the end time while a round or break is under way.
  const counting = state.running && !state.paused
  useEffect(() => {
    if (!counting) return
    const id = setInterval(() => {
      dispatch({ type: 'tick' })
      setNow(Date.now())
    }, 250)
    return () => clearInterval(id)
  }, [counting, dispatch])

  // Sound may only begin after a tap or key press on this device.
  useEffect(() => {
    const onGesture = () => {
      if (beeper.arm()) setArmed(true)
    }
    document.addEventListener('pointerdown', onGesture)
    document.addEventListener('keydown', onGesture)
    return () => {
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
  }, [beeper])

  // The countdown beeps play on the device that pressed Start, and only there.
  const mine = state.by === device
  useEffect(() => {
    if (counting && state.endsAt !== null && mine && armed) beeper.schedule(state.endsAt - Date.now(), volume)
    else beeper.cancel()
    return () => beeper.cancel()
  }, [counting, state.endsAt, mine, armed, volume, beeper])

  // Keep the screen awake while counting (where the browser allows it).
  useEffect(() => {
    if (!counting || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const take = () => void navigator.wakeLock.request('screen').then((l) => (stopped ? void l.release() : (lock = l))).catch(() => {})
    take()
    const again = () => !document.hidden && take()
    document.addEventListener('visibilitychange', again)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', again)
      void lock?.release().catch(() => {})
    }
  }, [counting])

  const left = remaining(state, now)

  // The countdown in the tab title.
  useEffect(() => {
    const mm = String(Math.floor(left / 60)).padStart(2, '0')
    const ss = String(left % 60).padStart(2, '0')
    document.title = counting ? `${mm}:${ss} ${state.phase === 'focus' ? 'focus' : 'break'} · Cockpit` : 'Cockpit'
  }, [counting, left, state.phase])

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v)
      try {
        localStorage.setItem(VOLUME, String(v))
      } catch {
        /* per-device preference only */
      }
      beeper.preview(v)
    },
    [beeper],
  )

  return { state, left, open, setOpen, dispatch, device, mine, armed, volume, setVolume, counting }
}
