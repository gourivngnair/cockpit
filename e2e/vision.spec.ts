import { expect, test, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { pickToday } from '../src/vision/today'
import { openSignedIn, ymd, type FakeVision } from './fixtures'

const today = ymd(new Date())
const USER = 'u1' // the fake signed-in user in the test backend

/** A flat-colour PNG of any size, built here so the app has a real "big photo" to shrink. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const row = Buffer.alloc(width * 3 + 1)
  for (let x = 0; x < width; x++) row.set([0xb0, 0x60, 0x40], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Width and height of the JPEG inside an upload request body. */
function jpegSize(body: Buffer): { width: number; height: number } {
  let i = body.indexOf(Buffer.from([0xff, 0xd8])) + 2
  while (i < body.length) {
    if (body[i] !== 0xff) break
    const marker = body[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: body.readUInt16BE(i + 5), width: body.readUInt16BE(i + 7) }
    }
    i += 2 + body.readUInt16BE(i + 2)
  }
  throw new Error('no JPEG found')
}

const vimg = (n: number, over: Partial<FakeVision> = {}): FakeVision => {
  const id = `img${n}`
  return { id, storage_path: `${USER}/${id}.jpg`, caption: '', theme: 'Unsorted', created_at: `2026-09-0${n}T10:00:00Z`, width: 800, height: 600, pinned_on: null, ...over }
}

async function open(page: Page, opts: Parameters<typeof openSignedIn>[1] = {}, hash = '#/vision') {
  await page.addInitScript((h) => {
    if (!location.hash) history.replaceState(null, '', `/${h}`)
  }, hash)
  return openSignedIn(page, { projects: [{ id: 'gpa', name: 'Term 2 GPA', color: 'berry_red', child_order: 1 }], tasks: [], ...opts })
}

const board = (page: Page) => page.locator('[data-vision-page]')
const tile = (page: Page, id: string) => page.locator(`[data-image="${id}"] button`)
const upload = (page: Page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) => page.getByLabel('Upload images').setInputFiles(files)

test.describe('the Vision page', () => {
  test('has its own tab, and the browser back button returns to the plan', async ({ page }) => {
    await open(page, {}, '')
    await page.getByRole('button', { name: 'Vision' }).click()
    await expect(page.getByRole('heading', { name: 'Vision board' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Vision' })).toHaveAttribute('aria-current', 'page')
    expect(page.url()).toContain('#/vision')
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Vision board' })).toBeVisible()
  })

  test('opens straight onto the board from its address', async ({ page }) => {
    await open(page, { vision: [vimg(1)] })
    await expect(page.getByRole('heading', { name: 'Vision board' })).toBeVisible()
  })

  test('shows a friendly empty state, and the Pinterest link', async ({ page }) => {
    await open(page)
    await expect(board(page)).toContainText('Upload the pins you downloaded')
    const link = page.getByRole('link', { name: 'Pinterest board' })
    await expect(link).toHaveAttribute('href', 'https://pin.it/3M7bCmDl1')
    await expect(link).toHaveAttribute('target', '_blank')
  })
})

test.describe('uploading', () => {
  test('shrinks big photos, uploads a main and a small copy, and saves the rows', async ({ page }) => {
    const be = await open(page)
    await upload(page, [
      { name: 'big.png', mimeType: 'image/png', buffer: png(2400, 1600) },
      { name: 'small.png', mimeType: 'image/png', buffer: png(800, 600) },
    ])
    await expect(page.getByRole('status').last()).toContainText('2 images added')
    await expect.poll(() => be.uploads.length).toBe(4)

    const sizes = Object.fromEntries(be.uploads.map((u) => [u.path.replace(/^.*\//, ''), jpegSize(u.body)]))
    const names = Object.keys(sizes)
    const mains = names.filter((n) => !n.includes('-thumb'))
    expect(mains).toHaveLength(2)
    // The big photo is shrunk to 1600 on its longest side and 480 for the grid; the small one is not enlarged.
    const bigMain = mains.find((n) => sizes[n].width === 1600)!
    expect(sizes[bigMain]).toEqual({ width: 1600, height: 1067 })
    expect(sizes[bigMain.replace('.jpg', '-thumb.jpg')]).toEqual({ width: 480, height: 320 })
    const smallMain = mains.find((n) => n !== bigMain)!
    expect(sizes[smallMain]).toEqual({ width: 800, height: 600 })
    expect(sizes[smallMain.replace('.jpg', '-thumb.jpg')]).toEqual({ width: 480, height: 360 })

    expect(be.vision).toHaveLength(2)
    for (const row of be.vision) {
      expect(row.storage_path).toMatch(new RegExp(`^${USER}/[0-9a-f-]+\\.jpg$`))
      expect(row).toMatchObject({ caption: '', theme: 'Unsorted' })
      expect(row.width).toBeGreaterThan(0)
    }
    await expect(page.locator('[data-image]')).toHaveCount(2)
  })

  test('refuses files that are not images, saving nothing', async ({ page }) => {
    const be = await open(page)
    await upload(page, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }])
    await expect(page.getByRole('status').last()).toContainText('notes.txt (not an image)')
    expect(be.uploads).toHaveLength(0)
    expect(be.vision).toHaveLength(0)
  })

  test('a file that says it is an image but is not readable is reported, not saved', async ({ page }) => {
    const be = await open(page)
    await upload(page, [{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not a png') }])
    await expect(page.getByRole('status').last()).toContainText('broken.png (could not be read as an image)')
    expect(be.uploads).toHaveLength(0)
    expect(be.vision).toHaveLength(0)
  })

  test('if the small copy fails to upload, the main copy is removed and no row is saved', async ({ page }) => {
    const be = await open(page)
    be.failUploadMatch = '-thumb'
    await upload(page, [{ name: 'a.png', mimeType: 'image/png', buffer: png(800, 600) }])
    await expect(page.getByRole('status').last()).toContainText('could not be added: a.png')
    expect(be.vision).toHaveLength(0)
    await expect.poll(() => be.removedPaths.length).toBe(1)
    expect(be.removedPaths[0]).toBe(be.uploads[0].path) // the main copy that had already gone up
  })

  test('if the row cannot be saved, both copies are removed', async ({ page }) => {
    const be = await open(page)
    be.failVisionWrites = true
    await upload(page, [{ name: 'a.png', mimeType: 'image/png', buffer: png(800, 600) }])
    await expect(page.getByRole('status').last()).toContainText('could not be added: a.png')
    expect(be.vision).toHaveLength(0)
    await expect.poll(() => be.removedPaths.length).toBe(2)
    expect(be.removedPaths.sort()).toEqual(be.uploads.map((u) => u.path).sort())
  })

  test('a good file still goes through when another in the same batch is bad', async ({ page }) => {
    const be = await open(page)
    await upload(page, [
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
      { name: 'ok.png', mimeType: 'image/png', buffer: png(800, 600) },
    ])
    await expect(page.getByRole('status').last()).toContainText('1 image added')
    await expect(page.getByRole('status').last()).toContainText('notes.txt (not an image)')
    expect(be.vision).toHaveLength(1)
  })

  test('pasting an image from the clipboard uploads it', async ({ page }) => {
    const be = await open(page)
    await expect(board(page)).toBeVisible()
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, png(300, 200).toString('base64'))
    await expect.poll(() => be.vision.length).toBe(1)
    expect(be.uploads).toHaveLength(2)
  })

  test('dropping an image onto the page uploads it', async ({ page }) => {
    const be = await open(page)
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
      document.querySelector('[data-vision-page]')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    }, png(300, 200).toString('base64'))
    await expect.poll(() => be.vision.length).toBe(1)
  })
})

test.describe('the grid', () => {
  test('asks for secure links to the small copies, never public ones', async ({ page }) => {
    const be = await open(page, { vision: [vimg(1), vimg(2)] })
    await expect(page.locator('[data-image] img')).toHaveCount(2)
    const asked = be.signCalls.flat()
    expect(asked).toContain(`${USER}/img1-thumb.jpg`)
    expect(asked).toContain(`${USER}/img2-thumb.jpg`)
    // The grid loads only small copies. The one full-size copy is today's image, kept ready for the Focus background.
    expect(asked.filter((p) => !p.includes('-thumb'))).toHaveLength(1)
    const src = await page.locator('[data-image] img').first().getAttribute('src')
    expect(src).toContain('/object/sign/vision/')
    expect(src).toContain('token=')
  })

  test('theme chips filter the grid, and Unsorted has no chip', async ({ page }) => {
    await open(page, { vision: [vimg(1, { theme: 'Career' }), vimg(2, { theme: 'Career' }), vimg(3, { theme: 'Travel' }), vimg(4)] })
    const chips = page.getByRole('group', { name: 'Filter by theme' })
    await expect(chips.getByRole('button')).toHaveText(['All', 'Career', 'Travel'])
    await expect(page.locator('[data-image]')).toHaveCount(4)
    await chips.getByRole('button', { name: 'Career' }).click()
    await expect(page.locator('[data-image]')).toHaveCount(2)
    await chips.getByRole('button', { name: 'Travel' }).click()
    await expect(page.locator('[data-image]')).toHaveCount(1)
    await chips.getByRole('button', { name: 'All' }).click()
    await expect(page.locator('[data-image]')).toHaveCount(4)
  })

  test('shows the newest first', async ({ page }) => {
    await open(page, { vision: [vimg(1), vimg(3), vimg(2)] })
    await expect(page.locator('[data-image]')).toHaveCount(3)
    expect(await page.locator('[data-image]').evaluateAll((els) => els.map((e) => e.getAttribute('data-image')))).toEqual(['img3', 'img2', 'img1'])
  })

  test('works with no connection: the saved list still shows', async ({ page }) => {
    const be = await open(page, { vision: [vimg(1, { caption: 'Stay curious' })] })
    await expect(page.locator('[data-image]')).toHaveCount(1)
    be.failVisionReads = true
    await page.reload()
    await expect(page.locator('[data-image]')).toHaveCount(1)
  })
})

test.describe('the full-size view', () => {
  const three = [vimg(1, { caption: 'First' }), vimg(2, { caption: 'Second' }), vimg(3, { caption: 'Third' })]

  test('opens an image, steps with the arrows, and closes with Escape', async ({ page }) => {
    const be = await open(page, { vision: three })
    await tile(page, 'img3').click()
    const view = page.getByRole('dialog', { name: 'Image' })
    await expect(view).toContainText('1 of 3')
    await expect(view.getByLabel('Caption')).toHaveValue('Third')
    // The full-size copy is fetched now, not before.
    await expect.poll(() => be.signCalls.flat().includes(`${USER}/img3.jpg`)).toBe(true)

    await view.getByRole('button', { name: 'Next image' }).click()
    await expect(view).toContainText('2 of 3')
    await expect(view.getByLabel('Caption')).toHaveValue('Second')
    await page.keyboard.press('ArrowRight')
    await expect(view.getByLabel('Caption')).toHaveValue('First')
    await page.keyboard.press('ArrowRight') // wraps around
    await expect(view.getByLabel('Caption')).toHaveValue('Third')
    await page.keyboard.press('ArrowLeft')
    await expect(view.getByLabel('Caption')).toHaveValue('First')
    await page.keyboard.press('Escape')
    await expect(view).toHaveCount(0)
  })

  test('editing the caption and theme saves them, and a cleared theme goes back to Unsorted', async ({ page }) => {
    const be = await open(page, { vision: [vimg(1, { theme: 'Career' }), vimg(2, { theme: 'Travel' })] })
    await tile(page, 'img2').click()
    const view = page.getByRole('dialog', { name: 'Image' })
    await view.getByLabel('Caption').fill('  Be brave  ')
    await view.getByLabel('Theme').focus() // leaving the caption saves it
    await expect.poll(() => be.visionWrites.length).toBe(1)
    expect(be.visionWrites[0]).toMatchObject({ method: 'PATCH', body: { caption: 'Be brave' }, query: expect.stringContaining('id=eq.img2') })

    await view.getByLabel('Theme').fill('Career')
    await view.getByLabel('Theme').press('Enter')
    await expect.poll(() => be.visionWrites.length).toBe(2)
    expect(be.visionWrites[1].body).toEqual({ theme: 'Career' })

    await view.getByLabel('Theme').fill('')
    await view.getByLabel('Theme').press('Enter')
    await expect.poll(() => be.visionWrites.length).toBe(3)
    expect(be.visionWrites[2].body).toEqual({ theme: 'Unsorted' })
    expect(be.vision.find((v) => v.id === 'img2')).toMatchObject({ caption: 'Be brave', theme: 'Unsorted' })
  })

  test('theme suggestions come from the themes already in use', async ({ page }) => {
    await open(page, { vision: [vimg(1, { theme: 'Career' }), vimg(2, { theme: 'Travel' }), vimg(3)] })
    await tile(page, 'img3').click()
    const options = await page.locator('#vision-themes option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
    expect(options).toEqual(['Career', 'Travel'])
  })

  test('a failed save puts the old caption back and says so', async ({ page }) => {
    const be = await open(page, { vision: [vimg(1, { caption: 'Original' })] })
    be.failVisionWrites = true
    await tile(page, 'img1').click()
    const view = page.getByRole('dialog', { name: 'Image' })
    await view.getByLabel('Caption').fill('Changed')
    await view.getByLabel('Theme').focus()
    await expect(page.getByRole('status').last()).toContainText('Could not save that change')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-image="img1"] button')).toHaveAttribute('aria-label', 'Open Original')
  })

  test('removing asks first, then deletes the row and both files', async ({ page }) => {
    const be = await open(page, { vision: three_() })
    let asked = ''
    page.on('dialog', (d) => {
      asked = d.message()
      void d.accept()
    })
    await tile(page, 'img2').click()
    await page.getByRole('dialog', { name: 'Image' }).getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('[data-image="img2"]')).toHaveCount(0)
    expect(asked).toContain('cannot be undone')
    await expect.poll(() => be.removedPaths.length).toBe(2)
    expect(be.removedPaths.sort()).toEqual([`${USER}/img2-thumb.jpg`, `${USER}/img2.jpg`])
    expect(be.vision.map((v) => v.id)).toEqual(['img1', 'img3'])
  })

  test('declining the question keeps the image', async ({ page }) => {
    const be = await open(page, { vision: three_() })
    page.on('dialog', (d) => void d.dismiss())
    await tile(page, 'img2').click()
    await page.getByRole('dialog', { name: 'Image' }).getByRole('button', { name: 'Remove' }).click()
    await page.waitForTimeout(300)
    expect(be.visionWrites).toHaveLength(0)
    expect(be.removedPaths).toHaveLength(0)
  })

  test('a failed removal brings the image back and says so', async ({ page }) => {
    const be = await open(page, { vision: three_() })
    be.failVisionWrites = true
    page.on('dialog', (d) => void d.accept())
    await tile(page, 'img2').click()
    await page.getByRole('dialog', { name: 'Image' }).getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByRole('status').last()).toContainText('Could not remove that image')
    await expect(page.locator('[data-image="img2"]')).toHaveCount(1)
    expect(be.removedPaths).toHaveLength(0) // the files stay while the row stays
  })

  test('"Show this one today" pins it for today, and can be undone', async ({ page }) => {
    const be = await open(page, { vision: three_() })
    await tile(page, 'img1').click()
    const view = page.getByRole('dialog', { name: 'Image' })
    await view.getByRole('button', { name: 'Show this one today' }).click()
    await expect(view.getByRole('button', { name: 'Pinned for today' })).toBeVisible()
    await expect.poll(() => be.visionWrites.length).toBe(2)
    // First any earlier pin for today is cleared, then this one is set.
    expect(be.visionWrites[0]).toMatchObject({ method: 'PATCH', body: { pinned_on: null }, query: expect.stringContaining(`pinned_on=eq.${today}`) })
    expect(be.visionWrites[1]).toMatchObject({ method: 'PATCH', body: { pinned_on: today }, query: expect.stringContaining('id=eq.img1') })

    await view.getByRole('button', { name: 'Pinned for today' }).click()
    await expect(view.getByRole('button', { name: 'Show this one today' })).toBeVisible()
    await expect.poll(() => be.vision.find((v) => v.id === 'img1')?.pinned_on).toBeNull()
  })
})

function three_(): FakeVision[] {
  return [vimg(1), vimg(2), vimg(3)]
}

test.describe("today's vision on the Plan screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  const images = [vimg(1, { caption: 'First', theme: 'Career' }), vimg(2, { caption: 'Second' }), vimg(3, { caption: 'Third' })]
  const expected = (shift = 0) => pickToday(images.map((i) => ({ id: i.id, createdAt: i.created_at, pinnedOn: i.pinned_on })), today, shift)!.id

  test("shows today's image with its caption, the same one on every device", async ({ page }) => {
    await open(page, { vision: images }, '')
    const panel = page.locator('[data-todays-image]').first()
    await expect(panel).toHaveAttribute('data-todays-image', expected())
    const name = images.find((i) => i.id === expected())!
    await expect(page.getByRole('heading', { name: name.caption })).toBeVisible()
    await expect(page.getByRole('heading', { name: "Today's vision" })).toBeVisible()
  })

  test('shows the theme under the caption, but not for Unsorted', async ({ page }) => {
    await open(page, { vision: [vimg(1, { caption: 'Only one', theme: 'Career' })] }, '')
    await expect(page.getByRole('heading', { name: 'Only one' })).toBeVisible()
    await expect(page.locator('p', { hasText: /^Career$/ })).toBeVisible()
  })

  test('the shuffle button shows another image, and keeps going round', async ({ page }) => {
    await open(page, { vision: images }, '')
    const img = page.locator('[data-todays-image]').first()
    await expect(img).toHaveAttribute('data-todays-image', expected(0))
    await page.getByRole('button', { name: 'Show another image' }).first().click()
    await expect(img).toHaveAttribute('data-todays-image', expected(1))
    await page.getByRole('button', { name: 'Show another image' }).first().click()
    await page.getByRole('button', { name: 'Show another image' }).first().click()
    await expect(img).toHaveAttribute('data-todays-image', expected(0)) // back to the start after three
  })

  test('a pinned image is shown today whatever the rotation says', async ({ page }) => {
    const pinnedId = images.map((i) => i.id).find((id) => id !== expected())!
    await open(page, { vision: images.map((i) => (i.id === pinnedId ? { ...i, pinned_on: today } : i)) }, '')
    await expect(page.locator('[data-todays-image]').first()).toHaveAttribute('data-todays-image', pinnedId)
  })

  test('no shuffle button with only one image', async ({ page }) => {
    await open(page, { vision: [vimg(1)] }, '')
    await expect(page.locator('[data-todays-image]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show another image' })).toHaveCount(0)
  })

  test('with no images it invites you to add some, and the button goes to the board', async ({ page }) => {
    await open(page, { vision: [] }, '')
    await expect(page.getByText('Your vision shows here.')).toBeVisible()
    await page.getByRole('button', { name: 'Add images' }).click()
    await expect(page.getByRole('heading', { name: 'Vision board' })).toBeVisible()
  })

  test('keeps a copy of the image on the device so it still shows with no connection', async ({ page }) => {
    const be = await open(page, { vision: images }, '')
    const id = expected()
    await expect(page.locator('[data-todays-image]').first()).toHaveAttribute('data-todays-image', id)
    await expect
      .poll(() => page.evaluate(async (key) => !!(await (await caches.open('cockpit-vision-images')).match(key)), `/vision-cache/${id}`))
      .toBe(true)

    // No connection: the list comes from the saved copy and the links cannot be made.
    be.failSign = true
    be.failVisionReads = true
    await page.reload()
    const img = page.locator('[data-todays-image]').first()
    await expect(img).toHaveAttribute('data-todays-image', id)
    await expect.poll(() => img.getAttribute('src')).toMatch(/^blob:/)
  })
})

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('today\'s image is a slim strip above the calendar, and the side panel is hidden', async ({ page }) => {
    await open(page, { vision: [vimg(1, { caption: 'Stay curious' })] }, '')
    const banner = page.locator('[data-vision-banner]')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Stay curious')
    await expect(page.getByRole('heading', { name: "Today's vision" })).toBeHidden()
  })

  test('the strip is not shown in the week view, which needs the room', async ({ page }) => {
    await open(page, { vision: [vimg(1)] }, '')
    await page.getByRole('button', { name: 'Week' }).click()
    await expect(page.locator('[data-vision-banner]')).toHaveCount(0)
  })

  test('a wide screen has the side panel and no strip', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, { vision: [vimg(1)] }, '')
    await expect(page.getByRole('heading', { name: "Today's vision" })).toBeVisible()
    await expect(page.locator('[data-vision-banner]')).toBeHidden()
  })
})

test.describe('Focus mode background', () => {
  test("uses today's image, blurred, and the Next image button changes it", async ({ page }) => {
    await open(page, { vision: [vimg(1, { caption: 'First' }), vimg(2, { caption: 'Second' })] }, '')
    await expect(page.locator('[data-todays-image]').first()).toBeAttached()
    await page.getByRole('button', { name: 'Focus mode' }).click()
    const bg = page.locator('[data-focus-image]')
    await expect(bg).toBeAttached()
    const first = await bg.evaluate((el) => (el as HTMLElement).style.backgroundImage)
    expect(first).toContain('/object/sign/vision/')
    expect(await bg.evaluate((el) => (el as HTMLElement).style.filter)).toContain('blur')

    await page.getByRole('button', { name: 'Next image' }).click()
    await expect.poll(() => bg.evaluate((el) => (el as HTMLElement).style.backgroundImage)).not.toBe(first)
  })

  test('with no images it keeps the plain dark background and has no Next image button', async ({ page }) => {
    await open(page, { vision: [] }, '')
    await page.getByRole('button', { name: 'Focus mode' }).click()
    await expect(page.getByRole('dialog', { name: 'Focus mode' })).toBeVisible()
    await expect(page.locator('[data-focus-image]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Next image' })).toHaveCount(0)
  })
})
