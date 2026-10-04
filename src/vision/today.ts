export interface PickableImage {
  id: string
  createdAt: string
  pinnedOn: string | null
}

/** Day of the year, 0 for 1 January, from a YYYY-MM-DD string (no time zones involved). */
export function dayOfYear(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5)
}

/**
 * Today's vision. An image pinned for today wins. Otherwise the images take turns, one a day, in the
 * order they were added, so every device shows the same one. `shift` is the shuffle button: it moves
 * to the next image without changing anything saved.
 */
export function pickToday<T extends PickableImage>(images: T[], today: string, shift = 0): T | null {
  if (images.length === 0) return null
  const sorted = [...images].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const pinned = sorted.find((i) => i.pinnedOn === today)
  if (pinned && shift === 0) {
    return pinned
  }
  const base = pinned ? sorted.indexOf(pinned) : dayOfYear(today)
  return sorted[(((base + shift) % sorted.length) + sorted.length) % sorted.length]
}

/** The themes in use, sorted, leaving out the placeholder. */
export function themesOf(images: Array<{ theme: string }>, placeholder = 'Unsorted'): string[] {
  return [...new Set(images.map((i) => i.theme.trim()).filter((t) => t && t !== placeholder))].sort((a, b) => a.localeCompare(b))
}
