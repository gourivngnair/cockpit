import { useEffect, useState } from 'react'
import { UNSORTED, type VisionImage } from './useVision'
import { useSignedUrls } from './useSignedUrls'

interface Props {
  image: VisionImage
  /** The images that the arrows move between (the current filter). */
  position: { index: number; total: number } | null
  themes: string[]
  pinnedToday: boolean
  onClose: () => void
  onStep: (direction: -1 | 1) => void
  onSave: (id: string, patch: { caption?: string; theme?: string }) => void
  onPin: (id: string | null) => void
  onRemove: (id: string) => void
}

const btn = 'rounded-[10px] border border-white/25 bg-white/10 px-3.5 py-2 text-[13.5px] font-medium text-white backdrop-blur-md hover:bg-white/20'

/** The full-size view: step through images with the arrows, edit the caption and theme, pin or remove. */
export function ImageViewer({ image, position, themes, pinnedToday, onClose, onStep, onSave, onPin, onRemove }: Props) {
  const urls = useSignedUrls([image.path])
  const [caption, setCaption] = useState(image.caption)
  const [theme, setTheme] = useState(image.theme === UNSORTED ? '' : image.theme)

  // Show the fields of whichever image is current.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaption(image.caption)
    setTheme(image.theme === UNSORTED ? '' : image.theme)
  }, [image.id, image.caption, image.theme])

  const commit = () => {
    const nextTheme = theme.trim() || UNSORTED
    const patch: { caption?: string; theme?: string } = {}
    if (caption.trim() !== image.caption) patch.caption = caption.trim()
    if (nextTheme !== image.theme) patch.theme = nextTheme
    if (patch.caption !== undefined || patch.theme !== undefined) onSave(image.id, patch)
  }

  const step = (d: -1 | 1) => {
    commit() // never lose an edit by moving on
    onStep(d)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && position && position.total > 1) step(-1)
      if (e.key === 'ArrowRight' && position && position.total > 1) step(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div role="dialog" aria-modal="true" aria-label="Image" className="fixed inset-0 z-50 flex flex-col bg-black/85 text-white" onClick={() => (commit(), onClose())}>
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <span className="text-[13px] opacity-75">{position ? `${position.index + 1} of ${position.total}` : ''}</span>
        <button type="button" onClick={() => (commit(), onClose())} className={btn}>
          Close
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14" onClick={(e) => e.stopPropagation()}>
        {position && position.total > 1 && (
          <button type="button" aria-label="Previous image" onClick={() => step(-1)} className="absolute left-3 grid size-11 place-items-center rounded-full border border-white/25 bg-white/10 text-xl">
            ‹
          </button>
        )}
        {urls[image.path] ? (
          <img src={urls[image.path]} alt={image.caption || 'Vision image'} className="max-h-full max-w-full rounded-xl object-contain" />
        ) : (
          <div className="text-sm opacity-60">Loading</div>
        )}
        {position && position.total > 1 && (
          <button type="button" aria-label="Next image" onClick={() => step(1)} className="absolute right-3 grid size-11 place-items-center rounded-full border border-white/25 bg-white/10 text-xl">
            ›
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-center gap-3 px-5 pb-5 pt-3" onClick={(e) => e.stopPropagation()}>
        <label className="flex flex-col gap-1 text-xs opacity-85">
          Caption
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="A line to remember"
            className="w-72 max-w-[85vw] rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs opacity-85">
          Theme
          <input
            list="vision-themes"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="e.g. Career"
            className="w-48 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50"
          />
          <datalist id="vision-themes">
            {themes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button type="button" onClick={() => onPin(pinnedToday ? null : image.id)} aria-pressed={pinnedToday} className={btn}>
          {pinnedToday ? 'Pinned for today' : 'Show this one today'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Remove this image from your board? This cannot be undone.')) onRemove(image.id)
          }}
          className={`${btn} text-[#ff8a80]`}
        >
          Remove
        </button>
      </div>
    </div>
  )
}
