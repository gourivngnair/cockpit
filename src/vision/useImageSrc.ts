import { useCallback, useEffect, useState } from 'react'

const CACHE = 'cockpit-vision-images'

/** Keep a copy of this image on the device, and forget copies of any others (only today's is kept). */
async function remember(id: string, url: string) {
  try {
    const cache = await caches.open(CACHE)
    for (const req of await cache.keys()) if (!req.url.endsWith(`/vision-cache/${id}`)) await cache.delete(req)
    if (await cache.match(`/vision-cache/${id}`)) return
    const res = await fetch(url)
    if (res.ok) await cache.put(`/vision-cache/${id}`, res)
  } catch {
    /* the saved copy is a convenience */
  }
}

async function recall(id: string): Promise<string | null> {
  try {
    const res = await (await caches.open(CACHE)).match(`/vision-cache/${id}`)
    return res ? URL.createObjectURL(await res.blob()) : null
  } catch {
    return null
  }
}

/**
 * The address to show an image from. Normally the secure link; its copy is kept on the device so
 * today's image still shows with no connection (when the link fails or cannot be made).
 */
export function useImageSrc(id: string | null, url: string | undefined): { src: string | null; onError: () => void } {
  const [saved, setSaved] = useState<{ id: string; src: string } | null>(null)

  useEffect(() => {
    if (!id) return
    if (url) void remember(id, url)
    else void recall(id).then((src) => src && setSaved({ id, src }))
  }, [id, url])

  const onError = useCallback(() => {
    if (id) void recall(id).then((src) => src && setSaved({ id, src }))
  }, [id])

  const fallback = saved && saved.id === id ? saved.src : null
  return { src: url && !fallback ? url : (fallback ?? null), onError }
}
