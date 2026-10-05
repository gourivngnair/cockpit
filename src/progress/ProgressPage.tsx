import type { ReactNode } from 'react'
import { addDays, dayName, parseDay, todayStr } from '../lib/dates'
import {
  BRADBURY_GOAL,
  GYM_TARGET,
  TERM,
  blackoutOn,
  daysBetween,
  daysDone,
  dietStats,
  fmtMinutes,
  focusStats,
  gpaStats,
  lastDays,
  lastFourWeeks,
  lifeAdminStats,
  milestones,
  streak,
  tasksDoneThisWeek,
  termWeek,
  thisWeek,
  writerStats,
  type DoneItem,
  type FocusItem,
  type OpenItem,
  type WeekCount,
} from './stats'

const nice = (d: string) => parseDay(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

interface Props {
  done: DoneItem[]
  open: OpenItem[]
  focus: FocusItem[]
  diet: Record<string, boolean>
  /** Colour for a goal, by its name. */
  hue: (goal: string) => string
  onDiet: (date: string, value: boolean | null) => void
  onRefresh: () => void
  today?: string
}

function Stat({ label, big, small }: { label: string; big: string; small: string }) {
  return (
    <div data-stat={label} className="rounded-xl px-3.5 py-3" style={{ background: 'color-mix(in srgb, var(--h) 9%, var(--panel))' }}>
      <b className="block text-[22px] font-bold tabular-nums tracking-[-0.02em]" style={{ color: 'var(--h)' }}>
        {big}
      </b>
      <span className="text-[12.5px] text-ink2">{small}</span>
    </div>
  )
}

function Heading({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <h4 className="mb-2 mt-4 flex items-baseline gap-2 text-xs font-semibold tracking-[0.02em] text-muted">
      {children}
      {note && <span className="text-[12.5px] font-normal">{note}</span>}
    </h4>
  )
}

function Card({ name, hue, children, focusMinutes }: { name: string; hue: string; children: ReactNode; focusMinutes: number }) {
  return (
    <section data-card={name} className="rounded-panel border border-line border-t-[3px] bg-panel px-5 py-[18px]" style={{ ['--h' as string]: hue, borderTopColor: hue }}>
      <header className="mb-3.5 flex items-center gap-2.5">
        <span className="grid size-[26px] place-items-center rounded-lg text-xs font-bold" style={{ color: hue, background: `color-mix(in srgb, ${hue} 15%, var(--panel))` }}>
          {name.charAt(0)}
        </span>
        <h3 className="m-0 text-base font-semibold">{name}</h3>
      </header>
      {children}
      <p data-focus-line className="m-0 mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
        Focused this week: <b className="font-semibold text-ink2">{fmtMinutes(focusMinutes)}</b>
      </p>
    </section>
  )
}

/** A row of day dots. `state` gives each day's look: true done, false missed, null nothing. */
function Dots({ days, state, today, label, onPick }: { days: string[]; state: (d: string) => boolean | null; today: string; label: string; onPick?: (d: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[5px]" data-dots={label}>
      {days.map((d) => {
        const v = state(d)
        const cls = `size-4 rounded-[5px] border ${v === true ? 'border-[var(--h)] bg-[var(--h)]' : v === false ? 'border-transparent' : 'border-line bg-soft'} ${d === today ? 'outline outline-2 outline-offset-1' : ''}`
        const style = {
          ...(v === false ? { background: 'color-mix(in srgb, var(--red) 18%, var(--panel))' } : null),
          ...(d === today ? { outlineColor: 'color-mix(in srgb, var(--h) 45%, transparent)' } : null),
        }
        const title = `${dayName(d, { weekday: 'short', day: 'numeric', month: 'short' })}${v === true ? ', done' : v === false ? ', missed' : ''}`
        return onPick ? (
          <button key={d} type="button" title={title} aria-label={title} data-day={d} data-state={String(v)} onClick={() => onPick(d)} className={cls} style={style} />
        ) : (
          <i key={d} title={title} data-day={d} data-state={String(v)} className={cls} style={style} />
        )
      })}
    </div>
  )
}

function WeekBars({ weeks, max, format, label }: { weeks: WeekCount[]; max: number; format: (n: number) => string; label: string }) {
  return (
    <div className="flex h-[74px] items-end gap-2.5" data-bars={label}>
      {weeks.map((w) => (
        <div key={w.monday} className="flex h-full flex-1 flex-col items-center justify-end gap-[5px]">
          <i
            className="block min-h-[3px] w-full max-w-[46px] rounded-t-md rounded-b-[3px] opacity-85"
            style={{ height: `${Math.min(1, w.count / Math.max(1, max)) * 100}%`, background: 'var(--h)' }}
            data-count={w.count}
          />
          <span className="text-[11.5px] text-muted">{w.isThisWeek ? 'This wk' : format(w.count)}</span>
        </div>
      ))}
    </div>
  )
}

export function ProgressPage({ done, open, focus, diet, hue, onDiet, onRefresh, today = todayStr() }: Props) {
  const week = termWeek(today)
  const toBlackout = daysBetween(today, TERM.blackout)
  const gpa = gpaStats(done, today)
  const gym = daysDone(done, 'gym')
  const routine = daysDone(done, 'morning-routine')
  const writer = writerStats(done, today)
  const nights = daysDone(done, 'bradbury', TERM.start)
  const diet14 = lastDays(14, today)
  const dietNow = dietStats(diet, today)
  const f = focusStats(focus, today)
  const goalFocus = (g: string) => f.byGoalThisWeek[g] ?? 0
  const gymWeeks = lastFourWeeks(gym, today)
  const excel = milestones(open, done, 'Excel Outside Class', today)
  const admin = lifeAdminStats(open, done, 'Life Admin', today)
  const fourWeekMax = Math.max(60, ...f.weeks.map((w) => w.count))
  const yesterday = addDays(today, -1)

  const answer = (d: string, v: boolean) => onDiet(d, diet[d] === v ? null : v) // tapping the chosen answer clears it
  const cycle = (d: string) => onDiet(d, diet[d] === undefined ? true : diet[d] ? false : null) // dot: none, clean, not really, none

  return (
    <div className="h-full overflow-auto rounded-panel border border-line bg-panel px-[30px] py-7" data-progress-page>
      <div className="mb-[18px] flex flex-wrap items-end gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">Progress</h1>
          <p data-subtitle className="m-0 mt-1 text-muted">
            {today < TERM.start ? `Term 2 starts ${nice(TERM.start)}` : `Term 2, week ${week}`}
            {toBlackout > 0 ? ` · ${plural(toBlackout, 'day')} to the blackout` : toBlackout > -30 ? ' · Blackout on, end-terms first' : ''}
          </p>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3.5 py-2 font-medium">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
          </svg>
          Refresh
        </button>
      </div>

      <section data-card="This week" aria-label="This week" className="mb-3.5 grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 rounded-panel border border-line bg-soft p-3.5" style={{ ['--h' as string]: '#5B6B7F' }}>
        <Stat label="Tasks done this week" big={String(tasksDoneThisWeek(done, today))} small="Tasks done this week" />
        <Stat label="Focus today" big={fmtMinutes(f.today)} small="Focused today" />
        <Stat label="Focus this week" big={fmtMinutes(f.week)} small="Focused this week" />
        <Stat label="Gym this week" big={`${thisWeek(gym, today)} / ${GYM_TARGET}`} small="Gym this week" />
        <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'color-mix(in srgb, var(--h) 9%, var(--panel))' }}>
          <WeekBars weeks={f.weeks} max={fourWeekMax} format={fmtMinutes} label="Focus, last 4 weeks" />
          <span className="text-[12.5px] text-ink2">Focus, last 4 weeks</span>
        </div>
      </section>

      <div className="grid max-w-[1200px] grid-cols-1 gap-3.5 min-[980px]:grid-cols-2">
        <Card name="Term 2 GPA" hue={hue('Term 2 GPA')} focusMinutes={goalFocus('Term 2 GPA')}>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Hard-course reviews" big={today < TERM.firstReview ? `Starts ${nice(TERM.firstReview)}` : `${gpa.reviewsDone} / ${gpa.reviewsDue}`} small="Hard-course reviews" />
            <Stat label="Assignments on time" big={gpa.assignmentsDone ? `${gpa.assignmentsOnTime} / ${gpa.assignmentsDone}` : 'None yet'} small="Assignments on time" />
          </div>
        </Card>

        <Card name="Excel Outside Class" hue={hue('Excel Outside Class')} focusMinutes={goalFocus('Excel Outside Class')}>
          <ul className="m-0 list-none p-0" data-milestones>
            {excel.length === 0 && <li className="py-2 text-[13.5px] text-muted">No milestones yet.</li>}
            {excel.map((m, i) => (
              <li key={`${m.title}-${i}`} data-milestone={m.done ? 'done' : m.late ? 'late' : 'open'} className="flex items-center gap-2.5 border-b border-line py-2 text-[13.5px] last:border-b-0">
                <i className="size-3.5 flex-none rounded-full border-2" style={m.done ? { background: 'var(--h)', borderColor: 'var(--h)' } : { borderColor: 'var(--grey-line)' }} />
                <span className={`flex-1 ${m.done ? 'text-muted line-through' : ''}`}>{m.title}</span>
                <em className={`text-xs not-italic ${m.late ? 'text-accent' : 'text-muted'}`}>{m.done ? 'Done' : m.date ? `${m.late ? 'Overdue, ' : ''}${nice(m.date)}` : ''}</em>
              </li>
            ))}
          </ul>
          <p data-blackout className="m-0 mt-2.5 text-[12.5px] text-muted">
            {blackoutOn(today) ? 'Blackout is on: no new competitions or club commitments.' : `One competition this term. No new commitments after ${nice(TERM.blackout)}.`}
          </p>
        </Card>

        <Card name="55 kg and Healthy" hue={hue('55 kg and Healthy')} focusMinutes={goalFocus('55 kg and Healthy')}>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Gym this week" big={`${thisWeek(gym, today)} / ${GYM_TARGET}`} small="Gym this week" />
            <Stat label="Morning routine streak" big={plural(streak(routine, today), 'day')} small="Morning routine streak" />
          </div>
          <Heading>Gym, last 4 weeks</Heading>
          <WeekBars weeks={gymWeeks} max={GYM_TARGET} format={String} label="Gym, last 4 weeks" />
          <Heading>Morning routine, 14 days</Heading>
          <Dots days={diet14} today={today} label="Morning routine" state={(d) => (routine.has(d) ? true : null)} />
          <Heading note={dietNow.answered ? `${dietNow.yes} of ${dietNow.answered} answered days` : undefined}>Clean diet, 14 days</Heading>
          <Dots days={diet14} today={today} label="Clean diet" state={(d) => (diet[d] === undefined ? null : diet[d])} onPick={cycle} />
          <div className="mt-2.5 grid gap-1.5" data-diet-form>
            {(
              [
                ['Yesterday', yesterday],
                ['Today', today],
              ] as const
            ).map(([label, d]) => (
              <div key={d} className="flex items-center gap-1.5" data-diet-row={label}>
                <span className="w-20 text-[13px] text-ink2">{label}</span>
                <button
                  type="button"
                  aria-pressed={diet[d] === true}
                  onClick={() => answer(d, true)}
                  className={`rounded-full border px-3 py-1 text-[12.5px] ${diet[d] === true ? 'border-[var(--h)] bg-[var(--h)] text-white' : 'border-line bg-panel'}`}
                >
                  Clean
                </button>
                <button
                  type="button"
                  aria-pressed={diet[d] === false}
                  onClick={() => answer(d, false)}
                  className={`rounded-full border px-3 py-1 text-[12.5px] ${diet[d] === false ? 'border-accent bg-accent text-white' : 'border-line bg-panel'}`}
                >
                  Not really
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card name="Better Writer" hue={hue('Better Writer')} focusMinutes={goalFocus('Better Writer')}>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Bradbury nights" big={`${writer.nights} / ${BRADBURY_GOAL.toLocaleString('en-US')}`} small="Bradbury nights" />
            <Stat label="Current streak" big={plural(writer.streak, 'night')} small="Current streak" />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded bg-soft" aria-hidden="true">
            <i className="block h-full rounded" style={{ width: `${Math.min(100, (100 * writer.nights) / BRADBURY_GOAL)}%`, background: 'var(--h)' }} />
          </div>
          <Heading>Bradbury, 14 nights</Heading>
          <Dots days={diet14} today={today} label="Bradbury" state={(d) => (nights.has(d) ? true : null)} />
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <Stat label="Essays published" big={String(writer.essays)} small="Essays published" />
            <Stat label="Books finished" big={String(writer.books)} small="Books finished" />
          </div>
        </Card>

        <Card name="Life Admin" hue={hue('Life Admin')} focusMinutes={goalFocus('Life Admin')}>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Done this week" big={String(admin.doneThisWeek)} small="Done this week" />
            <Stat label="Overdue" big={String(admin.overdue)} small="Overdue" />
            <Stat label="Open" big={String(admin.open)} small="Open" />
          </div>
        </Card>
      </div>

      <p className="mt-[18px] text-[12.5px] text-muted">Counts come from what you tick off in Todoist or Cockpit, from {nice(TERM.start)} on. Clean diet is the only thing you enter by hand.</p>
    </div>
  )
}
