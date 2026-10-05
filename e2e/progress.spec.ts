import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSignedIn, type FakeDone, type FakeProject, type FakeSession, type FakeTask } from './fixtures'

// A Wednesday in week 4 of the term, 18 days before the blackout.
const NOW = '2026-10-28T10:00:00'
const TODAY = '2026-10-28'
const YESTERDAY = '2026-10-27'

const projects: FakeProject[] = [
  { id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 },
  { id: 'excel', name: 'Excel Outside Class', color: 'teal', child_order: 2 },
  { id: 'health', name: '55 kg and Healthy', color: 'orange', child_order: 3 },
  { id: 'write', name: 'Better Writer', color: 'grape', child_order: 4 },
  { id: 'life', name: 'Life Admin', color: 'charcoal', child_order: 9 },
]

/** One completion, as the saved history stores it. */
function tick(label: string, date: string, project: string, over: Partial<FakeDone> = {}): FakeDone {
  return { task_id: `${label}-${date}-${over.content ?? ''}`, content: label, project_id: project, labels: [label], date, completed_at: `${date}T07:00:00`, late: false, recurring: true, ...over }
}

const gymDays = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28']
const routineDays = ['2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28']
const bradburyDays = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-26', '2026-10-27']

const history: FakeDone[] = [
  ...gymDays.map((d) => tick('gym', d, 'health')),
  tick('gym', '2026-10-04', 'health'), // before the term: never counted
  ...routineDays.map((d) => tick('morning-routine', d, 'health')),
  ...bradburyDays.map((d) => tick('bradbury', d, 'write')),
  tick('bradbury', '2026-10-04', 'write'), // the night before the count starts
  tick('substack', '2026-10-25', 'write'),
  tick('hard-courses', '2026-10-24', 'gpa'),
  tick('assignments', '2026-10-20', 'gpa', { content: 'MIS report', recurring: false }),
  tick('assignments', '2026-10-22', 'gpa', { content: 'FM1 quiz', recurring: false, late: true }),
  tick('assignments', '2026-10-27', 'gpa', { content: 'QT2 sheet', recurring: false }),
  tick('competition', '2026-10-06', 'excel', { content: 'Sign up for the competition', recurring: false }),
  tick('errand', '2026-10-27', 'life', { content: 'Renew ID', recurring: false }),
  tick('errand', '2026-10-20', 'life', { content: 'Pay fees', recurring: false }),
]

const openTasks: FakeTask[] = [
  { id: 'e1', content: 'Pick the one competition', project_id: 'excel', labels: ['competition'], due: null, deadline: { date: '2026-10-12' } },
  { id: 'e2', content: 'Complete research paper', project_id: 'excel', labels: ['research-paper'], due: null, deadline: { date: '2027-02-28' } },
  { id: 'e3', content: 'Daily thing', project_id: 'excel', labels: [], due: { date: `${TODAY}T08:00:00`, is_recurring: true }, deadline: null },
  { id: 'l1', content: 'Passport photos', project_id: 'life', labels: [], due: null, deadline: { date: '2026-10-20' } },
  { id: 'l2', content: 'Book flights', project_id: 'life', labels: [], due: null, deadline: { date: '2026-11-10' } },
  { id: 'l3', content: 'Sort the desk', project_id: 'life', labels: [], due: null },
]

const sessions: FakeSession[] = [
  { task_id: 'x', minutes: 50, project_id: 'gpa', started_at: `${TODAY}T09:00:00` },
  { task_id: 'y', minutes: 30, project_id: 'write', started_at: `${YESTERDAY}T21:00:00` },
  { task_id: 'z', minutes: 60, project_id: 'gpa', started_at: '2026-10-21T10:00:00' },
]

async function open(page: Page, opts: Parameters<typeof openSignedIn>[1] = {}, now = NOW) {
  await page.clock.install({ time: new Date(now) })
  await page.addInitScript(() => {
    if (!location.hash) history.replaceState(null, '', '/#/progress')
  })
  const be = await openSignedIn(page, { projects, tasks: openTasks, done: history, sessions, ...opts })
  await page.locator('[data-progress-page]').waitFor()
  return be
}

const card = (page: Page, name: string) => page.locator(`[data-card="${name}"]`)
const stat = (scope: Locator, label: string) => scope.locator(`[data-stat="${label}"] b`)
const dots = (scope: Locator, label: string) => scope.locator(`[data-dots="${label}"] [data-day]`)

test.describe('the Progress page', () => {
  test('has its own tab between Plan and Vision, and the back button works', async ({ page }) => {
    await open(page, {}, NOW)
    await page.goto('/#/')
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible()
    expect(await page.getByRole('navigation', { name: 'Main' }).getByRole('button').allInnerTexts()).toEqual(['Plan', 'Progress', 'Vision'])
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    expect(page.url()).toContain('#/progress')
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible()
  })

  test('says which week of the term it is and how far off the blackout is', async ({ page }) => {
    await open(page)
    await expect(page.locator('[data-subtitle]')).toHaveText('Term 2, week 4 · 18 days to the blackout')
  })

  test('before the term it says when it starts', async ({ page }) => {
    await open(page, { done: [], sessions: [] }, '2026-10-03T10:00:00')
    await expect(page.locator('[data-subtitle]')).toHaveText(/^Term 2 starts 5 Oct · 43 days to the blackout$/)
  })

  test('after the blackout begins it says so', async ({ page }) => {
    await open(page, {}, '2026-11-20T10:00:00')
    await expect(page.locator('[data-subtitle]')).toHaveText('Term 2, week 7 · Blackout on, end-terms first')
  })
})

test.describe('Term 2 GPA', () => {
  test('reviews done against due, and assignments on time', async ({ page }) => {
    await open(page)
    const c = card(page, 'Term 2 GPA')
    await expect(stat(c, 'Hard-course reviews')).toHaveText('1 / 1') // the first review was due on 24 Oct
    await expect(stat(c, 'Assignments on time')).toHaveText('2 / 3') // one was late
  })

  test('says when reviews begin, and "None yet" with no assignments', async ({ page }) => {
    await open(page, { done: [], sessions: [] }, '2026-10-12T10:00:00')
    const c = card(page, 'Term 2 GPA')
    await expect(stat(c, 'Hard-course reviews')).toHaveText('Starts 24 Oct')
    await expect(stat(c, 'Assignments on time')).toHaveText('None yet')
  })

  test('shows no marks at all', async ({ page }) => {
    await open(page)
    await expect(page.getByText(/marks/i)).toHaveCount(0)
    await expect(page.getByPlaceholder('Score')).toHaveCount(0)
  })
})

test.describe('Excel Outside Class', () => {
  test('lists finished and open milestones in date order, with overdue flagged', async ({ page }) => {
    await open(page)
    const items = card(page, 'Excel Outside Class').locator('[data-milestone]')
    await expect(items).toHaveCount(3) // the repeating task is not a milestone
    expect(await items.evaluateAll((els) => els.map((e) => [e.getAttribute('data-milestone'), e.textContent]))).toEqual([
      ['done', expect.stringContaining('Sign up for the competition')],
      ['late', expect.stringContaining('Pick the one competition')],
      ['open', expect.stringContaining('Complete research paper')],
    ])
    await expect(items.nth(1)).toContainText('Overdue, 12 Oct')
    await expect(items.nth(0)).toContainText('Done')
    await expect(items.nth(2)).toContainText('28 Feb')
  })

  test('before the blackout: one competition this term; after it: the blackout is on', async ({ page }) => {
    await open(page)
    await expect(card(page, 'Excel Outside Class').locator('[data-blackout]')).toHaveText('One competition this term. No new commitments after 15 Nov.')
  })

  test('during the blackout it says no new commitments', async ({ page }) => {
    await open(page, {}, '2026-11-20T10:00:00')
    await expect(card(page, 'Excel Outside Class').locator('[data-blackout]')).toHaveText('Blackout is on: no new competitions or club commitments.')
  })
})

test.describe('55 kg and Healthy', () => {
  test('gym this week out of 3, and the last four weeks', async ({ page }) => {
    await open(page)
    const c = card(page, '55 kg and Healthy')
    await expect(stat(c, 'Gym this week')).toHaveText('2 / 3') // Mon 26 and Wed 28
    const counts = await c.locator('[data-bars="Gym, last 4 weeks"] [data-count]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-count'))))
    expect(counts).toEqual([3, 2, 3, 2]) // weeks of 5, 12, 19 and 26 Oct
  })

  test('counts nothing from before the term', async ({ page }) => {
    await open(page, { done: [tick('gym', '2026-10-04', 'health')] })
    await expect(stat(card(page, '55 kg and Healthy'), 'Gym this week')).toHaveText('0 / 3')
  })

  test('morning routine streak and its 14 days', async ({ page }) => {
    await open(page)
    const c = card(page, '55 kg and Healthy')
    await expect(stat(c, 'Morning routine streak')).toHaveText('3 days') // 26, 27, 28; the 25th was missed
    const d = dots(c, 'Morning routine')
    await expect(d).toHaveCount(14)
    await expect(c.locator('[data-dots="Morning routine"] [data-day="2026-10-28"]')).toHaveAttribute('data-state', 'true')
    await expect(c.locator('[data-dots="Morning routine"] [data-day="2026-10-25"]')).toHaveAttribute('data-state', 'null')
    await expect(c.locator('[data-dots="Morning routine"] [data-day="2026-10-24"]')).toHaveAttribute('data-state', 'true')
  })

  test('there is no clean-diet subgoal on tasks any more', async ({ page }) => {
    await open(page, {}, NOW)
    await page.goto('/#/')
    await page.getByRole('button', { name: 'New task', exact: true }).first().click()
    const d = page.getByRole('dialog', { name: 'New task' })
    await d.getByLabel('Goal').selectOption({ label: '55 kg and Healthy' })
    await expect(d.getByRole('button', { name: 'Gym' })).toBeVisible()
    await expect(d.getByRole('button', { name: 'Morning routine' })).toBeVisible()
    await expect(d.getByRole('button', { name: /clean diet/i })).toHaveCount(0)
  })
})

test.describe('clean diet', () => {
  const dietCard = (page: Page) => card(page, '55 kg and Healthy')
  const row = (page: Page, which: 'Yesterday' | 'Today') => dietCard(page).locator(`[data-diet-row="${which}"]`)

  test('answering saves the day, and the count updates', async ({ page }) => {
    const be = await open(page, { diet: { '2026-10-26': true } })
    await expect(dietCard(page)).toContainText('1 of 1 answered days')
    await row(page, 'Today').getByRole('button', { name: 'Clean' }).click()
    await expect(row(page, 'Today').getByRole('button', { name: 'Clean' })).toHaveAttribute('aria-pressed', 'true')
    await expect(dietCard(page)).toContainText('2 of 2 answered days')
    await expect.poll(() => be.dietWrites.length).toBe(1)
    expect(be.dietWrites[0]).toMatchObject({ method: 'POST', body: { date: TODAY, ok: true } })
    expect(be.diet[TODAY]).toBe(true)
  })

  test('"Not really" is saved as no', async ({ page }) => {
    const be = await open(page)
    await row(page, 'Yesterday').getByRole('button', { name: 'Not really' }).click()
    await expect.poll(() => be.dietWrites.length).toBe(1)
    expect(be.dietWrites[0].body).toMatchObject({ date: YESTERDAY, ok: false })
    await expect(dietCard(page)).toContainText('0 of 1 answered days')
  })

  test('tapping the chosen answer again clears it', async ({ page }) => {
    const be = await open(page, { diet: { [TODAY]: true } })
    await row(page, 'Today').getByRole('button', { name: 'Clean' }).click()
    await expect.poll(() => be.dietWrites.length).toBe(1)
    expect(be.dietWrites[0]).toMatchObject({ method: 'DELETE', query: expect.stringContaining(`date=eq.${TODAY}`) })
    expect(be.diet[TODAY]).toBeUndefined()
    await expect(row(page, 'Today').getByRole('button', { name: 'Clean' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('tapping a past day on the dots cycles its answer: clean, not really, none', async ({ page }) => {
    const be = await open(page)
    const dot = dietCard(page).locator('[data-dots="Clean diet"] [data-day="2026-10-24"]')
    await expect(dot).toHaveAttribute('data-state', 'null')
    await dot.click()
    await expect(dot).toHaveAttribute('data-state', 'true')
    await dot.click()
    await expect(dot).toHaveAttribute('data-state', 'false')
    await dot.click()
    await expect(dot).toHaveAttribute('data-state', 'null')
    await expect.poll(() => be.dietWrites.map((w) => w.method)).toEqual(['POST', 'POST', 'DELETE'])
    expect(be.dietWrites[0].body).toMatchObject({ date: '2026-10-24', ok: true })
    expect(be.dietWrites[1].body).toMatchObject({ date: '2026-10-24', ok: false })
  })

  test('a failed save puts the answer back and says so (invariant 4)', async ({ page }) => {
    const be = await open(page)
    be.failDietWrites = true
    await row(page, 'Today').getByRole('button', { name: 'Clean' }).click()
    await expect(page.getByRole('status').last()).toContainText('Could not save that answer')
    await expect(row(page, 'Today').getByRole('button', { name: 'Clean' })).toHaveAttribute('aria-pressed', 'false')
    expect(be.diet[TODAY]).toBeUndefined()
  })

  test('there is no clean-diet prompt on the Goals panel', async ({ page }) => {
    await open(page, {}, NOW)
    await page.goto('/#/')
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible()
    await expect(page.getByText('Clean diet yesterday?')).toHaveCount(0)
  })
})

test.describe('Better Writer', () => {
  test('Bradbury nights, streak, bar, essays and books', async ({ page }) => {
    await open(page)
    const c = card(page, 'Better Writer')
    await expect(stat(c, 'Bradbury nights')).toHaveText('5 / 1,000') // the night of the 4th is not counted
    await expect(stat(c, 'Current streak')).toHaveText('2 nights') // 26 and 27; tonight is not done yet
    await expect(stat(c, 'Essays published')).toHaveText('1')
    await expect(stat(c, 'Books finished')).toHaveText('0')
    await expect(dots(c, 'Bradbury')).toHaveCount(14)
    await expect(c.locator('[data-dots="Bradbury"] [data-day="2026-10-27"]')).toHaveAttribute('data-state', 'true')
    await expect(c.locator('[data-dots="Bradbury"] [data-day="2026-10-28"]')).toHaveAttribute('data-state', 'null')
  })

  test('a night done today extends the streak', async ({ page }) => {
    await open(page, { done: [...history, tick('bradbury', TODAY, 'write')] })
    await expect(stat(card(page, 'Better Writer'), 'Current streak')).toHaveText('3 nights')
    await expect(stat(card(page, 'Better Writer'), 'Bradbury nights')).toHaveText('6 / 1,000')
  })
})

test.describe('Life Admin', () => {
  test('done this week, overdue and open', async ({ page }) => {
    await open(page)
    const c = card(page, 'Life Admin')
    await expect(stat(c, 'Done this week')).toHaveText('1') // Renew ID on the 27th; Pay fees was last week
    await expect(stat(c, 'Overdue')).toHaveText('1') // Passport photos
    await expect(stat(c, 'Open')).toHaveText('3')
  })
})

test.describe('focus time', () => {
  test('each card shows its goal\'s focused time this week', async ({ page }) => {
    await open(page)
    await expect(card(page, 'Term 2 GPA').locator('[data-focus-line]')).toContainText('50m') // the 60 minutes were last week
    await expect(card(page, 'Better Writer').locator('[data-focus-line]')).toContainText('30m')
    await expect(card(page, 'Life Admin').locator('[data-focus-line]')).toContainText('0m')
  })

  test('the weekly strip shows tasks done, focus today and this week, gym and the 4-week bars', async ({ page }) => {
    await open(page)
    const strip = card(page, 'This week')
    await expect(stat(strip, 'Focus today')).toHaveText('50m')
    await expect(stat(strip, 'Focus this week')).toHaveText('1h 20m')
    await expect(stat(strip, 'Gym this week')).toHaveText('2 / 3')
    // Ticked this week (26 to 28 Oct): gym 2, routine 3, Bradbury 2, assignment 1, errand 1.
    await expect(stat(strip, 'Tasks done this week')).toHaveText('9')
    const counts = await strip.locator('[data-bars="Focus, last 4 weeks"] [data-count]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-count'))))
    expect(counts).toEqual([0, 0, 60, 80])
  })
})

test.describe('starting from nothing', () => {
  test('a brand new term shows zeros and friendly text, not errors', async ({ page }) => {
    await open(page, { done: [], sessions: [], tasks: [] }, '2026-10-05T09:00:00')
    await expect(page.locator('[data-subtitle]')).toHaveText('Term 2, week 1 · 41 days to the blackout')
    await expect(stat(card(page, '55 kg and Healthy'), 'Gym this week')).toHaveText('0 / 3')
    await expect(stat(card(page, 'Better Writer'), 'Bradbury nights')).toHaveText('0 / 1,000')
    await expect(card(page, 'Excel Outside Class')).toContainText('No milestones yet.')
    await expect(stat(card(page, 'Term 2 GPA'), 'Assignments on time')).toHaveText('None yet')
  })
})

test('Refresh asks the server to copy new completions', async ({ page }) => {
  const be = await open(page)
  const before = be.syncDoneCalls
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect.poll(() => be.syncDoneCalls).toBeGreaterThan(before)
})
