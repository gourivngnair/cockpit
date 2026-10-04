import { useState, type ReactNode } from 'react'
import { currentTheme, toggleTheme } from './theme'

const icon = {
  plan: <path d="M4 10h16M9 3v4M15 3v4M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sun: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  out: <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5M9.5 2.5h5" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0" />,
}

export function Icon({ name, size = 15 }: { name: keyof typeof icon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon[name]}
    </svg>
  )
}

export function RoundButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-full border border-line bg-panel text-ink2 disabled:opacity-35"
    >
      {children}
    </button>
  )
}

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-panel border border-line bg-panel shadow-[var(--shadow)] ${className}`}>
      {children}
    </section>
  )
}

interface ShellProps {
  children: ReactNode
  onRefresh?: () => void
  onSignOut?: () => void
  onNotifications?: () => void
  onFocus?: () => void
  history?: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; onUndo: () => void; onRedo: () => void }
}

export function Shell({ children, onRefresh, onSignOut, onNotifications, onFocus, history }: ShellProps) {
  const [theme, setTheme] = useState(currentTheme())
  return (
    <div className="flex h-full flex-col px-3.5 pb-3.5 pt-2.5">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-1.5 pb-3 pt-1">
        <div className="grid size-[30px] place-items-center rounded-[9px] bg-ink" aria-hidden="true">
          <i className="size-2.5 rounded-[3px] bg-panel" />
        </div>
        <nav className="flex gap-0.5 rounded-full border border-line bg-panel p-[3px]" aria-label="Main">
          <button type="button" aria-current="page" className="flex items-center gap-[7px] rounded-full bg-soft px-3.5 py-1.5 font-medium text-ink">
            <Icon name="plan" />
            Plan
          </button>
        </nav>
        <div className="flex justify-self-end gap-1.5">
          {onRefresh && (
            <RoundButton label="Refresh from Todoist" onClick={onRefresh}>
              <Icon name="refresh" />
            </RoundButton>
          )}
          {onFocus && (
            <RoundButton label="Focus mode" onClick={onFocus}>
              <Icon name="timer" />
            </RoundButton>
          )}
          {history && (
            <>
              <RoundButton label={history.undoLabel ? `Undo: ${history.undoLabel}` : 'Undo'} onClick={history.onUndo} disabled={!history.canUndo}>
                <Icon name="undo" />
              </RoundButton>
              <RoundButton label={history.redoLabel ? `Redo: ${history.redoLabel}` : 'Redo'} onClick={history.onRedo} disabled={!history.canRedo}>
                <Icon name="redo" />
              </RoundButton>
            </>
          )}
          {onNotifications && (
            <RoundButton label="Notifications" onClick={onNotifications}>
              <Icon name="bell" />
            </RoundButton>
          )}
          <RoundButton label="Switch theme" onClick={() => setTheme(toggleTheme())}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </RoundButton>
          {onSignOut && (
            <RoundButton label="Sign out" onClick={onSignOut}>
              <Icon name="out" />
            </RoundButton>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
