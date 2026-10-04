import { useCallback, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msgs, setMsgs] = useState<Array<{ id: number; text: string }>>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setMsgs((m) => [...m, { id, text }])
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 4200)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(22px+env(safe-area-inset-bottom,0px))] z-60 flex flex-col items-center gap-2"
      >
        {msgs.map((m) => (
          <div key={m.id} className="max-w-[90vw] rounded-xl bg-ink px-4 py-2.5 text-[13.5px] text-panel">
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
