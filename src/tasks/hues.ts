import type { Project } from './types'

export const NEUTRAL_HUE = '#5B6B7F'

// Todoist colour names mapped onto the Cockpit palette (v2 map).
const TD_TO_HUE: Record<string, string> = {
  berry_red: '#E0314B',
  red: '#E0314B',
  salmon: '#E0314B',
  magenta: '#C2417A',
  teal: '#15998F',
  mint_green: '#15998F',
  blue: '#1C8BD6',
  sky_blue: '#1C8BD6',
  light_blue: '#1C8BD6',
  grape: '#5856D6',
  violet: '#9B51E0',
  lavender: '#9B51E0',
  orange: '#E07A12',
  yellow: '#E07A12',
  taupe: '#E07A12',
  green: '#2E9E5B',
  lime_green: '#2E9E5B',
  olive_green: '#2E9E5B',
  charcoal: NEUTRAL_HUE,
  grey: NEUTRAL_HUE,
}

/** Colour for a project. Sub-projects inherit the top-level parent's colour; Inbox is neutral. */
export function hueOf(projectId: string, projects: Record<string, Project>): string {
  const p = projects[projectId]
  if (!p || p.inbox) return NEUTRAL_HUE
  let root = p
  const seen = new Set<string>()
  while (root.parentId && projects[root.parentId] && !seen.has(root.id)) {
    seen.add(root.id)
    root = projects[root.parentId]
  }
  return TD_TO_HUE[root.color] ?? NEUTRAL_HUE
}

/** Goals in priority order (PRD). Unknown projects follow, Life Admin last. */
export const GOAL_ORDER = ['Term 2 GPA', 'Excel Outside Class', '55 kg and Healthy', 'Better Writer']

export function goalRank(p: Project): number {
  if (p.inbox) return -1
  const i = GOAL_ORDER.indexOf(p.name)
  if (i >= 0) return i
  if (p.name === 'Life Admin') return 90
  return 50 + p.childOrder / 1000
}
