import { expect, test } from '@playwright/test'

test('signed-out visitors see the login form, not the app', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Cockpit' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByText('Goals')).toHaveCount(0)
})

test('serves an installable web manifest', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.display).toBe('standalone')
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
})

test('the service worker installs, so the app works offline and can receive push', async ({ page }) => {
  await page.goto('/')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready
        return `${reg.active?.state} ${reg.active?.scriptURL.split('/').pop()}`
      }),
    )
    .toBe('activated sw.js')
})