import { expect, test } from '@playwright/test'
import { addDays, openSignedIn, ymd, type FakeProject, type FakeTask } from './fixtures'

const today = ymd(new Date())
const projects: FakeProject[] = [
  { id: 'inbox', name: 'Inbox', color: 'charcoal', inbox_project: true },
  { id: 'life', name: 'Life Admin', color: 'charcoal', child_order: 9 },
  { id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 },
  { id: 'write', name: 'Better Writer', color: 'grape', child_order: 4 },
]

const task = (id: string, project_id: string, over: Partial<FakeTask> = {}): FakeTask => ({ id, content: id, project_id, labels: [], due: null, ...over })

test('goals are grouped Goal, Subgoal, Tasks in priority order, with Unsorted first', async ({ page }) => {
  await openSignedIn(page, {
    projects,
    tasks: [
      task('Read ch 3', 'gpa', { labels: ['assignments'] }),
      task('Revise FM1', 'gpa', { labels: ['hard-courses'] }),
      task('Renew ID', 'life'),
      task('Loose thought', 'inbox'),
      task('Substack draft', 'write', { labels: ['substack'] }),
    ],
  })
  const goals = page.locator('[data-goal]')
  await expect(goals).toHaveCount(4)
  await expect(goals).toContainText(['Unsorted', 'Term 2 GPA', 'Better Writer', 'Life Admin'].map((s) => new RegExp(s)))

  const gpa = page.locator('[data-goal="Term 2 GPA"]')
  const text = await gpa.innerText()
  expect(text.indexOf('Hard courses')).toBeGreaterThan(-1)
  expect(text.indexOf('Hard courses')).toBeLessThan(text.indexOf('Assignments'))
})

test('an empty Unsorted goal is hidden', async ({ page }) => {
  await openSignedIn(page, { projects, tasks: [task('Revise', 'gpa')] })
  await expect(page.locator('[data-goal="Term 2 GPA"]')).toBeVisible()
  await expect(page.locator('[data-goal="Unsorted"]')).toHaveCount(0)
})

test('shows five tasks per subgoal with Show more and Show fewer', async ({ page }) => {
  const many = Array.from({ length: 7 }, (_, i) => task(`Task ${i + 1}`, 'gpa', { labels: ['assignments'] }))
  await openSignedIn(page, { projects, tasks: many })
  await expect(page.locator('[data-task]')).toHaveCount(5)
  await page.getByRole('button', { name: 'Show 2 more' }).click()
  await expect(page.locator('[data-task]')).toHaveCount(7)
  await page.getByRole('button', { name: 'Show fewer' }).click()
  await expect(page.locator('[data-task]')).toHaveCount(5)
})

test('deadline chip is red text on a task with a deadline', async ({ page }) => {
  await openSignedIn(page, { projects, tasks: [task('Essay', 'gpa', { deadline: { date: addDays(today, 2) } })] })
  await expect(page.locator('[data-task="Essay"]')).toContainText(/Due /)
  await expect(page.locator('[data-task="Essay"] [title="Deadline"]')).toBeVisible()
})

test('ticking a task completes it once and removes it', async ({ page }) => {
  const be = await openSignedIn(page, { projects, tasks: [task('Quiz prep', 'gpa')] })
  await page.getByRole('button', { name: 'Complete Quiz prep' }).click()
  await expect(page.locator('[data-task="Quiz prep"]')).toHaveCount(0)
  await expect.poll(() => be.todoistWrites.length).toBe(1)
  expect(be.todoistWrites[0]).toEqual({ action: 'close', id: 'Quiz prep' })
})

test('a failed completion rolls back and tells the user (invariant 4)', async ({ page }) => {
  const be = await openSignedIn(page, { projects, tasks: [task('Quiz prep', 'gpa')] })
  be.failTodoistWrites = true
  await page.getByRole('button', { name: 'Complete Quiz prep' }).click()
  await expect(page.getByRole('status')).toContainText('Could not complete that task')
  await expect(page.locator('[data-task="Quiz prep"]')).toBeVisible()
})

test('repeating task due after today has a disabled checkbox (invariant 3)', async ({ page }) => {
  const be = await openSignedIn(page, {
    projects,
    tasks: [task('Morning routine', 'gpa', { due: { date: addDays(today, 1) + 'T07:30:00', is_recurring: true } })],
  })
  const box = page.getByRole('button', { name: 'Complete Morning routine' })
  await expect(box).toBeDisabled()
  await box.click({ force: true })
  expect(be.todoistWrites).toHaveLength(0)
})

test('a repeating task is completed once and cannot be ticked twice (lesson 4)', async ({ page }) => {
  const be = await openSignedIn(page, {
    projects,
    tasks: [task('Gym', 'gpa', { due: { date: today + 'T18:00:00', is_recurring: true } })],
  })
  const box = page.getByRole('button', { name: 'Complete Gym' })
  await expect(box).toBeEnabled()
  await box.dblclick() // double tap
  await expect.poll(() => be.todoistWrites.length).toBe(1)
  // Todoist now reports the next occurrence (tomorrow): the box stays locked after a refresh.
  await page.getByRole('button', { name: 'Refresh from Todoist' }).click()
  await expect(box).toBeDisabled()
  await box.click({ force: true })
  expect(be.todoistWrites).toHaveLength(1)
})

test('adding a task puts it in the goal and never sends a due date (invariant 1)', async ({ page }) => {
  const be = await openSignedIn(page, { projects, tasks: [task('Existing', 'gpa')] })
  const gpa = page.locator('[data-goal="Term 2 GPA"]')
  await gpa.getByRole('button', { name: 'Add task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Task', { exact: true }).fill('Email professor tomorrow at 5pm')
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(gpa.locator('[data-task]', { hasText: 'Email professor' })).toBeVisible()
  await expect.poll(() => be.todoistWrites.length).toBe(1)
  // The words in the title are plain text. No due date, label or duration was chosen, so none is sent.
  expect(be.todoistWrites[0]).toEqual({ action: 'create', content: 'Email professor tomorrow at 5pm', projectId: 'gpa' })
})

test('a failed add removes the task and tells the user', async ({ page }) => {
  const be = await openSignedIn(page, { projects, tasks: [task('Existing', 'gpa')] })
  be.failTodoistWrites = true
  const gpa = page.locator('[data-goal="Term 2 GPA"]')
  await gpa.getByRole('button', { name: 'Add task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Task', { exact: true }).fill('Will fail')
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByRole('status')).toContainText('Could not add that task')
  await expect(page.locator('[data-task]', { hasText: 'Will fail' })).toHaveCount(0)
})

test('adding from Unsorted sends no project so Todoist uses the Inbox', async ({ page }) => {
  const be = await openSignedIn(page, { projects, tasks: [task('Loose', 'inbox')] })
  const unsorted = page.locator('[data-goal="Unsorted"]')
  await unsorted.getByRole('button', { name: 'Add task' }).click()
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await dialog.getByLabel('Task', { exact: true }).fill('Another loose one')
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect.poll(() => be.todoistWrites.length).toBe(1)
  expect(be.todoistWrites[0]).toEqual({ action: 'create', content: 'Another loose one' })
})