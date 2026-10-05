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
import { toHM, toMin, todayStr } from './lib/dates'
import { FocusPill, FocusScreen } from './focus/FocusScreen'
import { useFocus } from './focus/useFocus'
import { useFocusLog, useFocusTotals } from './focus/useFocusLog'
import { hueOf } from './tasks'
import { configured, supabase } from './lib/supabase'
import { useUndo } from './undo/useUndo'
import { Shell } from './ui/Shell'
import { ToastProvider } from './ui/Toast'
import { UpdateBanner } from './ui/UpdateBanner'
import { useToast } from './ui/toastContext'
import { GoalsPanel } from './views/GoalsPanel'
import { ProgressView } from './progress/ProgressView'
import { TodaysVision, TodaysVisionBanner } from './vision/TodaysVision'
import { VisionPage } from './vision/VisionPage'
import { pickToday } from './vision/today'
import { useImageSrc } from './vision/useImageSrc'
import { useSignedUrls } from './vision/useSignedUrls'
import { useVision } from './vision/useVision'
import { useTasks, type MoveTarget } from './views/useTasks'

const DEFAULT_MINUTES = 30

type View = 'plan' | 'progress' | 'vision'

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

  // The two screens, kept in the address (#/vision) so the browser's back button works.
  const viewFromAddress = (): View => (window.location.hash === '#/vision' ? 'vision' : window.location.hash === '#/progress' ? 'progress' : 'plan')
  const [view, setView] = useState<View>(viewFromAddress)
  useEffect(() => {
    const onPop = () => setView(viewFromAddress())
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])
  const navigate = (next: View) => {
    if (next === view) return
    window.history.pushState(null, '', next === 'plan' ? window.location.pathname + window.location.search : `#/${next}`)
    setView(next)
  }

  // The vision board, and today's image (shown on the Plan screen and behind Focus mode).
  const vision = useVision()
  const [shuffle, setShuffle] = useState(0)
  const todayImage = useMemo(() => pickToday(vision.images, todayStr(), shuffle), [vision.images, shuffle])
  const heroUrls = useSignedUrls(todayImage ? [todayImage.path] : [])
  const hero = useImageSrc(todayImage?.id ?? null, todayImage ? heroUrls[todayImage.path] : undefined)
  const canShuffle = vision.images.length > 1
  // Focus mode: the timer, its saved log, and the focused time shown on each task.
  const focusLog = useFocusLog()
  const focusTotals = useFocusTotals(focusLog.version)
  const taskById = useMemo(() => new Map([...completed, ...t.tasks].map((x) => [x.id, x])), [t.tasks, completed])
  const projectsById = useMemo(() => Object.fromEntries(t.projects.map((p) => [p.id, p])), [t.projects])
  const focus = useFocus((entry) => {
    const task = entry.taskId ? taskById.get(entry.taskId) : undefined
    void focusLog.log(entry, task ? { content: task.content, projectId: task.projectId } : null)
  })
  const focusTask = focus.state.taskId ? (t.tasks.find((x) => x.id === focus.state.taskId) ?? null) : null
  const plannedToday = useMemo(() => {
    const today = todayStr()
    const first = new Map<string, string>()
    for (const b of bl.blocks) if (b.date === today && (first.get(b.taskId) ?? '99:99') > b.start) first.set(b.taskId, b.start)
    return t.tasks.filter((x) => first.has(x.id)).sort((a, b) => (first.get(a.id) as string).localeCompare(first.get(b.id) as string))
  }, [bl.blocks, t.tasks])

  /** Open Focus mode on a task (from a block, a task menu, or the plan). */
  const startFocus = (taskId: string | null) => {
    focus.dispatch({ type: 'open', taskId })
    focus.setOpen(true)
  }
  /** The top bar button: when nothing is running, pick the task whose block is on right now. */
  const openFocus = () => {
    if (!focus.state.running) {
      const n = new Date()
      const nowMin = n.getHours() * 60 + n.getMinutes()
      const current = bl.blocks.find((b) => b.date === todayStr() && toMin(b.start) <= nowMin && nowMin < toMin(b.start) + b.minutes && t.tasks.some((x) => x.id === b.taskId))
      if (current) focus.dispatch({ type: 'open', taskId: current.taskId })
    }
    focus.setOpen(true)
  }
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

  const changeBlock = (next: Block, label: string) =>
    undo.track(
      (async () => {
        const before = blocksRef.current.find((b) => b.id === next.id)
        if (!before || !(await saveBlock(next))) return
        undo.push({ label, undo: () => saveBlock(before), redo: () => saveBlock(next) })
      })(),
    )

  const resizeBlock = async (id: string, minutes: number) => {
    const block = blocksRef.current.find((b) => b.id === id)
    if (block) await changeBlock({ ...block, minutes: fit(toMin(block.start), minutes) }, 'Resized block')
  }

  const removeBlock = (id: string) =>
    undo.track(
      (async () => {
        const block = blocksRef.current.find((b) => b.id === id)
        if (block && (await dropBlock(block))) undo.push({ label: 'Removed block', undo: async () => !!(await addBlock(block)), redo: () => dropBlock(block) })
      })(),
    )

  const moveTask = (id: string, target: MoveTarget) =>
    undo.track(
      (async () => {
        const title = t.tasks.find((x) => x.id === id)?.content ?? 'task'
        const moved = await t.move(id, target)
        if (moved) undo.push({ label: `Moved "${title}"`, undo: () => t.place(moved.id, moved.before), redo: () => t.place(moved.id, moved.after) })
      })(),
    )

  const changeDeadline = (id: string, date: string | null) =>
    undo.track(
      (async () => {
        const task = t.tasks.find((x) => x.id === id)
        const before = task?.deadline ?? null
        const ok = await t.setDeadline(id, date)
        if (ok && task) undo.push({ label: `Changed deadline of "${task.content}"`, undo: () => t.setDeadline(id, before), redo: () => t.setDeadline(id, date) })
        return ok
      })(),
    )

  const completeTask = (id: string) =>
    undo.track(
      (async () => {
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
      })(),
    )

  const dnd = useDnd({
    moveTask: (id, target) => void moveTask(id, target),
    placeTask: (taskId, date, start) => {
      const task = t.tasks.find((x) => x.id === taskId)
      if (!task) return
      const minutes = fit(start, task.durationMin ?? DEFAULT_MINUTES)
      void undo.track(
        addBlock({ taskId, date, start: toHM(start), minutes }).then((made) => {
          if (made) undo.push({ label: `Planned "${task.content}"`, undo: () => dropBlock(made), redo: async () => !!(await addBlock(made)) })
        }),
      )
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
      onFocus={openFocus}
      view={view}
      onView={navigate}
      history={{ canUndo: undo.canUndo, canRedo: undo.canRedo, undoLabel: undo.undoLabel, redoLabel: undo.redoLabel, onUndo: () => void undo.undo(), onRedo: () => void undo.redo() }}
    >
      {/* Week view needs the width, so the vision panel steps aside (as in v2). */}
      {view === 'progress' ? (
        <ProgressView projects={t.projects} tasks={t.tasks} refresh={historyTick} />
      ) : view === 'vision' ? (
        <VisionPage images={vision.images} uploading={vision.uploading} today={todayStr()} onUpload={vision.upload} onUpdate={vision.update} onRemove={vision.remove} onPin={vision.pin} />
      ) : (
        <div
          className={`grid h-full gap-3 [grid-template-columns:minmax(260px,320px)_minmax(0,1fr)] ${mode === 'week' ? '' : 'min-[1320px]:[grid-template-columns:320px_minmax(0,1fr)_340px]'}`}
        >
          <GoalsPanel {...t} complete={(id) => void completeTask(id)} move={(id, target) => void moveTask(id, target)} setDeadline={changeDeadline} blocks={bl.blocks} dragging={dnd} focusTotals={focusTotals} onFocus={startFocus} />
          <div className="flex min-h-0 flex-col gap-3">
            {/* On a tablet there is no room for the side panel, so today's image is a slim strip. */}
            {mode === 'day' && (
              <div className="min-[1320px]:hidden">
                <TodaysVisionBanner image={todayImage} canShuffle={canShuffle} onShuffle={() => setShuffle((n) => n + 1)} />
              </div>
            )}
            <Calendar
              events={ev.events}
              tasks={t.tasks}
              completed={completed}
              blocks={bl.blocks}
              projects={t.projects}
              onClasses={() => setClassesOpen(true)}
              onLength={(id, m) => void resizeBlock(id, m)}
              onDone={(taskId) => void completeTask(taskId)}
              onFocus={startFocus}
              onRemove={(id) => void removeBlock(id)}
              mode={mode}
              onMode={setMode}
            />
          </div>
          {mode === 'day' && (
            <div className="hidden min-h-0 min-[1320px]:flex min-[1320px]:flex-col">
              <TodaysVision image={todayImage} canShuffle={canShuffle} onShuffle={() => setShuffle((n) => n + 1)} onAdd={() => navigate('vision')} />
            </div>
          )}
        </div>
      )}      <FocusScreen
        focus={focus}
        task={focusTask}
        taskName={focus.state.taskId ? (taskById.get(focus.state.taskId)?.content ?? null) : null}
        taskHue={focusTask ? hueOf(focusTask.projectId, projectsById) : '#FFFFFF'}
        plannedToday={plannedToday}
        onDone={(id) => void completeTask(id)}
        imageSrc={hero.src}
        onNextImage={canShuffle ? () => setShuffle((n) => n + 1) : undefined}
      />
      <FocusPill focus={focus} />
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
