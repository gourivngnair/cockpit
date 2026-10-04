/**
 * The 5-4-3-2-1 countdown beeps at the end of a focus round and of a break.
 *
 * The beeps are scheduled ahead on the audio clock, not fired from a timer, because a hidden tab
 * throttles timers but its audio keeps going. Sound only starts after a tap or key press on this
 * device (browsers require it, and CLAUDE.md invariant 7): until then nothing is created.
 */

export interface PlannedBeep {
  /** Seconds from now. */
  at: number
  kind: 'tick' | 'end'
}

/** When the beeps fall, given how many seconds are left: one tick for each of the last 5 seconds, then a long tone at the end. */
export function countdownPlan(remainingSec: number): PlannedBeep[] {
  const plan: PlannedBeep[] = []
  for (let k = 5; k >= 1; k--) {
    const at = remainingSec - k
    if (at >= 0) plan.push({ at, kind: 'tick' })
  }
  if (remainingSec > 0) plan.push({ at: remainingSec, kind: 'end' })
  return plan
}

const TICK = { freq: 880, seconds: 0.11 }
const END = { freq: 1320, seconds: 0.8 }

export interface Beeper {
  /** Call from a tap or key press. Creates or wakes the audio engine. Resolves true once sound is allowed. */
  arm(): boolean
  readonly armed: boolean
  /** Schedule the countdown for a moment `endsInMs` from now. Replaces any earlier schedule. */
  schedule(endsInMs: number, volume: number): number
  cancel(): void
  /** One short tick, so the volume slider can be heard. */
  preview(volume: number): void
}

export function createBeeper(): Beeper {
  let ctx: AudioContext | null = null
  let armed = false
  let nodes: OscillatorNode[] = []

  const make = () => {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctor ? new Ctor() : null
  }

  function beepAt(context: AudioContext, when: number, spec: { freq: number; seconds: number }, volume: number) {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'sine'
    osc.frequency.value = spec.freq
    // A quick fade in and out avoids clicks.
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(volume, when + 0.01)
    gain.gain.setValueAtTime(volume, when + Math.max(0.011, spec.seconds - 0.05))
    gain.gain.linearRampToValueAtTime(0, when + spec.seconds)
    osc.connect(gain)
    gain.connect(context.destination)
    osc.start(when)
    osc.stop(when + spec.seconds + 0.02)
    nodes.push(osc)
  }

  const cancel = () => {
    for (const n of nodes) {
      try {
        n.stop()
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    nodes = []
  }

  return {
    arm() {
      if (!ctx) ctx = make()
      if (!ctx) return false
      if (ctx.state === 'suspended') void ctx.resume()
      armed = true
      return true
    },
    get armed() {
      return armed
    },
    schedule(endsInMs, volume) {
      cancel()
      if (!ctx || !armed || volume <= 0) return 0
      const plan = countdownPlan(endsInMs / 1000)
      for (const b of plan) beepAt(ctx, ctx.currentTime + b.at, b.kind === 'tick' ? TICK : END, volume)
      return plan.length
    },
    cancel,
    preview(volume) {
      if (!ctx || !armed || volume <= 0) return
      beepAt(ctx, ctx.currentTime, TICK, volume)
    },
  }
}
