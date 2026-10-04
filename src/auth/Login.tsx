import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setState('sending')
    // shouldCreateUser: false keeps this a single-user app. Only the account
    // created in the Supabase dashboard can sign in.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    if (error) {
      setState('error')
      setMessage(error.message)
    } else {
      setState('sent')
    }
  }

  return (
    <div className="grid h-full place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-panel border border-line bg-panel p-7 shadow-[var(--shadow)]">
        <div className="mb-5 grid size-[30px] place-items-center rounded-[9px] bg-ink" aria-hidden="true">
          <i className="size-2.5 rounded-[3px] bg-panel" />
        </div>
        <h1 className="m-0 text-[22px] font-bold tracking-tight">Cockpit</h1>
        <p className="mb-5 mt-1 text-muted">Sign in with a link sent to your email.</p>
        {state === 'sent' ? (
          <p role="status" className="m-0 rounded-[10px] bg-soft p-3 text-ink2">
            Check your email for the sign-in link. You can close this tab.
          </p>
        ) : (
          <>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink2">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-[10px] border border-line bg-soft px-3 py-2"
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="w-full rounded-[10px] bg-ink px-4 py-2.5 font-semibold text-panel disabled:opacity-60"
            >
              {state === 'sending' ? 'Sending' : 'Send sign-in link'}
            </button>
            {state === 'error' && (
              <p role="alert" className="mb-0 mt-3 text-accent">
                {message}
              </p>
            )}
          </>
        )}
      </form>
    </div>
  )
}
