import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../ui/toastContext'
import { MAX_FILES, checkFile, processImage, thumbPath } from './resize'

export const UNSORTED = 'Unsorted'
const BUCKET = 'vision'
const CACHE = 'cockpit-vision-rows'

/** One picture on the vision board. `path` is the main copy; the small copy sits beside it. */
export interface VisionImage {
  id: string
  path: string
  caption: string
  theme: string
  createdAt: string
  width: number
  height: number
  pinnedOn: string | null
}

interface Row {
  id: string
  storage_path: string
  caption: string
  theme: string
  created_at: string
  width: number
  height: number
  pinned_on: string | null
}

const fromRow = (r: Row): VisionImage => ({
  id: r.id,
  path: r.storage_path,
  caption: r.caption,
  theme: r.theme,
  createdAt: r.created_at,
  width: r.width,
  height: r.height,
  pinnedOn: r.pinned_on,
})

function readCache(): VisionImage[] {
  try {
    const raw = localStorage.getItem(CACHE)
    return raw ? (JSON.parse(raw) as VisionImage[]) : []
  } catch {
    return []
  }
}

export interface UploadResult {
  added: number
  failed: Array<{ name: string; reason: string }>
}

export function useVision() {
  const toast = useToast()
  // The last known list is kept on the device, so the board (and today's image) still show offline.
  const [images, setImages] = useState<VisionImage[]>(readCache)
  const [loaded, setLoaded] = useState(false)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const ref = useRef(images)
  useEffect(() => {
    ref.current = images
  }, [images])

  const store = useCallback((next: VisionImage[]) => {
    ref.current = next
    setImages(next)
    try {
      localStorage.setItem(CACHE, JSON.stringify(next))
    } catch {
      /* the saved copy is a convenience */
    }
  }, [])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('vision').select('id,storage_path,caption,theme,created_at,width,height,pinned_on')
    if (error) return // keep showing the saved copy
    store((data as Row[]).map(fromRow))
    setLoaded(true)
  }, [store])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch()
    const channel = supabase
      .channel('vision-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vision' }, () => void refetch())
      .subscribe()
    const onVisible = () => !document.hidden && void refetch()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  /** Resize, upload both copies, then save the row. If any step fails, nothing is left behind. */
  const upload = useCallback(
    async (files: File[]): Promise<UploadResult> => {
      const result: UploadResult = { added: 0, failed: [] }
      const list = files.slice(0, MAX_FILES)
      for (const f of files.slice(MAX_FILES)) result.failed.push({ name: f.name, reason: `only ${MAX_FILES} at a time` })
      const userId = (await supabase.auth.getSession()).data.session?.user.id
      if (!userId) {
        for (const f of list) result.failed.push({ name: f.name, reason: 'not signed in' })
        return result
      }

      setUploading({ done: 0, total: list.length })
      for (const [i, file] of list.entries()) {
        const bad = checkFile(file)
        if (bad) {
          result.failed.push({ name: file.name, reason: bad })
          setUploading({ done: i + 1, total: list.length })
          continue
        }
        const id = crypto.randomUUID()
        const path = `${userId}/${id}.jpg`
        const uploaded: string[] = []
        try {
          const img = await processImage(file)
          const main = await supabase.storage.from(BUCKET).upload(path, img.main, { contentType: 'image/jpeg' })
          if (main.error) throw main.error
          uploaded.push(path)
          const thumb = await supabase.storage.from(BUCKET).upload(thumbPath(path), img.thumb, { contentType: 'image/jpeg' })
          if (thumb.error) throw thumb.error
          uploaded.push(thumbPath(path))
          const { error } = await supabase.from('vision').insert({ id, storage_path: path, caption: '', theme: UNSORTED, width: img.width, height: img.height })
          if (error) throw error
          result.added++
        } catch (e) {
          if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded) // leave nothing half-saved
          result.failed.push({ name: file.name, reason: e instanceof Error && e.message ? e.message : 'upload failed' })
        }
        setUploading({ done: i + 1, total: list.length })
      }
      setUploading(null)
      await refetch()
      return result
    },
    [refetch],
  )

  /** Change an image's caption or theme: shown at once, rolled back if it cannot be saved. */
  const update = useCallback(
    async (id: string, patch: { caption?: string; theme?: string }): Promise<boolean> => {
      const before = ref.current
      store(before.map((i) => (i.id === id ? { ...i, ...patch } : i)))
      const { error } = await supabase.from('vision').update(patch).eq('id', id)
      if (error) {
        store(before)
        toast('Could not save that change.')
        return false
      }
      return true
    },
    [store, toast],
  )

  /** Delete the row, then the files. Not undoable, so the caller asks first. */
  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const before = ref.current
      const target = before.find((i) => i.id === id)
      if (!target) return false
      store(before.filter((i) => i.id !== id))
      const { error } = await supabase.from('vision').delete().eq('id', id)
      if (error) {
        store(before)
        toast('Could not remove that image.')
        return false
      }
      await supabase.storage.from(BUCKET).remove([target.path, thumbPath(target.path)]) // best effort: a stray private file is harmless
      return true
    },
    [store, toast],
  )

  /** Pin an image as today's vision (or clear the pin with null). One pin per day. */
  const pin = useCallback(
    async (id: string | null, today: string): Promise<boolean> => {
      const before = ref.current
      store(before.map((i) => ({ ...i, pinnedOn: i.id === id ? today : i.pinnedOn === today ? null : i.pinnedOn })))
      const cleared = await supabase.from('vision').update({ pinned_on: null }).eq('pinned_on', today)
      const set = id && !cleared.error ? await supabase.from('vision').update({ pinned_on: today }).eq('id', id) : null
      if (cleared.error || set?.error) {
        store(before)
        toast('Could not pin that image.')
        return false
      }
      return true
    },
    [store, toast],
  )

  return { images, loaded, uploading, upload, update, remove, pin }
}
