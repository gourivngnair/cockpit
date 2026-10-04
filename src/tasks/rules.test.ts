import { describe, expect, it } from 'vitest'
import { buildGoals, canTick } from './rules'
import type { Project, Task } from './types'

const proj = (id: string, name: string, over: Partial<Project> = {}): Project => ({
  id,
  name,
  color: 'charcoal',
  parentId: null,
  inbox: false,
  childOrder: 0,
  ...over,
})
const task = (id: string, projectId: string, over: Partial<Task> = {}): Task => ({
  id,
  content: id,
  projectId,
  labels: [],
  recurring: false,
  due: null,
  durationMin: null,
  checked: false,
  ...over,
})

describe('canTick (invariant 3 / lesson 4)', () => {
  const today = '2026-10-05'
  it('allows a plain task, even if overdue or due later', () => {
    expect(canTick(task('a', 'p', { due: { date: '2026-10-09', time: null } }), today)).toBe(true)
    expect(canTick(task('a', 'p', { due: { date: '2026-10-01', time: null } }), today)).toBe(true)
  })
  it('allows a repeating task due today or overdue', () => {
    expect(canTick(task('a', 'p', { recurring: true, due: { date: today, time: '08:00' } }), today)).toBe(true)
    expect(canTick(task('a', 'p', { recurring: true, due: { date: '2026-10-04', time: null } }), today)).toBe(true)
  })
  it('locks a repeating task whose next due date is after today', () => {
    expect(canTick(task('a', 'p', { recurring: true, due: { date: '2026-10-06', time: null } }), today)).toBe(false)
  })
})

describe('buildGoals', () => {
  const projects = [
    proj('inbox', 'Inbox', { inbox: true }),
    proj('life', 'Life Admin'),
    proj('gpa', 'Term 2 GPA'),
    proj('gpa-sub', 'Case prep', { parentId: 'gpa' }),
  ]

  it('orders goals by priority and rolls sub-projects into their goal', () => {
    const goals = buildGoals(projects, [task('t1', 'gpa-sub', { labels: ['assignments'] }), task('t2', 'life'), task('t3', 'inbox')])
    expect(goals.map((g) => g.name)).toEqual(['Unsorted', 'Term 2 GPA', 'Life Admin'])
    expect(goals[1].tasks.map((t) => t.id)).toEqual(['t1'])
  })

  it('hides an empty Inbox but keeps empty goals', () => {
    const goals = buildGoals(projects, [])
    expect(goals.map((g) => g.name)).toEqual(['Term 2 GPA', 'Life Admin'])
  })

  it('groups by subgoal in PRD order, with unlabelled tasks last', () => {
    const goals = buildGoals(projects, [
      task('a', 'gpa', { labels: ['assignments'] }),
      task('b', 'gpa'),
      task('c', 'gpa', { labels: ['hard-courses'] }),
      task('d', 'gpa', { labels: ['mystery'] }),
      task('e', 'gpa', { labels: ['end-terms'] }),
    ])
    expect(goals[0].groups.map((g) => g.label)).toEqual(['hard-courses', 'end-terms', 'assignments', 'mystery', null])
  })

  it('sorts tasks by due date, undated last, keeping Todoist order for ties', () => {
    const goals = buildGoals(projects, [
      task('none', 'gpa'),
      task('late', 'gpa', { due: { date: '2026-10-09', time: null } }),
      task('soon', 'gpa', { due: { date: '2026-10-06', time: '09:00' } }),
      task('soon2', 'gpa', { due: { date: '2026-10-06', time: '09:00' } }),
    ])
    expect(goals[0].tasks.map((t) => t.id)).toEqual(['soon', 'soon2', 'late', 'none'])
  })
})
