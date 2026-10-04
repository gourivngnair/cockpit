import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60 * 1000

/** Shows "New version available" with an Update button, so a stale saved copy never lingers. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Look for a new version every hour and whenever the app comes back to the front.
      setInterval(() => void registration.update(), HOUR)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void registration.update()
      })
    },
  })

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed bottom-[calc(18px+env(safe-area-inset-bottom,0px))] right-[18px] z-60 flex items-center gap-3 rounded-full bg-ink py-2 pl-4 pr-2 text-[13.5px] text-panel shadow-[0_10px_28px_rgba(0,0,0,0.2)]"
    >
      New version available
      <button type="button" onClick={() => void updateServiceWorker(true)} className="rounded-full bg-panel px-3.5 py-1 text-[13px] font-semibold text-ink">
        Update
      </button>
    </div>
  )
}
