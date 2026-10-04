import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './auth/Login'
import { earliestPlan } from './blocks/plan'
import { useBlocks, type Block } from './blocks/useBlocks'
import { Calendar } from './calendar/Calendar'
import { END, STEP } from './calendar/time'
import { useDnd } from './dnd/useDnd'
import { ClassesDialog } from './events/ClassesDialog'
import { syncDone, useDoneTasks } from './history/useDoneTasks'
import { NotificationsDialog } from './notifications/NotificationsDialog'
import { useEvents } from './events/useEvents'
import { toHM, toMin } from './lib/dates'
import { configured, supabase } from './lib/supabase'
import { Shell } from './ui/Shell'
import { ToastProvider } from './ui/Toast'
import { UpdateBanner } from './ui/UpdateBanner'
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
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const [mode, setMode] = useState<'day' | 'week'>('day')

  // Keep Cockpit's own copy of completions up to date: when the app opens, every 10 minutes while
  // it is open, and a moment after something is ticked (Todoist's log can lag a few seconds).
  const ticks = t.completed.length + t.ticked.size
  useEffect(() => {
    const run = () => void syncDone().then((ok) => ok && setHistoryTick((n) => n + 1))
    const first = setTimeout(run, ticks === 0 ? 0 : 3000)
    const every = setInterval(run, 10 * 60 * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [ticks])

  // Blocks whose task is no longer open: look the task up in the saved history so the block stays,
  // faded and struck through, after a reload.
  const orphanTaskIds = useMemo(() => [...new Set(bl.blocks.map((b) => b.taskId))].filter((id) => !t.tasks.some((x) => x.id === id)), [bl.blocks, t.tasks])
  const history = useDoneTasks(orphanTaskIds, historyTick)
  const completed = useMemo(() => [...t.completed, ...history.filter((h) => !t.completed.some((c) => c.id === h.id))], [t.completed, history])

  /** Keeps a block inside the day: it can be at most as long as the time left until midnight. */
  const fit = (start: number, minutes: number) => Math.max(STEP, Math.min(minutes, END * 60 - start))

  /**
   * After a block is saved, mirror the task's earliest upcoming block into Todoist as its planned
   * time (due date and time, plus length). No block left clears it. Repeating tasks are never touched.
   */
  const syncPlan = (taskId: string, blocks: Block[]) => void t.setPlan(taskId, earliestPlan(blocks, taskId, new Date()))

  const changeBlock = async (next: Block) => {
    if (await bl.update(next)) syncPlan(next.taskId, bl.blocks.map((b) => (b.id === next.id ? next : b)))
  }

  const resizeBlock = async (id: string, minutes: number) => {
    const block = bl.blocks.find((b) => b.id === id)
    if (block) await changeBlock({ ...block, minutes: fit(toMin(block.start), minutes) })
  }

  const removeBlock = async (id: string) => {
    const block = bl.blocks.find((b) => b.id === id)
    if (block && (await bl.remove(id))) syncPlan(block.taskId, bl.blocks.filter((b) => b.id !== id))
  }

  const dnd = useDnd({
    moveTask: (id, target) => void t.move(id, target),
    placeTask: (taskId, date, start) => {
      const task = t.tasks.find((x) => x.id === taskId)
      if (!task) return
      const minutes = fit(start, task.durationMin ?? DEFAULT_MINUTES)
      void bl.create({ taskId, date, start: toHM(start), minutes }).then((block) => {
        if (block) syncPlan(taskId, [...bl.blocks, block])
      })
    },
    moveBlock: (id, date, start) => {
      const block = bl.blocks.find((b) => b.id === id)
      if (block) void changeBlock({ ...block, date, start: toHM(start), minutes: fit(start, block.minutes) })
    },
    resizeBlock: (id, minutes) => void resizeBlock(id, minutes),
    refuse: toast,
  })
  return (
    <Shell onRefresh={t.reload} onSignOut={onSignOut} onNotifications={() => setNotificationsOpen(true)}>
      {/* Week view needs the width, so the vision panel steps aside (as in v2). */}
      <div
        className={`grid h-full gap-3 [grid-template-columns:minmax(260px,320px)_minmax(0,1fr)] ${mode === 'week' ? '' : 'min-[1320px]:[grid-template-columns:320px_minmax(0,1fr)_340px]'}`}
      >
        <GoalsPanel {...t} blocks={bl.blocks} dragging={dnd} />
        <Calendar
          events={ev.events}
          tasks={t.tasks}
          completed={completed}
          blocks={bl.blocks}
          projects={t.projects}
          onClasses={() => setClassesOpen(true)}
          onLength={(id, m) => void resizeBlock(id, m)}
          onDone={(taskId) => void t.complete(taskId)}
          onRemove={(id) => void removeBlock(id)}
          mode={mode}
          onMode={setMode}
        />
        {mode === 'day' && (
          <div className="hidden min-h-0 min-[1320px]:flex min-[1320px]:flex-col">
            <VisionPlaceholder />
          </div>
        )}
      </div>
      {notificationsOpen && <NotificationsDialog onClose={() => setNotificationsOpen(false)} />}
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
  return (
    <ToastProvider>
      {session ? <Signed onSignOut={() => void supabase.auth.signOut()} /> : <Login />}
      <UpdateBanner />
    </ToastProvider>
  )
}
