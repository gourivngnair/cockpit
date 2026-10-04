import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, openSignedIn, ymd, type FakeBlock, type FakeProject, type FakeTask } from './fixtures'

const today = ymd(new Date())
const tomorrow = addDays(today, 1)
const projects: FakeProject[] = [
  { id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 },
  { id: 'write', name: 'Better Writer', color: 'grape', child_order: 4 },
]
const task = (id: string, over: Partial<FakeTask> = {}): FakeTask => ({ id, content: id, project_id: 'gpa', labels: ['assignments'], due: null, ...over })
const block = (id: string, task_id: string, over: Partial<FakeBlock> = {}): FakeBlock => ({ id, task_id, date: today, start_time: '09:00:00', minutes: 30, ...over })

const HOUR = 64
const START = 7

test.use({ viewport: { width: 1440, height: 1000 } })

async function open(page: Page, opts: Parameters<typeof openSignedIn>[1]) {
  // Fixed morning start, so every block in these tests is later than now.
  await page.clock.install({ time: new Date(`${today}T07:30:00`) })
  const be = await openSignedIn(page, { projects, ...opts })
  await page.locator('[data-calscroll]').waitFor()
  await page.evaluate(() => ((document.querySelector('[data-calscroll]') as HTMLElement).scrollTop = 0))
  return be
}

/** Pixel y inside the lane for a given time (hours since midnight, e.g. 9.25). */
async function laneY(lane: Locator, hours: number) {
  const b = (await lane.boundingBox())!
  return b.y + (hours - START) * HOUR
}

/** Drag a task row (or any source) onto a lane so that the block's top edge lands on `hours`. */
async function dragToSlot(page: Page, from: Locator, lane: Locator, hours: number, opts: { grab?: number; x?: number } = {}) {
  const a = (await from.boundingBox())!
  const grab = opts.grab ?? 8
  const b = (await lane.boundingBox())!
  const targetY = (await laneY(lane, hours)) + grab
  await page.mouse.move(a.x + 40, a.y + Math.min(grab, a.height - 2))
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + Math.min(grab, a.height - 2) + 12, { steps: 3 })
  await page.mouse.move(opts.x ?? b.x + b.width / 2, targetY, { steps: 10 })
  await page.mouse.up()
}

test.describe('creating blocks', () => {
  test('dragging a task onto a slot makes a block at that time with the task length', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report', { duration: { amount: 45, unit: 'minute' } })] })
    const lane = page.locator('[data-lane]').first()
    await dragToSlot(page, page.locator('[data-task="Write report"]'), lane, 9)

    await expect(page.locator('[data-kind="block"]', { hasText: 'Write report' })).toBeVisible()
    await expect.poll(() => be.blockWrites.length).toBe(1)
    const w = be.blockWrites[0]
    expect(w.method).toBe('POST')
    expect(w.body).toMatchObject({ task_id: 'Write report', date: today, start_time: '09:00', minutes: 45 })
    // The task row shows when it is planned.
    await expect(page.locator('[data-task="Write report"] [title="Planned on the calendar"]')).toHaveText('9a')
  })

  test('a task with no duration gets a 30 minute block', async ({ page }) => {
    const be = await open(page, { tasks: [task('Quick thing')] })
    await dragToSlot(page, page.locator('[data-task="Quick thing"]'), page.locator('[data-lane]').first(), 10.5)
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ start_time: '10:30', minutes: 30 })
  })

  test('the drop snaps to 15 minutes', async ({ page }) => {
    const be = await open(page, { tasks: [task('Snap me')] })
    // 9:07 is closer to 9:00 than 9:15.
    await dragToSlot(page, page.locator('[data-task="Snap me"]'), page.locator('[data-lane]').first(), 9 + 7 / 60)
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ start_time: '09:00' })
  })

  test('a ghost shows the time range while dragging', async ({ page }) => {
    await open(page, { tasks: [task('Show ghost')] })
    const row = page.locator('[data-task="Show ghost"]')
    const a = (await row.boundingBox())!
    const lane = page.locator('[data-lane]').first()
    const b = (await lane.boundingBox())!
    await page.mouse.move(a.x + 40, a.y + 8)
    await page.mouse.down()
    await page.mouse.move(a.x + 60, a.y + 20, { steps: 3 })
    await page.mouse.move(b.x + 200, (await laneY(lane, 14)) + 8, { steps: 8 })
    await expect(page.locator('.ghost')).toContainText('14:00 to 14:30')
    await page.mouse.up()
    await expect(page.locator('.ghost')).toHaveCount(0)
  })

  test('a task can have several blocks', async ({ page }) => {
    const be = await open(page, { tasks: [task('Big project')] })
    const lane = page.locator('[data-lane]').first()
    await dragToSlot(page, page.locator('[data-task="Big project"]'), lane, 9)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(1)
    await dragToSlot(page, page.locator('[data-task="Big project"]'), lane, 14)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(2)
    await expect.poll(() => be.blockWrites.map((w) => w.method)).toEqual(['POST', 'POST'])
    await expect(page.locator('[data-task="Big project"] [title="Planned on the calendar"]')).toHaveText('9a +1')
  })

  test('Escape cancels a drag and writes nothing', async ({ page }) => {
    const be = await open(page, { tasks: [task('Never mind')] })
    const row = page.locator('[data-task="Never mind"]')
    const a = (await row.boundingBox())!
    const lane = page.locator('[data-lane]').first()
    const b = (await lane.boundingBox())!
    await page.mouse.move(a.x + 40, a.y + 8)
    await page.mouse.down()
    await page.mouse.move(a.x + 60, a.y + 20, { steps: 3 })
    await page.mouse.move(b.x + 200, (await laneY(lane, 11)) + 8, { steps: 6 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
    expect(be.blockWrites).toHaveLength(0)
  })
})

test.describe('repeating tasks', () => {
  test('cannot be placed on the calendar (invariant 2)', async ({ page }) => {
    const be = await open(page, { tasks: [task('Morning routine', { due: { date: tomorrow + 'T07:30:00', is_recurring: true } })] })
    await dragToSlot(page, page.locator('[data-task="Morning routine"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.getByRole('status')).toContainText('Repeating tasks keep their Todoist time')
    expect(be.blockWrites).toHaveLength(0)
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
  })

  test('their grey calendar blocks cannot be dragged or resized', async ({ page }) => {
    const be = await open(page, { tasks: [task('Gym', { due: { date: today + 'T18:00:00', is_recurring: true } })] })
    const rt = page.locator('[data-kind="rt"]', { hasText: 'Gym' })
    await expect(rt).toBeVisible()
    await expect(rt).not.toHaveAttribute('data-drag-block', /.*/)
    await expect(rt.locator('[data-resize]')).toHaveCount(0)
    expect(be.blockWrites).toHaveLength(0)
  })
})

test.describe('moving blocks', () => {
  test('dragging a block to a new time writes the whole row (lesson 2)', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { start_time: '09:00:00', minutes: 60 })] })
    const el = page.locator('[data-block="b1"]')
    await expect(el).toBeVisible()
    await dragToSlot(page, el, page.locator('[data-lane]').first(), 11.25, { grab: 12 })

    await expect.poll(() => be.blockWrites.length).toBe(1)
    const w = be.blockWrites[0]
    expect(w.method).toBe('PATCH')
    expect(w.id).toBe('b1')
    // Every column is sent, not just the one that changed.
    expect(Object.keys(w.body!).sort()).toEqual(['date', 'minutes', 'start_time', 'task_id', 'updated_at'])
    expect(w.body).toMatchObject({ task_id: 'Write report', date: today, start_time: '11:15', minutes: 60 })
  })

  test('a block can move to another day in the week view', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    await page.getByRole('button', { name: 'Week' }).click()
    await page.evaluate(() => ((document.querySelector('[data-calscroll]') as HTMLElement).scrollTop = 0))
    // Any other day in the visible week will do.
    const lanes = page.locator('[data-lane]')
    const other = (await lanes.first().getAttribute('data-lane')) === today ? lanes.nth(1) : lanes.first()
    const otherDay = (await other.getAttribute('data-lane'))!
    await dragToSlot(page, page.locator('[data-block="b1"]'), other, 13, { grab: 10 })
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ date: otherDay, start_time: '13:00', minutes: 30 })
  })
  test('a failed move puts the block back and tells the user (invariant 4)', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    be.failBlockWrites = true
    await dragToSlot(page, page.locator('[data-block="b1"]'), page.locator('[data-lane]').first(), 15, { grab: 10 })
    await expect(page.getByRole('status')).toContainText('Could not save that change')
    // Back at 9:00 (540 minutes).
    await expect(page.locator('[data-block="b1"]')).toHaveAttribute('data-block-start', '540')
  })

  test('a failed create removes the block and tells the user', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    be.failBlockWrites = true
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.getByRole('status')).toContainText('Could not save that block')
    await expect(page.locator('[data-kind="block"]')).toHaveCount(0)
  })

  test('a refresh during a block drag does not replace the dragged block (invariant 6)', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    const el = page.locator('[data-block="b1"]')
    await el.evaluate((n) => ((n as HTMLElement & { __same?: boolean }).__same = true))
    const a = (await el.boundingBox())!
    await page.mouse.move(a.x + 30, a.y + 8)
    await page.mouse.down()
    await page.mouse.move(a.x + 40, a.y + 30, { steps: 4 })
    await expect(el).toHaveAttribute('data-dragging', 'true')

    // Another device changes the block and this app refreshes mid-gesture.
    be.blocks[0].minutes = 90
    be.tasks.push(task('Arrived mid drag'))
    await page.evaluate(() => (document.querySelector('[aria-label="Refresh from Todoist"]') as HTMLButtonElement).click())
    await page.waitForTimeout(400)

    expect(await el.evaluate((n) => (n as HTMLElement & { __same?: boolean }).__same)).toBe(true)
    await expect(el).toHaveAttribute('data-dragging', 'true')
    await expect(page.locator('[data-task="Arrived mid drag"]')).toHaveCount(0)

    await page.mouse.move(a.x + 40, a.y + 120, { steps: 4 })
    await page.mouse.up()
    await expect(page.locator('[data-task="Arrived mid drag"]')).toBeVisible()
  })
})

test.describe('resizing blocks', () => {
  async function dragHandle(page: Page, id: string, dy: number) {
    const handle = page.locator(`[data-resize="${id}"]`)
    const h = (await handle.boundingBox())!
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + dy / 2, { steps: 4 })
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + dy, { steps: 4 })
    await page.mouse.up()
  }

  test('dragging the bottom edge saves the whole row and updates Todoist planned length', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report', { duration: { amount: 30, unit: 'minute' } })], blocks: [block('b1', 'Write report', { minutes: 30 })] })
    await dragHandle(page, 'b1', 32) // 32px is 30 minutes

    await expect.poll(() => be.blockWrites.length).toBe(1)
    const w = be.blockWrites[0]
    expect(w.method).toBe('PATCH')
    expect(Object.keys(w.body!).sort()).toEqual(['date', 'minutes', 'start_time', 'task_id', 'updated_at'])
    expect(w.body).toMatchObject({ task_id: 'Write report', date: today, start_time: '09:00', minutes: 60 })
    // Todoist's planned time and length follow, so it reads the same everywhere.
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual({ action: 'setPlan', id: 'Write report', plan: { date: today, time: '09:00', minutes: 60 } })
    await expect(page.locator('[data-block="b1"] [data-block-len]')).toHaveText('1h')
  })

  test('the length never goes below 15 minutes', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { minutes: 30 })] })
    await dragHandle(page, 'b1', -200)
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ minutes: 15 })
  })

  test('a resize that did not change the length writes nothing', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { minutes: 30 })] })
    await dragHandle(page, 'b1', 3)
    await page.waitForTimeout(300)
    expect(be.blockWrites).toHaveLength(0)
  })

  test('a failed resize goes back to the old length and tells the user', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { minutes: 60 })] })
    be.failBlockWrites = true
    await dragHandle(page, 'b1', 64)
    await expect(page.getByRole('status')).toContainText('Could not save that change')
    await expect(page.locator('[data-block="b1"] [data-block-len]')).toHaveText('1h')
    expect(be.todoistWrites).toHaveLength(0) // Todoist is only updated once the block is saved
  })

  test('blocks and lengths survive a reload', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { minutes: 30 })] })
    await dragHandle(page, 'b1', 32)
    await expect.poll(() => be.blockWrites.length).toBe(1)
    await page.reload()
    await page.locator('[data-calscroll]').waitFor()
    await expect(page.locator('[data-block="b1"] [data-block-len]')).toHaveText('1h')
  })
})

test.describe('block card', () => {
  test('length buttons change the block and the planned length', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    await page.locator('[data-block="b1"]').click({ position: { x: 20, y: 10 } })
    const card = page.getByRole('dialog', { name: 'Block for Write report' })
    await card.getByRole('button', { name: '1h 30m' }).click()
    await expect.poll(() => be.blockWrites.length).toBe(1)
    expect(be.blockWrites[0].body).toMatchObject({ minutes: 90, start_time: '09:00' })
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual({ action: 'setPlan', id: 'Write report', plan: { date: today, time: '09:00', minutes: 90 } })
  })

  test('Mark done completes the task and leaves a faded struck-through block', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    await page.locator('[data-block="b1"]').click({ position: { x: 20, y: 10 } })
    await page.getByRole('dialog', { name: 'Block for Write report' }).getByRole('button', { name: 'Mark done' }).click()
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual({ action: 'close', id: 'Write report' })
    const done = page.locator('[data-kind="done"]', { hasText: 'Write report' })
    await expect(done).toBeVisible()
    await expect(done.locator('b')).toHaveCSS('text-decoration-line', 'line-through')
    await expect(page.locator('[data-task="Write report"]')).toHaveCount(0)
    // A finished block cannot be picked up.
    await expect(done).not.toHaveAttribute('data-drag-block', /.*/)
  })

  test('Remove block deletes only the block', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report')] })
    await page.locator('[data-block="b1"]').click({ position: { x: 20, y: 10 } })
    await page.getByRole('dialog', { name: 'Block for Write report' }).getByRole('button', { name: 'Remove block' }).click()
    await expect(page.locator('[data-block="b1"]')).toHaveCount(0)
    await expect.poll(() => be.blockWrites.map((w) => w.method)).toEqual(['DELETE'])
    await expect(page.locator('[data-task="Write report"]')).toBeVisible()
    expect(be.todoistWrites).toHaveLength(0)
  })

  test('a drag that ends on its own block does not open the card', async ({ page }) => {
    await open(page, { tasks: [task('Write report')], blocks: [block('b1', 'Write report', { minutes: 60 })] })
    const el = page.locator('[data-block="b1"]')
    const a = (await el.boundingBox())!
    await page.mouse.move(a.x + 30, a.y + 10)
    await page.mouse.down()
    await page.mouse.move(a.x + 30, a.y + 40, { steps: 4 })
    await page.mouse.move(a.x + 30, a.y + 12, { steps: 4 })
    await page.mouse.up()
    await expect(page.getByRole('dialog', { name: /Block for/ })).toHaveCount(0)
  })
})

test('blocks from tasks completed elsewhere are not shown', async ({ page }) => {
  await open(page, { tasks: [], blocks: [block('b1', 'Gone task')] })
  await expect(page.locator('[data-block]')).toHaveCount(0)
})

test('a touch long-press picks a task up and drops it on the calendar', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:4173' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(`${today}T07:30:00`) })
  const be = await openSignedIn(page, { projects, tasks: [task('Touch task')] })
  await page.locator('[data-calscroll]').waitFor()
  await page.evaluate(() => ((document.querySelector('[data-calscroll]') as HTMLElement).scrollTop = 0))
  const cdp = await ctx.newCDPSession(page)

  const row = (await page.locator('[data-task="Touch task"] [data-task-title]').boundingBox())!
  const sx = row.x + 20
  const sy = row.y + 5
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] })
  await expect(page.locator('[data-dragging="true"]')).toHaveCount(1, { timeout: 3000 }) // held for ~0.35s

  const lane = page.locator('[data-lane]').first()
  const lb = (await lane.boundingBox())!
  const tx = lb.x + lb.width / 2
  const ty = (await laneY(lane, 10)) + 8
  for (let i = 1; i <= 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + ((tx - sx) * i) / 20, y: sy + ((ty - sy) * i) / 20 }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => be.blockWrites.length).toBe(1)
  expect(be.blockWrites[0].body).toMatchObject({ task_id: 'Touch task', start_time: '10:00' })
  await ctx.close()
})

test.describe('planned time in Todoist (the earliest upcoming block)', () => {
  const plan = (id: string, time: string, minutes: number, date = today) => ({ action: 'setPlan', id, plan: { date, time, minutes } })

  test('placing a block sets the task planned time and length, never a deadline', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report', { duration: { amount: 45, unit: 'minute' } })] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual(plan('Write report', '09:00', 45))
    // Todoist now holds the plan as the due time. The Deadline field is untouched.
    expect(be.tasks[0].due).toEqual({ date: `${today}T09:00:00` })
    expect(be.tasks[0].deadline ?? null).toBeNull()
  })

  test('an existing deadline survives planning', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report', { deadline: { date: addDays(today, 3) } })] })
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.tasks[0].deadline).toEqual({ date: addDays(today, 3) })
    expect(be.todoistWrites.every((w) => w.action === 'setPlan')).toBe(true)
  })

  test('moving the earliest block updates the plan', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report', { due: { date: `${today}T09:00:00` }, duration: { amount: 30, unit: 'minute' } })], blocks: [block('b1', 'Write report')] })
    await dragToSlot(page, page.locator('[data-block="b1"]'), page.locator('[data-lane]').first(), 13, { grab: 10 })
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual(plan('Write report', '13:00', 30))
  })

  test('the earliest of several blocks is the plan', async ({ page }) => {
    const be = await open(page, { tasks: [task('Big project')] })
    const lane = page.locator('[data-lane]').first()
    await dragToSlot(page, page.locator('[data-task="Big project"]'), lane, 14)
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual(plan('Big project', '14:00', 30))
    await dragToSlot(page, page.locator('[data-task="Big project"]'), lane, 9)
    await expect.poll(() => be.todoistWrites.length).toBe(2)
    expect(be.todoistWrites[1]).toEqual(plan('Big project', '09:00', 30))
  })

  test('changing a later block does not touch Todoist', async ({ page }) => {
    const be = await open(page, {
      tasks: [task('Big project', { due: { date: `${today}T09:00:00` }, duration: { amount: 30, unit: 'minute' } })],
      blocks: [block('b1', 'Big project'), block('b2', 'Big project', { start_time: '14:00:00' })],
    })
    await dragToSlot(page, page.locator('[data-block="b2"]'), page.locator('[data-lane]').first(), 16, { grab: 10 })
    await expect.poll(() => be.blockWrites.length).toBe(1)
    await page.waitForTimeout(300)
    expect(be.todoistWrites).toHaveLength(0)
  })

  test('removing the last block clears the planned time and keeps the deadline', async ({ page }) => {
    const be = await open(page, {
      tasks: [task('Write report', { due: { date: `${today}T09:00:00` }, deadline: { date: addDays(today, 3) }, duration: { amount: 30, unit: 'minute' } })],
      blocks: [block('b1', 'Write report')],
    })
    await page.locator('[data-block="b1"]').click({ position: { x: 20, y: 10 } })
    await page.getByRole('dialog', { name: 'Block for Write report' }).getByRole('button', { name: 'Remove block' }).click()
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual({ action: 'setPlan', id: 'Write report', plan: null })
    expect(be.tasks[0].due).toBeNull()
    expect(be.tasks[0].deadline).toEqual({ date: addDays(today, 3) })
  })

  test('removing one of two blocks keeps the plan on the earliest', async ({ page }) => {
    const be = await open(page, {
      tasks: [task('Big project', { due: { date: `${today}T09:00:00` }, duration: { amount: 30, unit: 'minute' } })],
      blocks: [block('b1', 'Big project'), block('b2', 'Big project', { start_time: '14:00:00' })],
    })
    await page.locator('[data-block="b2"]').click({ position: { x: 20, y: 10 } })
    await page.getByRole('dialog', { name: 'Block for Big project' }).getByRole('button', { name: 'Remove block' }).click()
    await expect(page.locator('[data-block="b2"]')).toHaveCount(0)
    await page.waitForTimeout(300)
    expect(be.todoistWrites).toHaveLength(0)
  })

  test('a failed Todoist update keeps the block and says so', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    be.failTodoistWrites = true
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.getByRole('status')).toContainText("Todoist's planned time was not updated")
    await expect(page.locator('[data-kind="block"]', { hasText: 'Write report' })).toBeVisible()
  })

  test('a failed block save sends nothing to Todoist', async ({ page }) => {
    const be = await open(page, { tasks: [task('Write report')] })
    be.failBlockWrites = true
    await dragToSlot(page, page.locator('[data-task="Write report"]'), page.locator('[data-lane]').first(), 9)
    await expect(page.getByRole('status')).toContainText('Could not save that block')
    await page.waitForTimeout(300)
    expect(be.todoistWrites).toHaveLength(0)
  })
})