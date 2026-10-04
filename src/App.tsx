import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './auth/Login'
import { useBlocks } from './blocks/useBlocks'
import { Calendar } from './calendar/Calendar'
import { END, STEP } from './calendar/time'
import { useDnd } from './dnd/useDnd'
import { ClassesDialog } from './events/ClassesDialog'
import { useEvents } from './events/useEvents'
import { toHM, toMin } from './lib/dates'
import { configured, supabase } from './lib/supabase'
import { Shell } from './ui/Shell'
import { ToastProvider } from './ui/Toast'
import { useToast } from './ui/toastContext'
import { GoalsPanel } from './views/GoalsPanel'
import { VisionPlaceholder } from './views/VisionPlaceholder'
import { useTasks } from './views/useTasks'

const DEFAULT_MINUTES = 30

function Signed({ onSignOut }: { onSignOut: () => void }) {
  const toast = useToast()
  const t = useTasks()
  const ev = useEvents()
  const bl = useBlocks()
  const [classesOpen, setClassesOpen] = useState(false)
  const [mode, setMode] = useState<'day' | 'week'>('day')

  /** Keeps a block inside the day: it can be at most as long as the time left until midnight. */
  const fit = (start: number, minutes: number) => Math.max(STEP, Math.min(minutes, END * 60 - start))

  const resizeBlock = async (id: string, minutes: number) => {
    const block = bl.blocks.find((b) => b.id === id)
    if (!block) return
    const m = fit(toMin(block.start), minutes)
    // The block is saved first; the task's time needed in Todoist follows so it reads the same everywhere.
    if (await bl.update({ ...block, minutes: m })) await t.setDuration(block.taskId, m)
  }

  const dnd = useDnd({
    moveTask: (id, target) => void t.move(id, target),
    placeTask: (taskId, date, start) => {
      const task = t.tasks.find((x) => x.id === taskId)
      if (!task) return
      const minutes = fit(start, task.durationMin ?? DEFAULT_MINUTES)
      void bl.create({ taskId, date, start: toHM(start), minutes })
    },
    moveBlock: (id, date, start) => {
      const block = bl.blocks.find((b) => b.id === id)
      if (block) void bl.update({ ...block, date, start: toHM(start), minutes: fit(start, block.minutes) })
    },
    resizeBlock: (id, minutes) => void resizeBlock(id, minutes),
    refuse: toast,
  })

  return (
    <Shell onRefresh={t.reload} onSignOut={onSignOut}>
      {/* Week view needs the width, so the vision panel steps aside (as in v2). */}
      <div
        className={`grid h-full gap-3 [grid-template-columns:minmax(260px,320px)_minmax(0,1fr)] ${mode === 'week' ? '' : 'min-[1320px]:[grid-template-columns:320px_minmax(0,1fr)_340px]'}`}
      >
        <GoalsPanel {...t} blocks={bl.blocks} dragging={dnd} />
        <Calendar
          events={ev.events}
          tasks={t.tasks}
          completed={t.completed}
          blocks={bl.blocks}
          projects={t.projects}
          onClasses={() => setClassesOpen(true)}
          onLength={(id, m) => void resizeBlock(id, m)}
          onDone={(taskId) => void t.complete(taskId)}
          onRemove={(id) => void bl.remove(id)}
          mode={mode}
          onMode={setMode}
        />
        {mode === 'day' && (
          <div className="hidden min-h-0 min-[1320px]:flex min-[1320px]:flex-col">
            <VisionPlaceholder />
          </div>
        )}
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
