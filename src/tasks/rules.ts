import { goalRank } from './hues'
import type { Project, Task } from './types'

/** Subgoals (Todoist labels) per goal, in PRD order. Unknown labels follow, then "Other". */
export const SUBGOAL_ORDER: Record<string, string[]> = {
  'Term 2 GPA': ['hard-courses', 'end-terms', 'assignments'],
  'Excel Outside Class': ['competition', 'dracula', 'research-paper'],
  // Clean diet is not a task: it is a daily yes or no on the Progress page (decided 2026-10-05).
  '55 kg and Healthy': ['gym', 'morning-routine'],
  'Better Writer': ['substack', 'bradbury', 'monthly-book'],
}

/** Every label that counts as a subgoal. Other labels are kept but never used for grouping. */
export const SUBGOAL_LABELS: ReadonlySet<string> = new Set(Object.values(SUBGOAL_ORDER).flat())

/** The task's subgoal within a goal: its first label that is one of that goal's subgoals, or null. */
export const subgoalOf = (t: Pick<Task, 'labels'>, allowed: readonly string[]): string | null => t.labels.find((l) => allowed.includes(l)) ?? null

/** New label list after choosing a subgoal (null clears it). Non-subgoal labels are preserved. */
export function labelsWithSubgoal(labels: string[], subgoal: string | null): string[] {
  const rest = labels.filter((l) => !SUBGOAL_LABELS.has(l))
  return subgoal ? [subgoal, ...rest] : rest
}

/**
 * Invariant 3: a repeating task's checkbox is disabled when its next due date
 * is after today (today's occurrence is already done).
 */
export function canTick(task: Task, today: string): boolean {
  return !(task.recurring && task.due && task.due.date > today)
}

export const prettyLabel = (l: string) => l.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

export interface Group {
  label: string | null // null = tasks with no label
  tasks: Task[]
}

export interface Goal {
  project: Project
  name: string
  tasks: Task[]
  groups: Group[]
}

/** Sort key: real deadline first; a repeating task by its schedule; everything else last. */
const dueKey = (t: Task) =>
  t.deadline ? `${t.deadline}T00:00` : t.recurring && t.due ? `${t.due.date}T${t.due.time ?? '99:99'}` : '9999'

/** Goal, then subgoal (label), then tasks. Sub-projects roll up into their top-level goal. */
export function buildGoals(projects: Project[], tasks: Task[]): Goal[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const rootId = (id: string) => {
    let p = byId.get(id)
    const seen = new Set<string>()
    while (p?.parentId && byId.has(p.parentId) && !seen.has(p.id)) {
      seen.add(p.id)
      p = byId.get(p.parentId)
    }
    return p?.id
  }

  const roots = projects.filter((p) => !p.parentId || !byId.has(p.parentId)).sort((a, b) => goalRank(a) - goalRank(b))

  return roots
    .map((project): Goal => {
      const mine = tasks.filter((t) => rootId(t.projectId) === project.id)
      const sorted = mine.map((t, i) => ({ t, i })).sort((a, b) => dueKey(a.t).localeCompare(dueKey(b.t)) || a.i - b.i).map((x) => x.t)
      const order = SUBGOAL_ORDER[project.name] ?? []
      const labels: string[] = []
      for (const t of sorted) {
        const l = subgoalOf(t, order)
        if (l && !labels.includes(l)) labels.push(l)
      }
      labels.sort((a, b) => {
        const ia = order.indexOf(a)
        const ib = order.indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      const groups: Group[] = labels.map((label) => ({ label, tasks: sorted.filter((t) => subgoalOf(t, order) === label) }))
      const bare = sorted.filter((t) => subgoalOf(t, order) === null)
      if (bare.length) groups.push({ label: null, tasks: bare })
      return { project, name: project.inbox ? 'Unsorted' : project.name, tasks: sorted, groups }
    })
    .filter((g) => !(g.project.inbox && g.tasks.length === 0))
}
