import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useToast } from '../ui/toastContext'
import { ImageViewer } from './ImageViewer'
import { thumbPath } from './resize'
import { themesOf } from './today'
import { useSignedUrls } from './useSignedUrls'
import type { UploadResult, VisionImage } from './useVision'

export const PINTEREST = 'https://pin.it/3M7bCmDl1'

interface Props {
  images: VisionImage[]
  uploading: { done: number; total: number } | null
  today: string
  onUpload: (files: File[]) => Promise<UploadResult>
  onUpdate: (id: string, patch: { caption?: string; theme?: string }) => Promise<boolean>
  onRemove: (id: string) => Promise<boolean>
  onPin: (id: string | null, today: string) => Promise<boolean>
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function VisionPage({ images, uploading, today, onUpload, onUpdate, onRemove, onPin }: Props) {
  const toast = useToast()
  const [filter, setFilter] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const themes = useMemo(() => themesOf(images), [images])
  // A filter whose last image was re-themed or removed quietly falls back to All.
  const active = filter && themes.includes(filter) ? filter : null
  const shown = useMemo(
    () => images.filter((i) => !active || i.theme === active).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [images, active],
  )
  const urls = useSignedUrls(shown.map((i) => thumbPath(i.path)))

  const send = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return
      const r = await onUpload(files)
      const failed = r.failed.length
        ? ` ${plural(r.failed.length, 'file')} could not be added: ${r.failed
            .slice(0, 3)
            .map((f) => `${f.name} (${f.reason})`)
            .join(', ')}${r.failed.length > 3 ? ' and more' : ''}.`
        : ''
      toast(`${plural(r.added, 'image')} added.${failed}`)
    },
    [onUpload, toast, uploading],
  )

  // Paste an image from the clipboard (a screenshot, or a copied picture).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void send(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [send])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void send([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')))
  }

  const viewed = viewing ? (images.find((i) => i.id === viewing) ?? null) : null
  const at = viewed ? shown.findIndex((i) => i.id === viewed.id) : -1
  // Stepping works from the image currently showing, not from the last render, so a key held down
  // (or pressed twice quickly) moves one image per press.
  const shownRef = useRef(shown)
  useEffect(() => {
    shownRef.current = shown
  }, [shown])
  const step = (d: -1 | 1) =>
    setViewing((current) => {
      const list = shownRef.current
      if (list.length === 0) return current
      const i = list.findIndex((x) => x.id === current)
      return list[i < 0 ? 0 : (i + d + list.length) % list.length].id
    })

  return (
    <div
      className={`h-full overflow-auto rounded-panel border bg-panel px-[30px] py-7 ${over ? 'border-ink' : 'border-line'}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-vision-page
    >
      <div className="mb-[18px] flex flex-wrap items-end gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">Vision board</h1>
          <p className="m-0 mt-1 text-muted">What all of this is for.</p>
        </div>
        <div className="flex-1" />
        <a href={PINTEREST} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3.5 py-2 font-medium text-ink no-underline">
          Pinterest board
        </a>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-ink bg-ink px-3.5 py-2 font-medium text-panel">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Upload
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="Upload images"
            onChange={(e) => {
              void send([...(e.target.files ?? [])])
              e.target.value = '' // so the same file can be chosen again
            }}
          />
        </label>
        {uploading && (
          <span role="status" className="text-[13px] text-muted">
            Uploading {Math.min(uploading.done + 1, uploading.total)} of {uploading.total}
          </span>
        )}
      </div>

      {themes.length > 0 && (
        <div className="mb-[18px] flex flex-wrap gap-1.5" role="group" aria-label="Filter by theme">
          <button type="button" aria-pressed={!active} onClick={() => setFilter(null)} className={chip(!active)}>
            All
          </button>
          {themes.map((t) => (
            <button key={t} type="button" aria-pressed={active === t} onClick={() => setFilter(t)} className={chip(active === t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-grey-line px-5 py-12 text-center text-muted">
          {images.length === 0
            ? 'Upload the pins you downloaded, or drop images here. Click any image later to add a caption or theme.'
            : 'No images in this theme.'}
        </div>
      ) : (
        <div className="[column-gap:14px] [columns:4_240px]">
          {shown.map((img) => {
            const url = urls[thumbPath(img.path)]
            return (
              <figure key={img.id} className="group relative m-0 mb-3.5 [break-inside:avoid]" data-image={img.id}>
                <button
                  type="button"
                  onClick={() => setViewing(img.id)}
                  aria-label={img.caption ? `Open ${img.caption}` : 'Open image'}
                  className="relative block w-full overflow-hidden rounded-[14px] border-0 bg-soft p-0"
                  style={img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : { minHeight: 140 }}
                >
                  {url && <img src={url} alt={img.caption || 'Vision image'} loading="lazy" draggable={false} className="block size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />}
                  {img.caption && (
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2.5 pt-6 text-left text-[13px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {img.caption}
                    </figcaption>
                  )}
                </button>
              </figure>
            )
          })}
        </div>
      )}

      {viewed && (
        <ImageViewer
          image={viewed}
          position={at >= 0 ? { index: at, total: shown.length } : null}
          themes={themes}
          pinnedToday={viewed.pinnedOn === today}
          onClose={() => setViewing(null)}
          onStep={step}
          onSave={(id, patch) => void onUpdate(id, patch)}
          onPin={(id) => void onPin(id, today)}
          onRemove={(id) => {
            setViewing(null)
            void onRemove(id)
          }}
        />
      )}
    </div>
  )
}

const chip = (on: boolean) => `rounded-full border px-3 py-[5px] text-[13px] ${on ? 'border-ink bg-ink text-panel' : 'border-line bg-panel text-ink2'}`
