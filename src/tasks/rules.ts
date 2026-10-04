import { goalRank } from './hues'
import type { Project, Task } from './types'

/** Subgoals (Todoist labels) per goal, in PRD order. Unknown labels follow, then "Other". */
export const SUBGOAL_ORDER: Record<string, string[]> = {
  'Term 2 GPA': ['hard-courses', 'end-terms', 'assignments'],
  'Excel Outside Class': ['competition', 'dracula', 'research-paper'],
  '55 kg and Healthy': ['gym', 'morning-routine', 'clean-diet'],
  'Better Writer': ['substack', 'bradbury', 'monthly-book'],
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

const dueKey = (t: Task) => (t.due ? `${t.due.date}T${t.due.time ?? '99:99'}` : '9999')

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
        const l = t.labels[0]
        if (l && !labels.includes(l)) labels.push(l)
      }
      labels.sort((a, b) => {
        const ia = order.indexOf(a)
        const ib = order.indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      const groups: Group[] = labels.map((label) => ({ label, tasks: sorted.filter((t) => t.labels[0] === label) }))
      const bare = sorted.filter((t) => t.labels.length === 0)
      if (bare.length) groups.push({ label: null, tasks: bare })
      return { project, name: project.inbox ? 'Unsorted' : project.name, tasks: sorted, groups }
    })
    .filter((g) => !(g.project.inbox && g.tasks.length === 0))
}
