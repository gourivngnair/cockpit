import { expect, test } from '@playwright/test'
import { openSignedIn, ymd, type FakeEvent, type FakeTask } from './fixtures'

const today = ymd(new Date())
const tomorrow = ymd(new Date(Date.now() + 864e5))

const klass: FakeEvent = { id: 'e-a', title: 'Strategy', date: today, start_time: '10:00:00', end_time: '11:30:00', room: 'B12', kind: 'class' }
const tasks: FakeTask[] = [
  { id: 't1', content: 'Morning routine', project_id: 'p1', due: { date: today + 'T08:00:00', is_recurring: true } },
  { id: 't2', content: 'Submit essay', project_id: 'p1', due: null, deadline: { date: today } },
]

test('calendar shows classes and repeating tasks as grey dashed blocks, deadlines as all-day chips', async ({ page }) => {
  await openSignedIn(page, { tasks, events: [klass] })
  await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible()

  const cls = page.locator('[data-kind="class"]', { hasText: 'Strategy' })
  await expect(cls).toBeVisible()
  await expect(cls).toContainText('10a to 11:30a, B12')
  await expect(cls).toHaveCSS('border-top-style', 'dashed')

  await expect(page.locator('[data-kind="rt"]', { hasText: 'Morning routine' })).toHaveCSS('border-top-style', 'dashed')
  await expect(page.locator('[data-deadline="t2"]')).toContainText('Due: Submit essay')
  await expect(page.locator('[data-deadline="t2"]')).toHaveCSS('color', 'rgb(240, 68, 58)')
})

test('one-off events are solid blue, classes stay grey dashed', async ({ page }) => {
  const talk: FakeEvent = { id: 'e-t', title: 'Leadership Talk', date: today, start_time: '16:45:00', end_time: '18:15:00', room: 'TATAAUDITORIUM', kind: 'event' }
  await openSignedIn(page, { tasks: [], events: [klass, talk] })
  const ev = page.locator('[data-kind="event"]', { hasText: 'Leadership Talk' })
  await expect(ev).toBeVisible()
  await expect(ev).toHaveCSS('border-top-style', 'solid')
  await expect(page.locator('[data-kind="class"]', { hasText: 'Strategy' })).toHaveCSS('border-top-style', 'dashed')
})

test('exams are solid red', async ({ page }) => {
  const exam: FakeEvent = { id: 'e-x', title: 'FM1 Mid-Term', date: today, start_time: '08:30:00', end_time: '10:00:00', room: '', kind: 'exam' }
  await openSignedIn(page, { tasks: [], events: [exam] })
  const ev = page.locator('[data-kind="exam"]', { hasText: 'FM1 Mid-Term' })
  await expect(ev).toBeVisible()
  await expect(ev).toHaveCSS('border-top-style', 'solid')
})

test('week view lays out seven days', async ({ page }) => {
  await openSignedIn(page, { tasks, events: [klass] })
  await page.getByRole('button', { name: 'Week' }).click()
  await expect(page.locator('[data-lane]')).toHaveCount(7)
  await expect(page.locator('[data-kind="class"]', { hasText: 'Strategy' })).toBeAttached()
})

test('importing a week saves the classes and shows them', async ({ page }) => {
  const backend = await openSignedIn(page, { tasks: [], events: [] })
  await page.getByRole('button', { name: 'Schedule' }).click()

  const dialog = page.getByRole('dialog', { name: 'Schedule' })
  await dialog.getByLabel('Schedule from Claude').fill('not json')
  await expect(dialog.getByRole('alert')).toContainText('not valid JSON')
  await expect(dialog.getByRole('button', { name: 'Import' })).toBeDisabled()

  const json = JSON.stringify([{ title: 'Operations', date: tomorrow, start: '14:00', end: '15:30', room: 'A3' }])
  await dialog.getByLabel('Schedule from Claude').fill(json)
  await expect(dialog).toContainText('1 item ready')
  await dialog.getByRole('button', { name: 'Import' }).click()

  await expect(dialog.getByText('Operations', { exact: false }).first()).toBeVisible()
  expect(backend.events).toHaveLength(1)
  expect(backend.events[0]).toMatchObject({ title: 'Operations', start_time: '14:00', end_time: '15:30' })
})

test('a failed save rolls back and tells the user (invariant 4)', async ({ page }) => {
  const backend = await openSignedIn(page, { tasks: [], events: [klass] })
  backend.failEventWrites = true
  await page.getByRole('button', { name: 'Schedule' }).click()
  const dialog = page.getByRole('dialog', { name: 'Schedule' })

  await dialog.getByRole('button', { name: 'Remove Strategy' }).click()
  await expect(page.getByRole('status')).toContainText('Could not remove the class')
  await expect(dialog.getByRole('button', { name: 'Remove Strategy' })).toBeVisible()
  expect(backend.events).toHaveLength(1)
})
