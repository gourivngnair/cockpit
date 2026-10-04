import { Panel } from '../ui/Shell'

/** Phase 1 placeholder. Real images arrive in Phase 3 (vision board). */
export function VisionPlaceholder() {
  return (
    <Panel className="flex-1">
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-4">
        <span
          className="grid size-[26px] place-items-center rounded-lg"
          style={{ color: '#E07A12', background: 'color-mix(in srgb, #E07A12 15%, var(--panel))' }}
          aria-hidden="true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
          </svg>
        </span>
        <h2 className="m-0 text-[15px] font-semibold">Today&apos;s vision</h2>
      </div>
      <div className="mx-4 mb-4 grid flex-1 place-items-center rounded-[14px] border-[1.5px] border-dashed border-grey-line p-6 text-center text-muted">
        Your vision shows here.
      </div>
    </Panel>
  )
}
