// Generates public/noise.png — a 128×128 monochrome, tileable noise PNG used as
// the global dither layer (§6.1 law 5). Pure Node, no dependencies.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const W = 128
const H = 128

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// Deterministic PRNG (mulberry32) so the asset is reproducible.
let seed = 0x9e3779b9
const rand = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Grayscale 8-bit rows, each prefixed by filter byte 0. Triangular-PDF noise
// centred on mid-grey reads as film grain rather than static.
const raw = Buffer.alloc((W + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W + 1)] = 0
  for (let x = 0; x < W; x++) {
    const v = (rand() + rand()) * 0.5
    raw[y * (W + 1) + 1 + x] = Math.round(64 + v * 191)
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 0 // greyscale
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync('public', { recursive: true })
writeFileSync('public/noise.png', png)
console.log(`public/noise.png written (${png.length} bytes)`)
