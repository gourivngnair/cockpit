import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dragLock } from '../ui/dragLock'
import { useToast } from '../ui/toastContext'

/** A planned stretch of work on a task. Lives only in Cockpit (Supabase `blocks`). */
export interface Block {
  id: string
  taskId: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  minutes: number
}

interface DbRow {
  id: string
  task_id: string
  date: string
  start_time: string
  minutes: number
}

const fromDb = (r: DbRow): Block => ({ id: r.id, taskId: r.task_id, date: r.date, start: r.start_time.slice(0, 5), minutes: r.minutes })

/** Invariant 5: every write sends the whole record, never a partial update. */
const toDb = (b: Block) => ({ task_id: b.taskId, date: b.date, start_time: b.start, minutes: b.minutes })

export function useBlocks() {
  const toast = useToast()
  const [blocks, setBlocks] = useState<Block[]>([])
  const ref = useRef(blocks)
  useEffect(() => {
    ref.current = blocks
  }, [blocks])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('blocks').select('id,task_id,date,start_time,minutes')
    if (error) return toast('Could not load your blocks.')
    await dragLock.whenIdle() // never swap blocks under a drag or resize in progress
    setBlocks((data as DbRow[]).map(fromDb))
  }, [toast])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
    const ch = supabase
      .channel('blocks-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, () => void refetch())
      .subscribe()
    const onVisible = () => !document.hidden && void refetch()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(ch)
    }
  }, [refetch])

  const create = useCallback(
    async (input: Omit<Block, 'id'>) => {
      const block: Block = { id: crypto.randomUUID(), ...input }
      setBlocks((b) => [...b, block])
      const { error } = await supabase.from('blocks').insert({ id: block.id, ...toDb(block) })
      if (error) {
        setBlocks((b) => b.filter((x) => x.id !== block.id))
        toast('Could not save that block.')
        return null
      }
      return block
    },
    [toast],
  )

  /** Moves and/or resizes a block, writing the whole row. */
  const update = useCallback(
    async (next: Block) => {
      const before = ref.current.find((b) => b.id === next.id)
      if (!before) return false
      setBlocks((b) => b.map((x) => (x.id === next.id ? next : x)))
      const { error } = await supabase.from('blocks').update({ ...toDb(next), updated_at: new Date().toISOString() }).eq('id', next.id)
      if (error) {
        setBlocks((b) => b.map((x) => (x.id === next.id ? before : x)))
        toast('Could not save that change. The block is back where it was.')
        return false
      }
      return true
    },
    [toast],
  )

  const remove = useCallback(
    async (id: string) => {
      const before = ref.current
      setBlocks((b) => b.filter((x) => x.id !== id))
      const { error } = await supabase.from('blocks').delete().eq('id', id)
      if (error) {
        setBlocks(before)
        toast('Could not remove that block.')
        return false
      }
      return true
    },
    [toast],
  )

  return { blocks, create, update, remove }
}
