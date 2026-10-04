import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * The image files are private, so each is shown through a short-lived secure link. Links are made
 * in batches, kept for reuse, and renewed shortly before they expire.
 */
const TTL = 3600 // seconds
const RENEW_BEFORE = 300 // seconds

const links = new Map<string, { url: string; expires: number }>()
const asking = new Set<string>()
// Every screen that shows a link is told when links arrive, whichever of them asked for them.
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

const fresh = (path: string) => {
  const l = links.get(path)
  return l !== undefined && l.expires - Date.now() > RENEW_BEFORE * 1000
}

export function useSignedUrls(paths: string[]): Record<string, string> {
  const [, bump] = useState(0)
  const key = [...new Set(paths)].sort().join('|')

  useEffect(() => {
    const onArrive = () => bump((n) => n + 1)
    listeners.add(onArrive)
    return () => void listeners.delete(onArrive)
  }, [])

  useEffect(() => {
    const wanted = key ? key.split('|') : []
    const need = wanted.filter((p) => !fresh(p) && !asking.has(p))
    if (need.length === 0) return
    need.forEach((p) => asking.add(p))
    void supabase.storage
      .from('vision')
      .createSignedUrls(need, TTL)
      .then(({ data }) => {
        for (const item of data ?? []) {
          if (item.path && item.signedUrl && !item.error) links.set(item.path, { url: item.signedUrl, expires: Date.now() + TTL * 1000 })
        }
        notify()
      })
      .catch(() => {
        /* offline: the images already on screen or in the saved copy are used instead */
      })
      .finally(() => need.forEach((p) => asking.delete(p)))
  }, [key])

  // Renew links before they run out, so a board left open for hours keeps working.
  useEffect(() => {
    const id = setInterval(notify, ((TTL - RENEW_BEFORE) * 1000) / 2)
    return () => clearInterval(id)
  }, [])

  const out: Record<string, string> = {}
  for (const p of key ? key.split('|') : []) {
    const l = links.get(p)
    if (l) out[p] = l.url
  }
  return out
}
