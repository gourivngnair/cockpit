import { useCallback, useMemo, useState } from 'react'
import { syncDone } from '../history/useDoneTasks'
import { hueOf, type Project, type Task } from '../tasks'
import { ProgressPage } from './ProgressPage'
import { useProgressData } from './useProgressData'

/** The Progress screen: loads the numbers and hands them to the page. Mounted only while it is showing. */
export function ProgressView({ projects, tasks, refresh }: { projects: Project[]; tasks: Task[]; refresh: number }) {
  const [tick, setTick] = useState(0)
  const data = useProgressData(projects, tasks, refresh + tick)

  const byId = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects])
  const hue = useCallback(
    (goal: string) => {
      const p = projects.find((x) => !x.parentId && x.name === goal)
      return p ? hueOf(p.id, byId) : '#5B6B7F'
    },
    [projects, byId],
  )

  // Refresh asks the server to copy any new completions first, then reads everything again.
  const onRefresh = useCallback(() => void syncDone().then(() => setTick((n) => n + 1)), [])

  return <ProgressPage done={data.done} open={data.open} focus={data.focus} diet={data.diet} hue={hue} onDiet={(d, v) => void data.answerDiet(d, v)} onRefresh={onRefresh} />
}
