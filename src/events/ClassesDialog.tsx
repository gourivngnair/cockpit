import { useMemo, useState } from 'react'
import { dayName, shortTime, parseDay } from '../lib/dates'
import { parseSchedule, weeksOf } from './parse'
import type { EventRow } from './useEvents'
import type { NewEvent } from './parse'

interface Props {
  events: EventRow[]
  onReplace: (incoming: NewEvent[]) => Promise<boolean>
  onRemove: (id: string) => void
  onClose: () => void
}

export function ClassesDialog({ events, onReplace, onRemove, onClose }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => (text.trim() ? parseSchedule(text) : null), [text])

  const replacing = useMemo(() => {
    if (!parsed || parsed.events.length === 0) return 0
    const weeks = weeksOf(parsed.events)
    return events.filter((e) => weeks.some(([a, b]) => e.date >= a && e.date <= b)).length
  }, [parsed, events])

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const canImport = parsed && parsed.errors.length === 0 && parsed.events.length > 0

  async function doImport() {
    if (!parsed || !canImport) return
    setBusy(true)
    const ok = await onReplace(parsed.events)
    setBusy(false)
    if (ok) setText('')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Classes"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-panel border border-line bg-panel shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="m-0 text-base font-semibold">Classes</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1 text-ink2 hover:bg-soft">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <h3 className="m-0 mb-1 text-[13px] font-semibold text-ink2">Import a week</h3>
          <p className="m-0 mb-2 text-[13px] text-muted">
            Send Claude a screenshot of your schedule, then paste what it gives you here. Importing replaces any classes already saved in those weeks.
          </p>
          <textarea
            aria-label="Schedule from Claude"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder='[{"title":"Strategy","date":"2026-10-05","start":"09:00","end":"10:30","room":"B12"}]'
            className="w-full resize-y rounded-[10px] border border-line bg-soft p-2.5 font-mono text-xs"
          />
          {parsed && parsed.errors.length > 0 && (
            <ul role="alert" className="m-0 mt-2 list-disc pl-5 text-[13px] text-accent">
              {parsed.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {canImport && (
            <p className="m-0 mt-2 text-[13px] text-ink2">
              {parsed.events.length} {parsed.events.length === 1 ? 'class' : 'classes'} ready
              {replacing > 0 ? `, replacing ${replacing} saved ${replacing === 1 ? 'class' : 'classes'}` : ''}.
            </p>
          )}
          <button
            type="button"
            disabled={!canImport || busy}
            onClick={doImport}
            className="mt-3 rounded-[10px] bg-ink px-4 py-2 font-semibold text-panel disabled:opacity-40"
          >
            {busy ? 'Saving' : 'Import'}
          </button>

          <h3 className="m-0 mb-1 mt-6 text-[13px] font-semibold text-ink2">Saved classes</h3>
          {sorted.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No classes yet.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {sorted.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-line py-2 text-[13.5px] last:border-b-0">
                  <span className="w-[88px] text-muted">
                    {dayName(e.date)} {parseDay(e.date).getDate()}/{parseDay(e.date).getMonth() + 1}
                  </span>
                  <span className="flex-1">
                    <b className="font-semibold">{e.title}</b>
                    <span className="text-muted">
                      {' '}
                      {shortTime(e.start)} to {shortTime(e.end)}
                      {e.room ? `, ${e.room}` : ''}
                    </span>
                  </span>
                  <button type="button" aria-label={`Remove ${e.title}`} onClick={() => onRemove(e.id)} className="text-muted hover:text-accent">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
