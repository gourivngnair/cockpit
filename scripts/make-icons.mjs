// Generates the PWA icons (dark rounded square, light inner square) with no dependencies.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

function png(size) {
  const ink = [0x1c, 0x1c, 0x1e]
  const light = [0xf2, 0xf2, 0xf3]
  const inner = size * 0.17 // half-width of the inner square
  const mid = size / 2
  const r = size * 0.22 // corner radius of the background
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      // inside rounded rect?
      const dx = Math.max(r - x - 0.5, x + 0.5 - (size - r), 0)
      const dy = Math.max(r - y - 0.5, y + 0.5 - (size - r), 0)
      const inside = dx * dx + dy * dy <= r * r
      const isInner = Math.abs(x + 0.5 - mid) <= inner && Math.abs(y + 0.5 - mid) <= inner
      const col = isInner ? light : ink
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = col[0]
      raw[o + 1] = col[1]
      raw[o + 2] = col[2]
      raw[o + 3] = inside ? 255 : 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
for (const s of [192, 512]) writeFileSync(`public/pwa-${s}.png`, png(s))
console.log('icons written')
