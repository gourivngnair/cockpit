import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, openSignedIn, ymd, type FakeProject, type FakeTask } from './fixtures'

const today = ymd(new Date())
const projects: FakeProject[] = [
  { id: 'inbox', name: 'Inbox', color: 'charcoal', inbox_project: true },
  { id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 },
  { id: 'write', name: 'Better Writer', color: 'grape', child_order: 4 },
  { id: 'life', name: 'Life Admin', color: 'charcoal', child_order: 9 },
]
const task = (id: string, project_id: string, over: Partial<FakeTask> = {}): FakeTask => ({ id, content: id, project_id, labels: [], due: null, ...over })

async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + 60, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 80, a.y + a.height / 2 + 10, { steps: 3 })
  // The panel reveals every drop zone once the drag starts, so measure the target again.
  const b2 = (await to.boundingBox()) ?? b
  await page.mouse.move(b2.x + 40, b2.y + b2.height / 2, { steps: 8 })
  await page.mouse.up()
}

test.describe('New task card', () => {
  test('collects goal, subgoal, time needed and deadline and sends them all', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Existing', 'gpa')] })
    await page.getByRole('button', { name: 'New task', exact: true }).first().click()
    const d = page.getByRole('dialog', { name: 'New task' })

    await d.getByLabel('Task', { exact: true }).fill('Write FM1 report')
    await d.getByLabel('Goal').selectOption({ label: 'Term 2 GPA' })
    await d.getByRole('button', { name: 'Assignments' }).click()
    await d.getByRole('button', { name: '1h 30m' }).click()
    await d.getByRole('button', { name: 'Tomorrow' }).click()
    await d.getByLabel('Deadline time').fill('17:00')
    await d.getByRole('button', { name: 'Add task' }).click()

    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual({
      action: 'create',
      content: 'Write FM1 report',
      projectId: 'gpa',
      labels: ['assignments'],
      durationMin: 90,
      due: { date: addDays(today, 1), time: '17:00' },
    })
    const row = page.locator('[data-task]', { hasText: 'Write FM1 report' })
    await expect(row).toContainText('Due Tmrw 5p')
    await expect(page.locator('[data-goal="Term 2 GPA"]')).toContainText('Assignments')
  })

  test('subgoal choices follow the goal and reset when it changes', async ({ page }) => {
    await openSignedIn(page, { projects, tasks: [task('Existing', 'gpa')] })
    await page.getByRole('button', { name: 'New task', exact: true }).first().click()
    const d = page.getByRole('dialog', { name: 'New task' })
    await d.getByLabel('Goal').selectOption({ label: 'Term 2 GPA' })
    await d.getByRole('button', { name: 'Hard courses' }).click()
    await expect(d.getByRole('button', { name: 'Hard courses' })).toHaveAttribute('aria-pressed', 'true')

    await d.getByLabel('Goal').selectOption({ label: 'Better Writer' })
    await expect(d.getByRole('button', { name: 'Hard courses' })).toHaveCount(0)
    await expect(d.getByRole('button', { name: 'Substack' })).toBeVisible()
    await d.getByLabel('Goal').selectOption({ label: 'Life Admin' })
    await expect(d.getByText('Subgoal')).toHaveCount(0)
  })

  test('the Add task button stays off until a name is typed', async ({ page }) => {
    await openSignedIn(page, { projects, tasks: [] })
    await page.getByRole('button', { name: 'New task', exact: true }).first().click()
    const d = page.getByRole('dialog', { name: 'New task' })
    await expect(d.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await d.getByLabel('Task', { exact: true }).fill('x')
    await expect(d.getByRole('button', { name: 'Add task' })).toBeEnabled()
  })
})

test.describe('Moving tasks', () => {
  test('Move to menu changes goal and subgoal (project, then label)', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Draft essay', 'gpa', { labels: ['assignments', 'urgent'] })] })
    await page.getByRole('button', { name: 'Options for Draft essay' }).click()
    await page.getByRole('menuitem', { name: 'Move to…' }).click()
    await page.getByRole('menuitem', { name: 'Substack' }).click()

    await expect(page.locator('[data-goal="Better Writer"] [data-task="Draft essay"]')).toBeVisible()
    await expect(page.locator('[data-goal="Better Writer"]')).toContainText('Substack')
    await expect.poll(() => be.todoistWrites.length).toBe(2)
    expect(be.todoistWrites[0]).toEqual({ action: 'move', id: 'Draft essay', projectId: 'write' })
    // The old subgoal is replaced; the unrelated label is kept.
    expect(be.todoistWrites[1]).toEqual({ action: 'setLabels', id: 'Draft essay', labels: ['substack', 'urgent'] })
  })

  test('dragging a task onto a subgoal moves it', async ({ page }) => {
    const be = await openSignedIn(page, {
      projects,
      tasks: [task('Draft essay', 'gpa', { labels: ['assignments'] }), task('Post one', 'write', { labels: ['substack'] })],
    })
    await drag(page, page.locator('[data-task="Draft essay"]'), page.locator('[data-drop-goal="write"][data-drop-sub="substack"]'))
    await expect(page.locator('[data-goal="Better Writer"] [data-task="Draft essay"]')).toBeVisible()
    await expect.poll(() => be.todoistWrites.length).toBe(2)
    expect(be.todoistWrites.map((w) => w.action)).toEqual(['move', 'setLabels'])
    expect(be.todoistWrites[1]).toMatchObject({ labels: ['substack'] })
  })

  test('dragging onto a goal heading moves it and clears the subgoal', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Gym bag', 'gpa', { labels: ['assignments'] }), task('Anchor', 'life')] })
    await drag(page, page.locator('[data-task="Gym bag"]'), page.locator('button[data-drop-goal="life"]'))
    await expect(page.locator('[data-goal="Life Admin"] [data-task="Gym bag"]')).toBeVisible()
    await expect.poll(() => be.todoistWrites.length).toBe(2)
    expect(be.todoistWrites[0]).toEqual({ action: 'move', id: 'Gym bag', projectId: 'life' })
    expect(be.todoistWrites[1]).toEqual({ action: 'setLabels', id: 'Gym bag', labels: [] })
  })

  test('dropping on its own goal heading changes nothing', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Stay put', 'gpa', { labels: ['assignments'] })] })
    await drag(page, page.locator('[data-task="Stay put"]'), page.locator('button[data-drop-goal="gpa"]'))
    await expect(page.locator('[data-goal="Term 2 GPA"] [data-task="Stay put"]')).toBeVisible()
    expect(be.todoistWrites).toHaveLength(0)
  })

  test('a failed move rolls back and tells the user (invariant 4)', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Draft essay', 'gpa', { labels: ['assignments'] })] })
    be.failTodoistWrites = true
    await page.getByRole('button', { name: 'Options for Draft essay' }).click()
    await page.getByRole('menuitem', { name: 'Move to…' }).click()
    await page.getByRole('menuitem', { name: 'Better Writer' }).click()
    await expect(page.getByRole('status')).toContainText('Could not move that task')
    await expect(page.locator('[data-goal="Term 2 GPA"] [data-task="Draft essay"]')).toBeVisible()
  })

  test('a refresh during a drag does not replace the dragged row (invariant 6)', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Draft essay', 'gpa', { labels: ['assignments'] }), task('Post one', 'write', { labels: ['substack'] })] })
    const row = page.locator('[data-task="Draft essay"]')
    await row.evaluate((el) => ((el as HTMLElement & { __same?: boolean }).__same = true))
    const a = (await row.boundingBox())!

    await page.mouse.move(a.x + 60, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + 80, a.y + a.height / 2 + 12, { steps: 3 })
    await expect(row).toHaveAttribute('data-dragging', 'true')

    // A new task appears in Todoist and the app refreshes mid-gesture.
    be.tasks.push(task('Arrived mid drag', 'gpa'))
    await page.evaluate(() => (document.querySelector('[aria-label="Refresh from Todoist"]') as HTMLButtonElement).click())
    await page.waitForTimeout(400)

    // Same DOM node, still being dragged, and the new task has not been swapped in yet.
    expect(await row.evaluate((el) => (el as HTMLElement & { __same?: boolean }).__same)).toBe(true)
    await expect(row).toHaveAttribute('data-dragging', 'true')
    await expect(page.locator('[data-task="Arrived mid drag"]')).toHaveCount(0)

    const target = (await page.locator('[data-drop-goal="write"][data-drop-sub="substack"]').boundingBox())!
    await page.mouse.move(target.x + 40, target.y + target.height / 2, { steps: 6 })
    await page.mouse.up()
    // After the drop the queued refresh is applied.
    await expect(page.locator('[data-task="Arrived mid drag"]')).toBeVisible()
  })
})

test.describe('Deadlines', () => {
  test('editing a deadline on a normal task sends the new date and shows the chip', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Essay', 'gpa', { labels: ['assignments'], due: { date: addDays(today, 5) } })] })
    await page.getByRole('button', { name: 'Options for Essay' }).click()
    await page.getByRole('menuitem', { name: 'Deadline…' }).click()
    await page.getByLabel('Deadline date').fill(addDays(today, 1))
    await page.getByLabel('Deadline time').fill('09:30')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[data-task="Essay"]')).toContainText('Due Tmrw 9:30a')
    expect(be.todoistWrites).toEqual([{ action: 'setDeadline', id: 'Essay', due: { date: addDays(today, 1), time: '09:30' } }])
  })

  test('clearing a deadline removes the chip', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Essay', 'gpa', { due: { date: addDays(today, 5) } })] })
    await page.getByRole('button', { name: 'Options for Essay' }).click()
    await page.getByRole('menuitem', { name: 'Deadline…' }).click()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.locator('[data-task="Essay"] [title="Deadline"]')).toHaveCount(0)
    expect(be.todoistWrites).toEqual([{ action: 'setDeadline', id: 'Essay', due: null }])
  })

  test('a failed deadline edit rolls back', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('Essay', 'gpa', { due: { date: addDays(today, 5) } })] })
    be.failTodoistWrites = true
    await page.getByRole('button', { name: 'Options for Essay' }).click()
    await page.getByRole('menuitem', { name: 'Deadline…' }).click()
    await page.getByLabel('Deadline date').fill(addDays(today, 1))
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Could not change the deadline')
    await expect(page.locator('[data-task="Essay"] [title="Deadline"]')).toBeVisible()
  })

  test('a repeating task has its deadline locked and nothing is sent (invariant 1)', async ({ page }) => {
    const be = await openSignedIn(page, {
      projects,
      tasks: [task('Morning routine', 'gpa', { due: { date: today + 'T07:30:00', is_recurring: true } })],
    })
    await page.getByRole('button', { name: 'Options for Morning routine' }).click()
    await expect(page.getByRole('menuitem', { name: 'Deadline…' })).toBeDisabled()
    await expect(page.getByText('This task repeats in Todoist')).toBeVisible()
    expect(be.todoistWrites).toHaveLength(0)
  })
})
