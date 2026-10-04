import { expect, test, type Page } from '@playwright/test'
import { openSignedIn, ymd, type FakeProject, type FakeTask } from './fixtures'

const today = ymd(new Date())
const projects: FakeProject[] = [{ id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 }]

/**
 * Chromium in a test has no real push service, so stand one in: subscribing returns a fake
 * subscription. Everything the app does with it (saving it, sending a test, removing it) is real.
 */
async function fakePush(page: Page, permission: NotificationPermission = 'default') {
  await page.addInitScript((initial) => {
    // Headless Chromium will not grant notification permission, so stand that in too.
    let perm: NotificationPermission = initial
    Object.defineProperty(Notification, 'permission', { get: () => perm })
    Notification.requestPermission = async () => (perm = 'granted')
    let current: unknown = null
    const make = () => ({
      endpoint: 'https://push.example/device-1',
      toJSON: () => ({ endpoint: 'https://push.example/device-1', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
      unsubscribe: async () => {
        current = null
        return true
      },
    })
    PushManager.prototype.subscribe = async () => (current = make()) as unknown as PushSubscription
    PushManager.prototype.getSubscription = async () => current as PushSubscription | null
  }, permission)
}

test.describe('notifications', () => {
  test('turning on saves this device, and the test button asks the server to send one', async ({ page }) => {
    await fakePush(page)
    const be = await openSignedIn(page, { projects, tasks: [] })
    await page.getByRole('button', { name: 'Notifications' }).click()
    const d = page.getByRole('dialog', { name: 'Notifications' })
    await expect(d).toContainText('10 minutes before each class')
    await expect(d).toContainText('8 am')
    await expect(d.locator('[data-push-state]')).toHaveAttribute('data-push-state', 'off')

    await d.getByRole('button', { name: 'Turn on' }).click()
    await expect(d.locator('[data-push-state]')).toHaveAttribute('data-push-state', 'on')
    expect(be.pushWrites.filter((w) => w.method === 'POST')).toHaveLength(1)
    expect(be.pushWrites.find((w) => w.method === 'POST')!.body).toMatchObject({ endpoint: 'https://push.example/device-1', p256dh: 'p256dh-key', auth: 'auth-key' })

    await d.getByRole('button', { name: 'Send a test' }).click()
    await expect.poll(() => be.notifyCalls.length).toBe(1)
    expect(be.notifyCalls[0]).toEqual({ test: true })
    await expect(page.getByRole('status')).toContainText('Test sent to 1 device')
  })

  test('turning off forgets this device', async ({ page }) => {
    await fakePush(page)
    const be = await openSignedIn(page, { projects, tasks: [] })
    await page.getByRole('button', { name: 'Notifications' }).click()
    const d = page.getByRole('dialog', { name: 'Notifications' })
    await d.getByRole('button', { name: 'Turn on' }).click()
    await expect(d.locator('[data-push-state]')).toHaveAttribute('data-push-state', 'on')
    await d.getByRole('button', { name: 'Turn off' }).click()
    await expect(d.locator('[data-push-state]')).toHaveAttribute('data-push-state', 'off')
    expect(be.pushWrites.filter((w) => w.method === 'DELETE').length).toBeGreaterThan(0)
  })
})

test.describe('notifications blocked', () => {
  test('says so when the browser has blocked them', async ({ page }) => {
    await fakePush(page, 'denied')
    await openSignedIn(page, { projects, tasks: [] })
    await page.getByRole('button', { name: 'Notifications' }).click()
    const d = page.getByRole('dialog', { name: 'Notifications' })
    await expect(d.locator('[data-push-state]')).toHaveAttribute('data-push-state', 'blocked')
    await expect(d).toContainText('blocked')
    await expect(d.getByRole('button', { name: 'Turn on' })).toHaveCount(0)
  })
})

test.describe('completion history', () => {
  const task = (id: string, over: Partial<FakeTask> = {}): FakeTask => ({ id, content: id, project_id: 'gpa', labels: [], due: null, ...over })

  test('the app asks the server to copy Todoist completions when it opens', async ({ page }) => {
    const be = await openSignedIn(page, { projects, tasks: [task('A')] })
    await expect.poll(() => be.syncDoneCalls).toBeGreaterThan(0)
  })

  test('a block whose task was completed stays on its day, faded and struck through, after a reload', async ({ page }) => {
    await page.clock.install({ time: new Date(`${today}T07:30:00`) })
    await openSignedIn(page, {
      projects,
      tasks: [], // the task is no longer open in Todoist
      blocks: [{ id: 'b1', task_id: 'Finished essay', date: today, start_time: '09:00:00', minutes: 60 }],
      done: [{ task_id: 'Finished essay', content: 'Finished essay', project_id: 'gpa' }],
    })
    const done = page.locator('[data-kind="done"]', { hasText: 'Finished essay' })
    await expect(done).toBeVisible()
    await expect(done.locator('b')).toHaveCSS('text-decoration-line', 'line-through')
    await expect(done).not.toHaveAttribute('data-drag-block', /.*/)
  })

  test('a block whose task is in neither list is not shown', async ({ page }) => {
    await openSignedIn(page, {
      projects,
      tasks: [],
      blocks: [{ id: 'b1', task_id: 'Mystery', date: today, start_time: '09:00:00', minutes: 60 }],
      done: [],
    })
    await page.waitForTimeout(500)
    await expect(page.locator('[data-block]')).toHaveCount(0)
  })
})
