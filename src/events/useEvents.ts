import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../ui/toastContext'
import { weeksOf, type NewEvent } from './parse'

export interface EventRow {
  id: string
  title: string
  date: string
  start: string // HH:MM
  end: string // HH:MM
  room: string
  kind: 'class' | 'event'
}

interface DbRow {
  id: string
  title: string
  date: string
  start_time: string
  end_time: string
  room: string
  kind: 'class' | 'event'
}

const fromDb = (r: DbRow): EventRow => ({
  id: r.id,
  title: r.title,
  date: r.date,
  start: r.start_time.slice(0, 5),
  end: r.end_time.slice(0, 5),
  room: r.room,
  kind: r.kind,
})

export function useEvents() {
  const toast = useToast()
  const [events, setEvents] = useState<EventRow[]>([])
  const eventsRef = useRef(events)
  useEffect(() => {
    eventsRef.current = events
  }, [events])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('id,title,date,start_time,end_time,room,kind')
    if (error) return toast('Could not load classes.')
    setEvents((data as DbRow[]).map(fromDb))
  }, [toast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
    const ch = supabase
      .channel('events-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => void refetch())
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [refetch])

  /** Replace every class in the weeks touched by `incoming` with `incoming`. */
  const replaceWeeks = useCallback(
    async (incoming: NewEvent[]) => {
      const before = eventsRef.current
      const weeks = weeksOf(incoming)
      const inWeeks = (d: string) => weeks.some(([a, b]) => d >= a && d <= b)
      const optimistic: EventRow[] = incoming.map((e, i) => ({
        id: `tmp-${i}`,
        title: e.title,
        date: e.date,
        start: e.start,
        end: e.end,
        room: e.room,
        kind: e.kind,
      }))
      setEvents([...before.filter((e) => !inWeeks(e.date)), ...optimistic])
      try {
        // Insert first, then remove the old rows by id, so a failure never loses classes.
        const oldIds = before.filter((e) => inWeeks(e.date)).map((e) => e.id)
        const { error } = await supabase.from('events').insert(
          incoming.map((e) => ({ title: e.title, date: e.date, start_time: e.start, end_time: e.end, room: e.room, kind: e.kind })),
        )
        if (error) throw error
        if (oldIds.length) {
          const { error: delError } = await supabase.from('events').delete().in('id', oldIds)
          if (delError) throw delError
        }
        await refetch()
        return true
      } catch {
        setEvents(before)
        toast('Could not save the schedule. Nothing was changed on screen.')
        void refetch()
        return false
      }
    },
    [refetch, toast],
  )

  const remove = useCallback(
    async (id: string) => {
      const before = eventsRef.current
      setEvents(before.filter((e) => e.id !== id))
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) {
        setEvents(before)
        toast('Could not remove the class.')
      }
    },
    [toast],
  )

  return { events, replaceWeeks, remove }
}
