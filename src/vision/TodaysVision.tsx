import { Panel } from '../ui/Shell'
import { useImageSrc } from './useImageSrc'
import { useSignedUrls } from './useSignedUrls'
import type { VisionImage } from './useVision'

const bulb = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </svg>
)

const shuffleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.4M20 7h-3.5c-1.6 0-2.7 1.6-3.6 3.4M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />
  </svg>
)

interface Props {
  image: VisionImage | null
  /** There is more than one image, so shuffle means something. */
  canShuffle: boolean
  onShuffle: () => void
  onAdd: () => void
}

/** The right-hand panel on the Plan screen. */
export function TodaysVision({ image, canShuffle, onShuffle, onAdd }: Props) {
  const urls = useSignedUrls(image ? [image.path] : [])
  const { src, onError } = useImageSrc(image?.id ?? null, image ? urls[image.path] : undefined)

  return (
    <Panel className="flex-1">
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-[26px] place-items-center rounded-lg" style={{ color: '#E07A12', background: 'color-mix(in srgb, #E07A12 15%, var(--panel))' }} aria-hidden="true">
            {bulb}
          </span>
          <h2 className="m-0 text-[15px] font-semibold">Today&apos;s vision</h2>
        </div>
        {canShuffle && (
          <button type="button" onClick={onShuffle} aria-label="Show another image" title="Show another image" className="grid size-[30px] place-items-center rounded-lg text-ink2 hover:bg-soft">
            {shuffleIcon}
          </button>
        )}
      </div>
      {image ? (
        <>
          <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-[14px] bg-soft">
            {src && <img src={src} onError={onError} alt={image.caption || 'Vision image'} data-todays-image={image.id} className="block size-full object-cover" draggable={false} />}
          </div>
          <div className="px-[18px] pb-[18px] pt-3.5">
            <h3 className="m-0 mb-1 text-xl font-semibold leading-tight tracking-[-0.015em]">{image.caption || 'Keep going.'}</h3>
            {image.theme && image.theme !== 'Unsorted' && <p className="m-0 text-[13.5px] text-muted">{image.theme}</p>}
          </div>
        </>
      ) : (
        <div className="mx-4 mb-4 grid flex-1 place-items-center rounded-[14px] border-[1.5px] border-dashed border-grey-line p-6 text-center text-muted">
          <div>
            Your vision shows here.
            <br />
            <button type="button" onClick={onAdd} className="mt-3 rounded-[10px] border border-line bg-panel px-3.5 py-2 font-medium text-ink">
              Add images
            </button>
          </div>
        </div>
      )}
    </Panel>
  )
}

/** On a tablet-sized screen there is no room for the panel, so today's image is a slim strip above the calendar. */
export function TodaysVisionBanner({ image, canShuffle, onShuffle }: Omit<Props, 'onAdd'>) {
  const urls = useSignedUrls(image ? [image.path] : [])
  const { src, onError } = useImageSrc(image?.id ?? null, image ? urls[image.path] : undefined)
  if (!image) return null
  return (
    <div className="flex items-center gap-3 rounded-panel border border-line bg-panel p-2 pr-3 shadow-[var(--shadow)]" data-vision-banner>
      <div className="size-14 flex-none overflow-hidden rounded-[10px] bg-soft">
        {src && <img src={src} onError={onError} alt="" className="size-full object-cover" draggable={false} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[11.5px] font-medium uppercase tracking-wide text-muted">Today&apos;s vision</p>
        <p className="m-0 truncate text-[15px] font-semibold">{image.caption || 'Keep going.'}</p>
      </div>
      {canShuffle && (
        <button type="button" onClick={onShuffle} aria-label="Show another image" className="grid size-9 flex-none place-items-center rounded-lg text-ink2 hover:bg-soft">
          {shuffleIcon}
        </button>
      )}
    </div>
  )
}
