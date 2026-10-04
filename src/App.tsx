import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './auth/Login'
import { earliestPlan } from './blocks/plan'
import { useBlocks, type Block } from './blocks/useBlocks'
import { Calendar } from './calendar/Calendar'
import { END, STEP } from './calendar/time'
import { useDnd } from './dnd/useDnd'
import { ClassesDialog } from './events/ClassesDialog'
import { forgetCompletion, syncDone, useDoneTasks } from './history/useDoneTasks'
import { NotificationsDialog } from './notifications/NotificationsDialog'
import { useEvents } from './events/useEvents'
import { toHM, toMin } from './lib/dates'
import { configured, supabase } from './lib/supabase'
import { useUndo } from './undo/useUndo'
import { Shell } from './ui/Shell'
import { ToastProvider } from './ui/Toast'
import { UpdateBanner } from './ui/UpdateBanner'
import { useToast } from './ui/toastContext'
import { GoalsPanel } from './views/GoalsPanel'
import { VisionPlaceholder } from './views/VisionPlaceholder'
import { useTasks, type MoveTarget } from './views/useTasks'

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

  const undo = useUndo()
  const blocksRef = useRef(bl.blocks)
  useEffect(() => {
    blocksRef.current = bl.blocks
  }, [bl.blocks])

  /** Keeps a block inside the day: it can be at most as long as the time left until midnight. */
  const fit = (start: number, minutes: number) => Math.max(STEP, Math.min(minutes, END * 60 - start))

  /**
   * After a block is saved, mirror the task's earliest upcoming block into Todoist as its planned
   * time (due date and time, plus length). No block left clears it. Repeating tasks are never touched.
   */
  const syncPlan = (taskId: string, blocks: Block[]) => void t.setPlan(taskId, earliestPlan(blocks, taskId, new Date()))

  // Every change below is recorded for undo (Ctrl+Z). Each step saves, then mirrors the plan to Todoist.
  const addBlock = async (b: Omit<Block, 'id'> & { id?: string }) => {
    const made = await bl.create(b)
    if (made) syncPlan(made.taskId, [...blocksRef.current.filter((x) => x.id !== made.id), made])
    return made
  }

  const dropBlock = async (block: Block) => {
    const ok = await bl.remove(block.id)
    if (ok) syncPlan(block.taskId, blocksRef.current.filter((b) => b.id !== block.id))
    return ok
  }

  const saveBlock = async (to: Block) => {
    const ok = await bl.update(to)
    if (ok) syncPlan(to.taskId, blocksRef.current.map((b) => (b.id === to.id ? to : b)))
    return ok
  }

  const changeBlock = async (next: Block, label: string) => {
    const before = blocksRef.current.find((b) => b.id === next.id)
    if (!before || !(await saveBlock(next))) return
    undo.push({ label, undo: () => saveBlock(before), redo: () => saveBlock(next) })
  }

  const resizeBlock = async (id: string, minutes: number) => {
    const block = blocksRef.current.find((b) => b.id === id)
    if (block) await changeBlock({ ...block, minutes: fit(toMin(block.start), minutes) }, 'Resized block')
  }

  const removeBlock = async (id: string) => {
    const block = blocksRef.current.find((b) => b.id === id)
    if (block && (await dropBlock(block))) undo.push({ label: 'Removed block', undo: async () => !!(await addBlock(block)), redo: () => dropBlock(block) })
  }

  const moveTask = async (id: string, target: MoveTarget) => {
    const title = t.tasks.find((x) => x.id === id)?.content ?? 'task'
    const moved = await t.move(id, target)
    if (moved) undo.push({ label: `Moved "${title}"`, undo: () => t.place(moved.id, moved.before), redo: () => t.place(moved.id, moved.after) })
  }

  const changeDeadline = async (id: string, date: string | null) => {
    const task = t.tasks.find((x) => x.id === id)
    const before = task?.deadline ?? null
    const ok = await t.setDeadline(id, date)
    if (ok && task) undo.push({ label: `Changed deadline of "${task.content}"`, undo: () => t.setDeadline(id, before), redo: () => t.setDeadline(id, date) })
    return ok
  }

  const completeTask = async (id: string) => {
    const finished = await t.complete(id) // only non-repeating tasks come back here, so only those can be undone
    if (!finished) return
    undo.push({
      label: `Completed "${finished.content}"`,
      undo: async () => {
        const ok = await t.reopen(finished)
        if (ok) {
          await forgetCompletion(finished.id) // it is not done any more, so it must not count in the history
          setHistoryTick((n) => n + 1)
        }
        return ok
      },
      redo: async () => !!(await t.complete(finished.id)),
    })
  }

  const dnd = useDnd({
    moveTask: (id, target) => void moveTask(id, target),
    placeTask: (taskId, date, start) => {
      const task = t.tasks.find((x) => x.id === taskId)
      if (!task) return
      const minutes = fit(start, task.durationMin ?? DEFAULT_MINUTES)
      void addBlock({ taskId, date, start: toHM(start), minutes }).then((made) => {
        if (made) undo.push({ label: `Planned "${task.content}"`, undo: () => dropBlock(made), redo: async () => !!(await addBlock(made)) })
      })
    },
    moveBlock: (id, date, start) => {
      const block = blocksRef.current.find((b) => b.id === id)
      if (block) void changeBlock({ ...block, date, start: toHM(start), minutes: fit(start, block.minutes) }, 'Moved block')
    },
    resizeBlock: (id, minutes) => void resizeBlock(id, minutes),
    refuse: toast,
  })
  return (
    <Shell
      onRefresh={t.reload}
      onSignOut={onSignOut}
      onNotifications={() => setNotificationsOpen(true)}
      history={{ canUndo: undo.canUndo, canRedo: undo.canRedo, undoLabel: undo.undoLabel, redoLabel: undo.redoLabel, onUndo: () => void undo.undo(), onRedo: () => void undo.redo() }}
    >
      {/* Week view needs the width, so the vision panel steps aside (as in v2). */}
      <div
        className={`grid h-full gap-3 [grid-template-columns:minmax(260px,320px)_minmax(0,1fr)] ${mode === 'week' ? '' : 'min-[1320px]:[grid-template-columns:320px_minmax(0,1fr)_340px]'}`}
      >
        <GoalsPanel {...t} complete={(id) => void completeTask(id)} move={(id, target) => void moveTask(id, target)} setDeadline={changeDeadline} blocks={bl.blocks} dragging={dnd} />
        <Calendar
          events={ev.events}
          tasks={t.tasks}
          completed={completed}
          blocks={bl.blocks}
          projects={t.projects}
          onClasses={() => setClassesOpen(true)}
          onLength={(id, m) => void resizeBlock(id, m)}
          onDone={(taskId) => void completeTask(taskId)}
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
