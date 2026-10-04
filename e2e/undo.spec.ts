import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, openSignedIn, ymd, type FakeBlock, type FakeProject, type FakeTask } from './fixtures'

const today = ymd(new Date())
const projects: FakeProject[] = [
  { id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 },
  { id: 'write', name: 'Better Writer', color: 'grape', child_order: 4 },
]
const task = (id: string, over: Partial<FakeTask> = {}): FakeTask => ({ id, content: id, project_id: 'gpa', labels: ['assignments'], due: null, ...over })
const block = (id: string, task_id: string, over: Partial<FakeBlock> = {}): FakeBlock => ({ id, task_id, date: today, start_time: '09:00:00', minutes: 30, ...over })

const HOUR = 64
const START = 7
const UNDO = 'Control+z'
const REDO = 'Control+Shift+z'

test.use({ viewport: { width: 1440, height: 1000 } })

async function open(page: Page, opts: Parameters<typeof openSignedIn>[1]) {
  await page.clock.install({ time: new Date(`${today}T07:30:00`) })
  const be = await openSignedIn(page, { projects, ...opts })
  await page.locator('[data-calscroll]').waitFor()
  await page.evaluate(() => ((document.querySelector('[data-calscroll]') as HTMLElement).scrollTop = 0))
  return be
}

async function dragToSlot(page: Page, from: Locator, lane: Locator, hours: number, grab = 8) {
  const a = (await from.boundingBox())!
  const b = (await lane.boundingBox())!
  await page.mouse.move(a.x + 40, a.y + Math.min(grab, a.height - 2))
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + Math.min(grab, a.height - 2) + 12, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + (hours - START) * HOUR + grab, { steps: 10 })
  await page.mouse.up()
}

const undoButton = (page: Page) => page.getByRole('button', { name: /^Undo/ })
const redoButton = (page: Page) => page.getByRole('button', { name: /^Redo/ })

test.describe('undo and redo', () => {
  test('nothing to undo at first: the buttons are off and the shortcut says so', async ({ page }) => {
    await open(page, { tasks: [task('A')] })
    await expect(undoButton(page)).toBeDisabled()
    await expect(redoButton(page)).toBeDisabled()
    await page.keyboard.press(UNDO)
    await expect(page.getByRole('status')).toContainText('Nothing to undo')
  })

  test('Ctrl+Z takes back a planned block, and Ctrl+Shift+Z puts it back with the same id', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    const createdId = String(be.blockWrites[0].body!.id)
    await expect(undoButton(page)).toBeEnabled()

    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
    expect(be.blockWrites.map((w) => w.method)).toEqual(['POST', 'DELETE'])
    expect(be.blockWrites[1].id).toBe(createdId)
    await expect(page.getByRole('status').last()).toContainText('Undid: Planned "Write report"')
    await expect(redoButton(page)).toBeEnabled()

    await page.keyboard.press(REDO)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    expect(be.blockWrites.at(-1)!.method).toBe('POST')
    expect(be.blockWrites.at(-1)!.body).toMatchObject({ id: createdId, task_id: 'Write report', start_time: '09:00' })
  })

  test('Ctrl+Y also redoes', async ({ page }) => {
    await open(page, { tasks: [task('Write report')] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
    await page.keyboard.press('Control+y')
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
  })

  test('undoing a move puts the block back, writing the whole row', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    await dragToSlot(page, page.locator('[data-block="b1"]'), page.locator('[data-lane]').first(), 13, 10)
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ start_time: '13:00' })

    await page.keyboard.press(UNDO)
    await expect.poll(() => be.blockWrites.length).toBe(2)
    const w = be.blockWrites[1]
    expect(w.method).toBe('PATCH')
    expect(Object.keys(w.body!).sort()).toEqual(['date', 'minutes', 'start_time', 'task_id', 'updated_at'])
    expect(w.body).toMatchObject({ task_id: 'Write report', date: today, start_time: '09:00', minutes: 30 })
    await expect(page.locator('[data-block="b1"]')).toHaveAttribute('data-block-start', '540')
  })

  test('undoing a resize restores the old length', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { minutes: 60 })] })
    const h = (await page.locator('[data-resize="b1"]').boundingBox())!
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 32, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ minutes: 90 })

    await page.keyboard.press(UNDO)
    await expect.poll(() => be.blockWrites.length).toBe(2)
    expect(be.blockWrites[1].body).toMatchObject({ minutes: 60 })
    await expect(page.locator('[data-block="b1"] [data-block-len]')).toHaveText('1h')
  })

  test('undoing a removed block brings it back with the same id', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    await page.locator('[data-block="b1"]').click({ position: { x: 20, y: 10 } })
    await page.getByRole('dialog', { name: 'Block for Write report' }).getByRole('button', { name: 'Remove block' }).click()
    await expect(page.locator('[data-block="b1"]')).toHaveCount(0)

    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-block="b1"]')).toBeVisible()
    expect(be.blockWrites.map((w) => w.method)).toEqual(['DELETE', 'POST'])
    expect(be.blockWrites[1].body).toMatchObject({ id: 'b1', task_id: 'Write report', start_time: '09:00', minutes: 30 })
  })

  test('undoing a planned block also clears the planned time in Todoist', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toMatchObject({ action: 'setPlan' })

    await page.keyboard.press(UNDO)
    await expect.poll(() => be.todoistWrites.length).toBe(2)
    expect(be.todoistWrites[1]).toEqual({ action: 'setPlan', id: 'Write report', plan: null })
  })

  test('undoing a move between goals moves the task and its subgoal back', async ({ page }) => {
    const be = await open(page, { tasks: [task('Draft essay', { labels: ['assignments', 'urgent'] })] })
    await page.getByRole('button', { name: 'Options for Draft essay' }).click()
    await page.getByRole('menuitem', { name: 'Move to…' }).click()
    await page.getByRole('menuitem', { name: 'Substack' }).click()
    await expect(page.locator('[data-goal="Better Writer"] [data-task="Draft essay"]')).toBeVisible()

    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-goal="Term 2 GPA"] [data-task="Draft essay"]')).toBeVisible()
    await expect.poll(() => be.todoistWrites.length).toBe(4)
    expect(be.todoistWrites[2]).toEqual({ action: 'move', id: 'Draft essay', projectId: 'gpa' })
    expect(be.todoistWrites[3]).toEqual({ action: 'setLabels', id: 'Draft essay', labels: ['assignments', 'urgent'] })

    await page.keyboard.press(REDO)
    await expect(page.locator('[data-goal="Better Writer"] [data-task="Draft essay"]')).toBeVisible()
  })

  test('undoing a deadline change restores the old deadline', async ({ page }) => {
    const be = await open(page, { tasks: [task('Essay', { deadline: { date: addDays(today, 5) } })] })
    await page.getByRole('button', { name: 'Options for Essay' }).click()
    await page.getByRole('menuitem', { name: 'Deadline…' }).click()
    await page.getByLabel('Deadline date').fill(addDays(today, 1))
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[data-task="Essay"]')).toContainText('Due Tmrw')

    await page.keyboard.press(UNDO)
    await expect.poll(() => be.todoistWrites.length).toBe(2)
    expect(be.todoistWrites[1]).toEqual({ action: 'setDeadline', id: 'Essay', date: addDays(today, 5) })
    await expect(page.locator('[data-task="Essay"]')).not.toContainText('Due Tmrw')
  })

  test('undoing a completion reopens the task in Todoist and forgets the saved completion', async ({ page }) => {
    const be = await open(page, { tasks: [task('Quiz prep')] })
    await page.getByRole('button', { name: 'Complete Quiz prep' }).click()
    await expect(page.locator('[data-task="Quiz prep"]')).toHaveCount(0)

    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-task="Quiz prep"]')).toBeVisible()
    expect(be.todoistWrites.map((w) => w.action)).toEqual(['close', 'reopen'])
    await expect.poll(() => be.doneDeletes).toBeGreaterThan(0)

    await page.keyboard.press(REDO)
    await expect(page.locator('[data-task="Quiz prep"]')).toHaveCount(0)
    expect(be.todoistWrites.map((w) => w.action)).toEqual(['close', 'reopen', 'close'])
  })

  test('a repeating task tick cannot be undone, and nothing is recorded', async ({ page }) => {
    const be = await open(page, { tasks: [task('Gym', { due: { date: today + 'T18:00:00', is_recurring: true } })] })
    await page.getByRole('button', { name: 'Complete Gym' }).click()
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    await expect(undoButton(page)).toBeDisabled()
  })

  test('a new action after an undo clears the redo history', async ({ page }) => {
    await open(page, { tasks: [task('A'), task('B')] })
    const lane = page.locator('[data-lane]').first()
    await dragToSlot(page, page.locator('[data-task="A"]'), lane, 9)
    await page.keyboard.press(UNDO)
    await expect(redoButton(page)).toBeEnabled()
    await dragToSlot(page, page.locator('[data-task="B"]'), lane, 11)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    await expect(redoButton(page)).toBeDisabled()
  })

  test('steps back through several actions in order', async ({ page }) => {
    const be = await open(page, { tasks: [task('A'), task('B')] })
    const lane = page.locator('[data-lane]').first()
    await dragToSlot(page, page.locator('[data-task="A"]'), lane, 9)
    await dragToSlot(page, page.locator('[data-task="B"]'), lane, 11)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(2)
    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-kind="block"]', { hasText: 'B' })).toHaveCount(0)
    await expect(page.locator('[data-kind="block"]', { hasText: 'A' })).toHaveCount(1)
    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
    expect(be.blockWrites.map((w) => w.method)).toEqual(['POST', 'POST', 'DELETE', 'DELETE'])
  })

  test('Ctrl+Z while typing in a field undoes the typing, not the app', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    await page.waitForTimeout(400) // a click right after a drag is ignored on purpose
    await page.getByRole('button', { name: 'New task', exact: true }).first().click()
    await page.getByLabel('Task', { exact: true }).fill('typing here')
    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    expect(be.blockWrites.map((w) => w.method)).toEqual(['POST'])
  })

  test('a failed undo leaves the action on the list so it can be tried again', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    be.failBlockWrites = true
    await page.keyboard.press(UNDO)
    await expect(page.getByRole('status').last()).toContainText('Could not remove that block')
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    be.failBlockWrites = false
    await expect(undoButton(page)).toBeEnabled()
    await page.keyboard.press(UNDO)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
  })
})
