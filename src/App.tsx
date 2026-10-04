import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './auth/Login'
import { Calendar } from './calendar/Calendar'
import { ClassesDialog } from './events/ClassesDialog'
import { useEvents } from './events/useEvents'
import { configured, supabase } from './lib/supabase'
import { Shell } from './ui/Shell'
import { ToastProvider } from './ui/Toast'
import { GoalsPanel } from './views/GoalsPanel'
import { VisionPlaceholder } from './views/VisionPlaceholder'
import { useTasks } from './views/useTasks'

function Signed({ onSignOut }: { onSignOut: () => void }) {
  const t = useTasks()
  const ev = useEvents()
  const [classesOpen, setClassesOpen] = useState(false)
  return (
    <Shell onRefresh={t.reload} onSignOut={onSignOut}>
      <div className="grid h-full gap-3 [grid-template-columns:minmax(260px,320px)_minmax(0,1fr)] min-[1320px]:[grid-template-columns:320px_minmax(0,1fr)_340px]">
        <GoalsPanel {...t} />
        <Calendar events={ev.events} tasks={t.tasks} onClasses={() => setClassesOpen(true)} />
        <div className="hidden min-h-0 min-[1320px]:flex min-[1320px]:flex-col">
          <VisionPlaceholder />
        </div>
      </div>
      {classesOpen && (
        <ClassesDialog events={ev.events} onReplace={ev.replaceWeeks} onRemove={ev.remove} onClose={() => setClassesOpen(false)} />
      )}
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
  return <ToastProvider>{session ? <Signed onSignOut={() => void supabase.auth.signOut()} /> : <Login />}</ToastProvider>
}
