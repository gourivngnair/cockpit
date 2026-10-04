/**
 * Getting a photo ready for upload. Phone photos are huge, so each one is shrunk in the browser:
 * a main copy (at most 1600 px) and a small copy (at most 480 px) for the grid. That keeps pages
 * fast and the free 1 GB of storage going a very long way.
 */

export const MAIN_MAX = 1600
export const THUMB_MAX = 480
export const QUALITY = 0.82
export const MAX_FILES = 20 // per upload
export const MAX_BYTES = 15 * 1024 * 1024 // per original file

/** The size that fits inside `max` on its longest side, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** A readable reason a file cannot be used, or null when it is fine. */
export function checkFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!file.type.startsWith('image/')) return 'not an image'
  if (file.size > MAX_BYTES) return `larger than ${MAX_BYTES / 1024 / 1024} MB`
  if (file.size === 0) return 'empty'
  return null
}

/** Where the small copy of an image lives, given the path of the main copy. */
export const thumbPath = (path: string) => path.replace(/\.jpg$/, '-thumb.jpg')

export interface ProcessedImage {
  main: Blob
  thumb: Blob
  width: number
  height: number
}

async function toJpeg(bitmap: ImageBitmap, size: { width: number; height: number }): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot resize images.')
  ctx.fillStyle = '#ffffff' // a transparent PNG becomes white rather than black
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert the image.'))), 'image/jpeg', QUALITY))
}

export async function processImage(file: File): Promise<ProcessedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file) // honours the photo's rotation
  } catch {
    throw new Error('could not be read as an image')
  }
  try {
    const main = fitWithin(bitmap.width, bitmap.height, MAIN_MAX)
    const thumb = fitWithin(bitmap.width, bitmap.height, THUMB_MAX)
    return { main: await toJpeg(bitmap, main), thumb: await toJpeg(bitmap, thumb), width: main.width, height: main.height }
  } finally {
    bitmap.close()
  }
}
