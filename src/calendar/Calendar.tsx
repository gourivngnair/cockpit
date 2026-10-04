import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventRow } from '../events/useEvents'
import { addDays, dayName, mondayOf, parseDay, shortTime, toHM, toMin, todayStr } from '../lib/dates'
import type { Task } from '../tasks'
import { Panel } from '../ui/Shell'
import { layout } from './layout'

export const START = 7 // 7 am
export const END = 24 // midnight
const HOUR_PX = 64
const MIN_VISIBLE = 22 // minutes; keeps very short items readable

interface Item {
  kind: 'ev' | 'rt'
  key: string
  title: string
  detail: string
  s: number
  e: number
}

function itemsFor(day: string, events: EventRow[], tasks: Task[]): Item[] {
  const out: Item[] = []
  for (const e of events) {
    if (e.date !== day) continue
    const s = toMin(e.start)
    const end = toMin(e.end)
    out.push({
      kind: 'ev',
      key: `ev-${e.id}`,
      title: e.title,
      detail: `${shortTime(e.start)} to ${shortTime(e.end)}${e.room ? `, ${e.room}` : ''}`,
      s,
      e: Math.max(end, s + MIN_VISIBLE),
    })
  }
  for (const t of tasks) {
    if (!t.recurring || t.due?.date !== day || !t.due.time) continue
    const s = toMin(t.due.time)
    const dur = t.durationMin ?? 30
    out.push({ kind: 'rt', key: `rt-${t.id}`, title: t.content, detail: shortTime(t.due.time), s, e: Math.max(s + dur, s + MIN_VISIBLE) })
  }
  return out.filter((i) => i.s >= START * 60 && i.s < END * 60)
}

function deadlinesFor(day: string, tasks: Task[]) {
  return tasks
    .filter((t) => !t.recurring && t.due?.date === day && t.due.time)
    .map((t) => ({ id: t.id, title: t.content, min: toMin(t.due!.time!), time: t.due!.time! }))
    .filter((d) => d.min >= START * 60 && d.min < END * 60)
}

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Lane({ day, compact, events, tasks, now }: { day: string; compact: boolean; events: EventRow[]; tasks: Task[]; now: Date }) {
  const hours = END - START
  const placed = layout(itemsFor(day, events, tasks))
  const deadlines = deadlinesFor(day, tasks)
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
        return (
          <div
            key={b.key}
            data-kind={b.kind}
            className={`absolute overflow-hidden rounded-block border-[1.5px] border-dashed border-grey-line bg-grey-fill leading-tight text-grey-ink ${compact ? 'px-[7px] py-[5px]' : 'px-2.5 py-[7px]'}`}
            style={{ top: top(b.s) + 2, height: ((b.e - b.s) / 60) * HOUR_PX - 4, left: `calc(${b.lane * w}% + 4px)`, width: `calc(${w}% - 8px)` }}
          >
            <b className={`block overflow-hidden text-ellipsis font-semibold ${compact ? 'whitespace-nowrap text-xs' : 'text-[13px]'}`}>{b.title}</b>
            {!short && !(compact && b.e - b.s < 60) && <small className="mt-[3px] block text-[11.5px] opacity-85">{b.detail}</small>}
          </div>
        )
      })}
      {deadlines.map((d) => (
        <div key={d.id} className="pointer-events-none absolute inset-x-0 z-2 border-t" style={{ top: top(d.min), borderTopColor: 'color-mix(in srgb, var(--red) 60%, transparent)' }} data-deadline={d.id}>
          <span className="absolute -top-[9px] right-1.5 max-w-[90%] truncate bg-panel px-[5px] text-[11px] font-medium text-accent">
            {compact ? 'Due' : `Due ${shortTime(d.time)}, ${d.title}`}
          </span>
        </div>
      ))}
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

export function Calendar({ events, tasks, onClasses }: { events: EventRow[]; tasks: Task[]; onClasses: () => void }) {
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [day, setDay] = useState(todayStr())
  const now = useMinuteClock()
  const scroller = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const today = todayStr()

  useEffect(() => {
    if (scrolled.current || !scroller.current) return
    scroller.current.scrollTop = Math.max(0, new Date().getHours() - START - 1) * HOUR_PX
    scrolled.current = true
  }, [])

  const week = mode === 'week'
  const ws = mondayOf(day)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws])
  const onToday = week ? days.includes(today) : day === today
  const step = week ? 7 : 1
  const fmt = (s: string) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

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
              onClick={() => setMode(m)}
              className={`rounded-[7px] px-3 py-1 text-[13px] font-medium ${mode === m ? 'bg-panel text-ink shadow-sm' : 'text-muted'}`}
            >
              {m === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
        <div className="flex justify-self-end gap-1.5">
          <button type="button" onClick={onClasses} className="h-[30px] rounded-lg border border-line bg-panel px-2.5 text-[13px] font-medium">
            Classes
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
              </div>
            ))}
            <div className="pt-2.5">
              <Hours now={now} highlight />
            </div>
            {days.map((d) => (
              <div key={d} className="pt-2.5">
                <Lane day={d} compact events={events} tasks={tasks} now={now} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[52px_1fr] pb-5 pr-3 pt-2.5">
            <Hours now={now} highlight={day === today} />
            <Lane day={day} compact={false} events={events} tasks={tasks} now={now} />
          </div>
        )}
      </div>
    </Panel>
  )
}
