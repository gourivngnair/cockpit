export interface Clock {
  date: string // local YYYY-MM-DD
  minutes: number // local minutes since midnight
}

/** Local date and time for a moment in a named time zone. */
export function localClock(now: Date, timeZone: string): Clock {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}
