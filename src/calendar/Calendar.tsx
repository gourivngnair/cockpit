import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Block } from '../blocks/useBlocks'
import type { EventRow } from '../events/useEvents'
import { addDays, dayName, fmtDur, mondayOf, parseDay, shortTime, toHM, toMin, todayStr } from '../lib/dates'
import { hueOf, type Project, type Task } from '../tasks'
import { Panel } from '../ui/Shell'
import { BlockCard } from './BlockCard'
import { layout } from './layout'
import { END, HOUR_PX, START } from './time'

const MIN_VISIBLE = 22 // minutes; keeps very short items readable
const EVENT_HUE = '#1C8BD6'
// One-off events (talks, orations) are tinted blue so they read differently from grey classes.
const EVENT_STYLE = {
  color: EVENT_HUE,
  background: `color-mix(in srgb, ${EVENT_HUE} 15%, var(--panel))`,
  borderColor: `color-mix(in srgb, ${EVENT_HUE} 40%, var(--panel))`,
}

interface Item {
  kind: 'class' | 'event' | 'rt' | 'block' | 'done'
  key: string
  title: string
  detail: string
  s: number
  e: number
  blockId?: string
  minutes?: number
  hue?: string
}

interface Data {
  events: EventRow[]
  tasks: Task[]
  completed: Task[]
  blocks: Block[]
  projectsById: Record<string, Project>
}

function itemsFor(day: string, d: Data): Item[] {
  const out: Item[] = []
  for (const e of d.events) {
    if (e.date !== day) continue
    const s = toMin(e.start)
    const end = toMin(e.end)
    out.push({
      kind: e.kind,
      key: `ev-${e.id}`,
      title: e.title,
      detail: `${shortTime(e.start)} to ${shortTime(e.end)}${e.room ? `, ${e.room}` : ''}`,
      s,
      e: Math.max(end, s + MIN_VISIBLE),
    })
  }
  for (const t of d.tasks) {
    if (!t.recurring || t.due?.date !== day || !t.due.time) continue
    const s = toMin(t.due.time)
    const dur = t.durationMin ?? 30
    out.push({ kind: 'rt', key: `rt-${t.id}`, title: t.content, detail: shortTime(t.due.time), s, e: Math.max(s + dur, s + MIN_VISIBLE) })
  }
  for (const b of d.blocks) {
    if (b.date !== day) continue
    const live = d.tasks.find((t) => t.id === b.taskId)
    const done = live ? undefined : d.completed.find((t) => t.id === b.taskId)
    const task = live ?? done
    if (!task) continue // the task was completed or deleted elsewhere
    const s = toMin(b.start)
    out.push({
      kind: live ? 'block' : 'done',
      key: `bl-${b.id}`,
      title: task.content,
      detail: shortTime(b.start),
      s,
      e: Math.max(s + b.minutes, s + MIN_VISIBLE),
      blockId: b.id,
      minutes: b.minutes,
      hue: hueOf(task.projectId, d.projectsById),
    })
  }
  return out.filter((i) => i.s >= START * 60 && i.s < END * 60)
}

/** Tasks whose real deadline (Todoist's date-only Deadline field) falls on this day. */
function deadlinesOn(day: string, tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.recurring && t.deadline === day)
}

/** All-day deadline chips for a day. Deadlines are dates, so they sit above the hours, not on them. */
function DeadlineChips({ items, compact }: { items: Task[]; compact: boolean }) {
  if (items.length === 0) return null
  const shown = compact ? items.slice(0, 2) : items
  return (
    <div className={`flex flex-wrap justify-center gap-1 ${compact ? 'mt-1' : ''}`} data-deadlines>
      {shown.map((t) => (
        <span
          key={t.id}
          data-deadline={t.id}
          title={`Deadline: ${t.content}`}
          className="max-w-full truncate rounded-md px-[7px] py-0.5 text-[11px] font-medium text-accent"
          style={{ background: 'color-mix(in srgb, var(--red) 12%, var(--panel))' }}
        >
          {compact ? 'Due' : `Due: ${t.content}`}
          {compact && items.length > 1 && t === shown[shown.length - 1] && items.length > shown.length ? ` +${items.length - shown.length}` : ''}
        </span>
      ))}
    </div>
  )
}
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

interface LaneProps {
  day: string
  compact: boolean
  data: Data
  now: Date
  onBlock: (blockId: string, e: MouseEvent<HTMLElement>) => void
}

function Lane({ day, compact, data, now, onBlock }: LaneProps) {
  const hours = END - START
  const placed = layout(itemsFor(day, data))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNow = day === todayStr() && nowMin >= START * 60 && nowMin < END * 60
  const top = (m: number) => ((m - START * 60) / 60) * HOUR_PX

  return (
    <div className="relative border-l border-line" style={{ height: HOUR_PX * hours }} data-lane={day}>
      {Array.from({ length: hours }, (_, i) => (
        <div key={i} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: HOUR_PX * i }} />
      ))}
      {placed.map((b) => {
        const w = 100 / b.lanes
        const short = b.e - b.s < 40
        const isBlock = b.kind === 'block' || b.kind === 'done'
        const style: React.CSSProperties = {
          top: top(b.s) + 2,
          height: ((b.e - b.s) / 60) * HOUR_PX - 4,
          left: `calc(${b.lane * w}% + 4px)`,
          width: `calc(${w}% - 8px)`,
        }
        if (b.kind === 'event') Object.assign(style, EVENT_STYLE)
        if (isBlock && b.hue) {
          Object.assign(style, {
            color: b.hue,
            background: `color-mix(in srgb, ${b.hue} 15%, var(--panel))`,
            borderColor: 'transparent',
          })
        }
        const look = isBlock ? 'border-solid' : b.kind === 'event' ? 'border-solid' : 'border-dashed border-grey-line bg-grey-fill text-grey-ink'
        const live = b.kind === 'block'
        return (
          <div
            key={b.key}
            data-kind={b.kind}
            data-block={isBlock ? b.blockId : undefined}
            {...(live ? { 'data-drag-block': b.blockId, 'data-block-start': b.s, 'data-block-minutes': b.minutes } : {})}
            onClick={live ? (e) => onBlock(b.blockId!, e) : undefined}
            className={`absolute select-none overflow-hidden rounded-block border-[1.5px] leading-tight [-webkit-touch-callout:none] ${look} ${live ? 'cursor-pointer' : ''} ${b.kind === 'done' ? 'opacity-50' : ''} ${compact ? 'px-[7px] py-[5px]' : 'px-2.5 py-[7px]'}`}
            style={style}
            onContextMenu={live ? (e) => e.preventDefault() : undefined}
          >
            <b className={`block overflow-hidden text-ellipsis font-semibold ${b.kind === 'done' ? 'line-through' : ''} ${compact ? 'whitespace-nowrap text-xs' : 'text-[13px]'}`}>{b.title}</b>
            {!short && !(compact && b.e - b.s < 60) && (
              <small className="mt-[3px] block text-[11.5px] opacity-85">
                {b.detail}
                {isBlock && b.minutes && !compact ? (
                  <>
                    {', '}
                    <span data-block-len>{fmtDur(b.minutes)}</span>
                  </>
                ) : null}
              </small>
            )}
            {live && <span data-resize={b.blockId} title="Drag to change length" className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize [touch-action:none] [@media(pointer:coarse)]:h-5" />}
          </div>
        )
      })}
      {showNow && (
        <div className="pointer-events-none absolute -left-[5px] right-0 z-3 border-t-[1.5px] border-accent" style={{ top: top(nowMin) }} data-now>
          <i className="absolute -top-[5px] left-0 size-[9px] rounded-full bg-accent" />
        </div>
      )}
    </div>
  )
}

function Hours({ now, highlight }: { now: Date; highlight: boolean }) {
  return (
    <div>
      {Array.from({ length: END - START }, (_, i) => {
        const h = START + i
        return (
          <div
            key={h}
            className={`pr-2.5 text-right text-[11.5px] ${highlight && h === now.getHours() ? 'font-medium text-accent' : 'text-muted'}`}
            style={{ height: HOUR_PX, transform: 'translateY(-8px)' }}
          >
            {shortTime(toHM(h * 60))}
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  events: EventRow[]
  tasks: Task[]
  completed: Task[]
  blocks: Block[]
  projects: Project[]
  onClasses: () => void
  onLength: (blockId: string, minutes: number) => void
  onDone: (taskId: string) => void
  onRemove: (blockId: string) => void
  mode: 'day' | 'week'
  onMode: (mode: 'day' | 'week') => void
}

export function Calendar({ events, tasks, completed, blocks, projects, onClasses, onLength, onDone, onRemove, mode, onMode }: Props) {
  const [day, setDay] = useState(todayStr())
  const [card, setCard] = useState<{ blockId: string; x: number; y: number } | null>(null)
  const now = useMinuteClock()
  const scroller = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const today = todayStr()

  useEffect(() => {
    if (scrolled.current || !scroller.current) return
    scroller.current.scrollTop = Math.max(0, new Date().getHours() - START - 1) * HOUR_PX
    scrolled.current = true
  }, [])

  const projectsById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])
  const data: Data = { events, tasks, completed, blocks, projectsById }

  const week = mode === 'week'
  const ws = mondayOf(day)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws])
  const onToday = week ? days.includes(today) : day === today
  const step = week ? 7 : 1
  const fmt = (s: string) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const openBlock = (blockId: string, e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setCard({ blockId, x: r.left, y: r.bottom + 6 })
  }
  const cardBlock = card ? blocks.find((b) => b.id === card.blockId) : undefined
  const cardTask = cardBlock ? tasks.find((t) => t.id === cardBlock.taskId) : undefined

  return (
    <Panel>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-line px-3.5 py-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          {week ? (
            `${fmt(ws)} to ${fmt(days[6])}`
          ) : (
            <>
              {dayName(day)}
              <span className={`grid h-[26px] min-w-[26px] place-items-center rounded-full px-1.5 text-[12.5px] font-semibold ${day === today ? 'bg-accent text-white' : 'bg-soft text-ink'}`}>
                {parseDay(day).getDate()}
              </span>
            </>
          )}
        </div>
        <div className="flex rounded-[9px] bg-soft p-[3px]" role="group" aria-label="View">
          {(['day', 'week'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onMode(m)}
              className={`rounded-[7px] px-3 py-1 text-[13px] font-medium ${mode === m ? 'bg-panel text-ink shadow-sm' : 'text-muted'}`}
            >
              {m === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
        <div className="flex justify-self-end gap-1.5">
          <button type="button" onClick={onClasses} className="h-[30px] rounded-lg border border-line bg-panel px-2.5 text-[13px] font-medium">
            Schedule
          </button>
          {!onToday && (
            <button type="button" onClick={() => setDay(today)} className="h-[30px] rounded-lg border border-line bg-panel px-2.5 text-[13px] font-medium">
              Today
            </button>
          )}
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir < 0 ? 'Previous' : 'Next'}
              onClick={() => setDay(addDays(day, step * dir))}
              className="grid size-[30px] place-items-center rounded-lg border border-line bg-panel text-ink2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={dir < 0 ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} />
              </svg>
            </button>
          ))}
        </div>
      </div>
      {!week && deadlinesOn(day, tasks).length > 0 && (
        <div className="border-b border-line px-3.5 py-2">
          <DeadlineChips items={deadlinesOn(day, tasks)} compact={false} />
        </div>
      )}
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto" data-calscroll>
        {week ? (
          <div className="grid pb-5 pr-3 pt-0" style={{ gridTemplateColumns: '52px repeat(7, minmax(90px, 1fr))', minWidth: 760 }}>
            <div className="sticky top-0 z-4 border-b border-line bg-panel" />
            {days.map((d) => (
              <div key={d} className="sticky top-0 z-4 border-b border-line bg-panel pb-2 pt-2.5 text-center text-xs font-medium text-muted">
                {dayName(d)}
                <b className={`mx-auto mt-1 grid size-7 place-items-center rounded-full text-sm font-semibold ${d === today ? 'bg-accent text-white' : 'text-ink'}`}>
                  {parseDay(d).getDate()}
                </b>
                <DeadlineChips items={deadlinesOn(d, tasks)} compact />
              </div>
            ))}
            <div className="pt-2.5">
              <Hours now={now} highlight />
            </div>
            {days.map((d) => (
              <div key={d} className="pt-2.5">
                <Lane day={d} compact data={data} now={now} onBlock={openBlock} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[52px_1fr] pb-5 pr-3 pt-2.5">
            <Hours now={now} highlight={day === today} />
            <Lane day={day} compact={false} data={data} now={now} onBlock={openBlock} />
          </div>
        )}
      </div>
      {card && cardBlock && cardTask && (
        <BlockCard
          task={cardTask}
          projectName={projectsById[cardTask.projectId]?.inbox ? 'Unsorted' : (projectsById[cardTask.projectId]?.name ?? '')}
          minutes={cardBlock.minutes}
          x={card.x}
          y={card.y}
          onLength={(m) => onLength(cardBlock.id, m)}
          onDone={() => {
            setCard(null)
            onDone(cardTask.id)
          }}
          onRemove={() => {
            setCard(null)
            onRemove(cardBlock.id)
          }}
          onClose={() => setCard(null)}
        />
      )}
    </Panel>
  )
}
