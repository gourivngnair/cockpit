export type Theme = 'light' | 'dark'

export function currentTheme(): Theme {
  const set = document.documentElement.getAttribute('data-theme')
  if (set === 'light' || set === 'dark') return set
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applySavedTheme() {
  try {
    const t = localStorage.getItem('cockpit-theme')
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
  } catch {
    /* storage unavailable: follow the system */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem('cockpit-theme', next)
  } catch {
    /* ignore */
  }
  return next
}
