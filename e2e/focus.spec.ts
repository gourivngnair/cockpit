import { expect, test, type Page } from '@playwright/test'
import { initialState, reduce } from '../src/focus/machine'
import { openSignedIn, ymd, type FakeBlock, type FakeProject, type FakeTask } from './fixtures'

const today = ymd(new Date())
const projects: FakeProject[] = [{ id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 }]
const task = (id: string, over: Partial<FakeTask> = {}): FakeTask => ({ id, content: id, project_id: 'gpa', labels: ['assignments'], due: null, ...over })
const block = (id: string, task_id: string, over: Partial<FakeBlock> = {}): FakeBlock => ({ id, task_id, date: today, start_time: '09:30:00', minutes: 60, ...over })

const MIN = 60_000

/** Jumps the fake clock forward, like a device that slept, then lets the timer notice. */
async function jump(page: Page, ms: number) {
  await page.clock.fastForward(ms)
  await page.clock.runFor(500)
}

declare global {
  interface Window {
    __beeps: Array<{ when: number; freq: number }>
    __opened: string[]
  }
}

/** A stand-in audio engine that records when each beep is scheduled, and a window.open that records links. */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    window.__beeps = []
    window.__opened = []
    window.open = ((url?: string | URL) => {
      window.__opened.push(String(url))
      return null
    }) as typeof window.open
    class FakeContext {
      currentTime = 0
      state = 'running'
      destination = {}
      resume() {
        return Promise.resolve()
      }
      createGain() {
        return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { value: 0 },
          connect() {},
          disconnect() {},
          start(when: number) {
            window.__beeps.push({ when, freq: osc.frequency.value })
          },
          stop() {},
        }
        return osc
      }
    }
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeContext
  })
}

async function open(page: Page, opts: Parameters<typeof openSignedIn>[1] = {}) {
  await fakeAudio(page)
  await page.clock.install({ time: new Date(`${today}T09:00:00`) })
  const be = await openSignedIn(page, { projects, tasks: [task('Write report')], ...opts })
  await page.locator('[data-calscroll]').waitFor()
  return be
}

const screen = (page: Page) => page.getByRole('dialog', { name: 'Focus mode' })
const clock = (page: Page) => page.locator('[data-focus-time]')

async function openFocus(page: Page) {
  await page.getByRole('button', { name: 'Focus mode' }).click()
  await expect(screen(page)).toBeVisible()
}

test.describe('the timer', () => {
  test('opens from the top bar, shows the presets and counts down', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await expect(clock(page)).toHaveText('25:00')
    await expect(screen(page).getByRole('button', { name: '25 / 5' })).toHaveAttribute('aria-pressed', 'true')

    await screen(page).getByRole('button', { name: '15 / 3' }).click()
    await expect(clock(page)).toHaveText('15:00')
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await expect(screen(page)).toHaveAttribute('data-focus-running', 'true')
    await page.clock.runFor(60 * 1000)
    await expect(clock(page)).toHaveText('14:00')
  })

  test('the preset cannot change once a session is running', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await expect(screen(page).getByRole('group', { name: 'Round lengths' })).toHaveCount(0)
  })

  test('pause keeps the exact time and resume carries on', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await page.clock.runFor(60 * 1000)
    await screen(page).getByRole('button', { name: 'Pause' }).click()
    await expect(clock(page)).toHaveText('24:00')
    await page.clock.runFor(10 * MIN)
    await expect(clock(page)).toHaveText('24:00')
    await screen(page).getByRole('button', { name: 'Resume' }).click()
    await page.clock.runFor(60 * 1000)
    await expect(clock(page)).toHaveText('23:00')
  })

  test('Space starts and pauses, Escape minimises into a pill that reopens it', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await page.keyboard.press('Space')
    await expect(screen(page)).toHaveAttribute('data-focus-paused', 'false')
    await page.keyboard.press('Space')
    await expect(screen(page)).toHaveAttribute('data-focus-paused', 'true')
    await page.keyboard.press('Space')
    await page.keyboard.press('Escape')
    await expect(screen(page)).toHaveCount(0)
    const pill = page.locator('[data-focus-pill]')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText('25:00')
    await pill.click()
    await expect(screen(page)).toBeVisible()
  })

  test('the countdown is in the tab title while it runs', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await page.clock.runFor(61 * 1000)
    await expect.poll(() => page.title()).toBe('23:59 focus · Cockpit')
  })
})

test.describe('rounds and breaks', () => {
  async function startShort(page: Page) {
    await openFocus(page)
    await screen(page).getByRole('button', { name: '15 / 3' }).click()
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
  }

  test('a finished round is logged, and the break starts by itself', async ({ page }) => {
    const be = await open(page)
    await startShort(page)
    await jump(page, 15 * MIN + 2000)
    await expect(screen(page)).toHaveAttribute('data-focus-phase', 'short')
    await expect(screen(page).locator('[data-focus-label]')).toHaveText('Short break')
    await expect(clock(page)).toHaveText(/0[23]:\d\d/)
    await expect.poll(() => be.sessionWrites.length).toBe(1)
    expect(be.sessionWrites[0]).toMatchObject({ minutes: 15, completed: true, task_id: null })
    await expect(screen(page).locator('.text-\\[13px\\]').last()).toContainText('1 focus session today')
  })

  test('after the break the next round waits for Start', async ({ page }) => {
    await open(page)
    await startShort(page)
    await jump(page, 15 * MIN + 2000)
    await expect(screen(page)).toHaveAttribute('data-focus-phase', 'short')
    await jump(page, 3 * MIN + 1000)
    await expect(screen(page)).toHaveAttribute('data-focus-phase', 'focus')
    await expect(screen(page)).toHaveAttribute('data-focus-paused', 'true')
    await expect(screen(page).locator('[data-focus-label]')).toHaveText('Next: round 2 of 4')
    await expect(screen(page).getByRole('button', { name: 'Start focus' })).toBeVisible()
    await expect(clock(page)).toHaveText('15:00')
  })

  test('skipping to the break logs the time so far, as not completed', async ({ page }) => {
    const be = await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await jump(page, 10 * MIN + 30_000)
    await screen(page).getByRole('button', { name: 'Skip to break' }).click()
    await expect(screen(page)).toHaveAttribute('data-focus-phase', 'short')
    await expect.poll(() => be.sessionWrites.length).toBe(1)
    expect(be.sessionWrites[0]).toMatchObject({ minutes: 10, completed: false })
  })

  test('ending early saves the partial round; under a minute saves nothing', async ({ page }) => {
    const be = await open(page)
    page.on('dialog', (d) => void d.accept())
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await page.clock.runFor(30_000)
    await screen(page).getByRole('button', { name: 'End focus' }).click()
    await page.waitForTimeout(300)
    expect(be.sessionWrites).toHaveLength(0)

    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await jump(page, 12 * MIN)
    await screen(page).getByRole('button', { name: 'End focus' }).click()
    await expect.poll(() => be.sessionWrites.length).toBe(1)
    expect(be.sessionWrites[0]).toMatchObject({ minutes: 12, completed: false })
  })
})

test.describe('the beeps', () => {
  test('5-4-3-2-1 ticks and a long tone are scheduled for the end of the round, on the device that pressed Start', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: '15 / 3' }).click()
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await expect.poll(() => page.evaluate(() => window.__beeps.length)).toBe(6)
    const beeps = await page.evaluate(() => window.__beeps)
    // The last five seconds of 15 minutes, then the tone at the end.
    expect(beeps.map((b) => Math.round(b.when))).toEqual([895, 896, 897, 898, 899, 900])
    expect(beeps.slice(0, 5).every((b) => b.freq === 880)).toBe(true)
    expect(beeps[5].freq).toBe(1320)
  })

  test('the break gets its own countdown when it starts', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: '15 / 3' }).click()
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await jump(page, 15 * MIN + 2000)
    await expect(screen(page)).toHaveAttribute('data-focus-phase', 'short')
    // 6 for the round, 6 for the 3 minute break (ticks at 175..179 s and the tone at 180 s).
    await expect.poll(() => page.evaluate(() => window.__beeps.length)).toBe(12)
    const last = await page.evaluate(() => window.__beeps.slice(6).map((b) => Math.round(b.when)))
    expect(last).toEqual([175, 176, 177, 178, 179, 180])
  })

  test('pausing cancels the scheduled beeps, and resuming plans them again', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await expect.poll(() => page.evaluate(() => window.__beeps.length)).toBe(6)
    await page.clock.runFor(2000)
    await screen(page).getByRole('button', { name: 'Pause' }).click()
    await screen(page).getByRole('button', { name: 'Resume' }).click()
    await expect.poll(() => page.evaluate(() => window.__beeps.length)).toBe(12)
  })

  test('another device running the timer plays no beeps here', async ({ page }) => {
    const now = new Date(`${today}T09:00:00`).getTime()
    const base = initialState(now)
    const remote = reduce(base, { type: 'start', by: 'the-tablet' }, now).state
    await open(page, { focusState: remote })
    const pill = page.locator('[data-focus-pill]')
    await expect(pill).toBeVisible()
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => window.__beeps.length)).toBe(0)
    await pill.click()
    await expect(screen(page)).toContainText('Running on another device')
  })

  test('volume at zero schedules nothing', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByLabel('Beep volume').fill('0')
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => window.__beeps.length)).toBe(0)
  })
})

test.describe('across devices', () => {
  test('a timer started elsewhere shows up within seconds, and one started here is saved for others', async ({ page }) => {
    const be = await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await page.clock.runFor(500) // lets the delayed save go out
    await expect.poll(() => be.focusWrites.length).toBeGreaterThan(0)
    const saved = (be.focusWrites.at(-1) as { state: { running: boolean; by: string; endsAt: number } }).state
    expect(saved).toMatchObject({ running: true })
    expect(saved.endsAt).toBeGreaterThan(Date.now() - 24 * 60 * MIN)
    expect(typeof saved.by).toBe('string')
  })

  test('a newer timer from another device replaces ours; an older one is ignored', async ({ page }) => {
    const be = await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await expect(screen(page)).toHaveAttribute('data-focus-running', 'true')
    await page.clock.runFor(500) // lets the delayed save go out
    const mine = (be.focusWrites.at(-1) as { state: ReturnType<typeof initialState> }).state

    // The tablet ends the session (a higher seq).
    const ended = reduce(mine, { type: 'end' }, Date.now()).state
    be.focusRow = { state: ended }
    await page.clock.runFor(6000)
    await expect(screen(page)).toHaveAttribute('data-focus-running', 'false')

    // A stale copy (lower seq) does not bring the old session back.
    be.focusRow = { state: mine }
    await page.clock.runFor(6000)
    await expect(screen(page)).toHaveAttribute('data-focus-running', 'false')
  })
})

test.describe('tasks', () => {
  test('a block has a Focus button that opens Focus mode on its task', async ({ page }) => {
    await open(page, { blocks: [block('b1', 'Write report')] })
    await page.locator('[data-block="b1"]').click({ position: { x: 20, y: 10 } })
    await page.getByRole('dialog', { name: 'Block for Write report' }).getByRole('button', { name: 'Focus' }).click()
    await expect(screen(page)).toBeVisible()
    await expect(screen(page)).toContainText('Write report')
    await expect(screen(page).getByRole('button', { name: 'Write report' })).toHaveAttribute('aria-pressed', 'true')
  })

  test("the task menu's Focus item opens it too", async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Options for Write report' }).click()
    await page.getByRole('menuitem', { name: 'Focus on this' }).click()
    await expect(screen(page)).toBeVisible()
  })

  test('the top bar button picks the task whose block is on right now', async ({ page }) => {
    // The clock is 09:00 and this block runs 08:30 to 09:30.
    await open(page, { blocks: [block('b1', 'Write report', { start_time: '08:30:00' })] })
    await openFocus(page)
    await expect(screen(page).getByRole('button', { name: 'Write report' })).toHaveAttribute('aria-pressed', 'true')
  })

  test("today's planned tasks can be chosen before starting, or Just focus", async ({ page }) => {
    await open(page, { tasks: [task('Write report'), task('Read chapter')], blocks: [block('b1', 'Write report'), block('b2', 'Read chapter', { start_time: '11:00:00' })] })
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Read chapter' }).click()
    await expect(screen(page).getByRole('button', { name: 'Read chapter' })).toHaveAttribute('aria-pressed', 'true')
    await screen(page).getByRole('button', { name: 'Just focus' }).click()
    await expect(screen(page).getByRole('button', { name: 'Just focus' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a finished round is saved against its task', async ({ page }) => {
    const be = await open(page, { blocks: [block('b1', 'Write report', { start_time: '08:30:00' })] })
    await openFocus(page)
    await screen(page).getByRole('button', { name: '15 / 3' }).click()
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await jump(page, 15 * MIN + 2000)
    await expect.poll(() => be.sessionWrites.length).toBe(1)
    expect(be.sessionWrites[0]).toMatchObject({ task_id: 'Write report', content: 'Write report', project_id: 'gpa', minutes: 15, completed: true })
    await page.getByRole('button', { name: 'Minimise' }).click()
    await expect(page.locator('[data-task="Write report"] [data-focused]')).toHaveText('15m')
  })

  test('focused time shows on each task', async ({ page }) => {
    await open(page, { sessions: [{ task_id: 'Write report', minutes: 50 }, { task_id: 'Write report', minutes: 30 }] })
    await expect(page.locator('[data-task="Write report"] [data-focused]')).toHaveText('1h 20m')
  })

  test('Mark task done completes it in Todoist and the timer carries on as plain focus', async ({ page }) => {
    const be = await open(page, { blocks: [block('b1', 'Write report', { start_time: '08:30:00' })] })
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    await screen(page).getByRole('button', { name: 'Mark task done' }).click()
    await expect.poll(() => be.todoistWrites.length).toBe(1)
    expect(be.todoistWrites[0]).toEqual({ action: 'close', id: 'Write report' })
    await expect(screen(page).getByRole('button', { name: 'Mark task done' })).toHaveCount(0)
    await expect(screen(page)).toHaveAttribute('data-focus-running', 'true')
    await expect(screen(page)).toContainText('Just focus')
  })
})

test.describe('the playlist link', () => {
  test('saves a link, and opens it when focus starts', async ({ page }) => {
    const be = await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Add playlist' }).click()
    await screen(page).getByLabel('Playlist link').fill('https://open.spotify.com/playlist/abc')
    await screen(page).getByRole('button', { name: 'Save' }).click()
    await expect(screen(page).getByRole('button', { name: 'Open playlist' })).toBeVisible()
    await page.clock.runFor(500) // lets the delayed save go out
    await expect.poll(() => be.focusWrites.length).toBeGreaterThan(0)
    expect((be.focusWrites.at(-1) as { state: { playlist: string; playlistAuto: boolean } }).state).toMatchObject({ playlist: 'https://open.spotify.com/playlist/abc', playlistAuto: true })

    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    expect(await page.evaluate(() => window.__opened)).toEqual(['https://open.spotify.com/playlist/abc'])
  })

  test('"Open with focus" can be switched off, and a non-link is refused', async ({ page }) => {
    await open(page)
    await openFocus(page)
    await screen(page).getByRole('button', { name: 'Add playlist' }).click()
    await screen(page).getByLabel('Playlist link').fill('not a link')
    await screen(page).getByRole('button', { name: 'Save' }).click()
    await expect(screen(page).getByLabel('Playlist link')).toBeVisible() // still editing
    await screen(page).getByLabel('Playlist link').fill('https://youtu.be/xyz')
    await screen(page).getByRole('button', { name: 'Save' }).click()
    await screen(page).getByLabel('Open with focus').uncheck()
    await screen(page).getByRole('button', { name: 'Start focus' }).click()
    expect(await page.evaluate(() => window.__opened)).toEqual([])
  })
})
