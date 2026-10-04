import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './auth/Login'
import { configured, supabase } from './lib/supabase'
import { Shell } from './ui/Shell'
import { GoalsPanel } from './views/GoalsPanel'
import { useTasks } from './views/useTasks'

function Signed({ onSignOut }: { onSignOut: () => void }) {
  const t = useTasks()
  return (
    <Shell onRefresh={t.reload} onSignOut={onSignOut}>
      <GoalsPanel {...t} />
    </Shell>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!configured) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configured) {
    return (
      <Shell>
        <p role="alert" className="text-accent">
          Supabase isn&apos;t configured. Copy .env.example to .env.local and fill in the two values.
        </p>
      </Shell>
    )
  }
  if (session === undefined) return null
  if (!session) return <Login />
  return <Signed onSignOut={() => void supabase.auth.signOut()} />
}
