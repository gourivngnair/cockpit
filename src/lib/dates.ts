const pad = (n: number) => String(n).padStart(2, '0')

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => ymd(new Date())
export const parseDay = (s: string) => new Date(`${s}T00:00:00`)

export function addDays(s: string, n: number): string {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** Monday of the week containing the given day. */
export function mondayOf(s: string): string {
  const d = parseDay(s)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}

/** "HH:MM" or "HH:MM:SS" to minutes since midnight. */
export function toMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export const toHM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** 9:30 -> "9:30a", 13:00 -> "1p". */
export function shortTime(hm: string): string {
  const [h0, m] = hm.split(':').map(Number)
  const ap = h0 >= 12 && h0 < 24 ? 'p' : 'a'
  const h = h0 % 12 || 12
  return `${h}${m ? `:${pad(m)}` : ''}${ap}`
}

export const dayName = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short' }) =>
  parseDay(s).toLocaleDateString('en-GB', opts)

export function fmtDur(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`
}
