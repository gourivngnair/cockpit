import { goalRank, hueOf, type Project, type Task } from '../tasks'
import { Panel } from '../ui/Shell'

interface Props {
  projects: Project[]
  tasks: Task[]
  status: 'loading' | 'ok' | 'error'
  error: string | null
  stale: boolean
}

export function GoalsPanel({ projects, tasks, status, error, stale }: Props) {
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]))
  const rootOf = (id: string) => {
    let p = byId[id]
    while (p?.parentId && byId[p.parentId]) p = byId[p.parentId]
    return p?.id
  }
  const goals = projects.filter((p) => !p.parentId || !byId[p.parentId]).sort((a, b) => goalRank(a) - goalRank(b))
  const countFor = (goalId: string) => tasks.filter((t) => rootOf(t.projectId) === goalId).length

  return (
    <Panel className="max-w-md">
      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <h2 className="m-0 text-[15px] font-semibold">Goals</h2>
      </div>
      {status === 'loading' && <p className="m-0 px-4 pb-2 text-xs text-muted">Syncing with Todoist</p>}
      {status === 'error' && (
        <p role="alert" className="m-0 px-4 pb-2 text-xs text-accent">
          {error}
          {stale ? ' Showing the last saved copy.' : ''}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-4">
        {goals.map((p) => {
          const hue = hueOf(p.id, byId)
          const name = p.inbox ? 'Unsorted' : p.name
          const n = countFor(p.id)
          if (p.inbox && n === 0) return null
          return (
            <div key={p.id} className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-2" style={{ ['--h' as string]: hue }}>
              <span
                className="grid size-[26px] flex-none place-items-center rounded-lg text-xs font-bold"
                style={{ color: hue, background: `color-mix(in srgb, ${hue} 15%, var(--panel))` }}
              >
                {name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 font-semibold">{name}</span>
              <span className="text-xs font-medium text-muted">{n}</span>
            </div>
          )
        })}
        {status !== 'loading' && goals.length === 0 && <p className="px-1.5 text-xs text-muted">No projects yet.</p>}
      </div>
    </Panel>
  )
}
