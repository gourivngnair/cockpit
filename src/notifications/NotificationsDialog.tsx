import { usePush } from './usePush'

const STATUS: Record<string, string> = {
  unsupported: 'This browser cannot show notifications. On the tablet, use Chrome and install Cockpit to the home screen.',
  blocked: 'Notifications are blocked for this site. Allow them in the browser settings, then come back here.',
  off: 'Off on this device.',
  on: 'On for this device.',
}

export function NotificationsDialog({ onClose }: { onClose: () => void }) {
  const { state, busy, enable, disable, sendTest } = usePush()
  const btn = 'rounded-[10px] px-4 py-2 font-semibold disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="w-full max-w-sm overflow-hidden rounded-panel border border-line bg-panel shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="m-0 text-base font-semibold">Notifications</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1 text-ink2 hover:bg-soft">
            Close
          </button>
        </div>
        <div className="px-5 py-4">
          <ul className="m-0 mb-3 list-disc pl-5 text-[13.5px] text-ink2">
            <li>A heads-up 10 minutes before each class.</li>
            <li>At 8 am, a list of today&apos;s deadlines and anything overdue.</li>
          </ul>
          <p data-push-state={state} className="m-0 mb-4 rounded-[10px] bg-soft p-3 text-[13px] text-ink2">
            {STATUS[state]}
          </p>
          <div className="flex flex-wrap gap-2">
            {state === 'off' && (
              <button type="button" disabled={busy} onClick={() => void enable()} className={`${btn} bg-ink text-panel`}>
                Turn on
              </button>
            )}
            {state === 'on' && (
              <>
                <button type="button" disabled={busy} onClick={() => void sendTest()} className={`${btn} bg-ink text-panel`}>
                  Send a test
                </button>
                <button type="button" disabled={busy} onClick={() => void disable()} className={`${btn} border border-line bg-panel text-ink`}>
                  Turn off
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
