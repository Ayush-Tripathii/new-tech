import type { Project } from './content'

/**
 * Procedural project imagery — studio-lit compositions of ceramic primitives
 * on a coloured cyclorama, one per project. Stands in for real case-study
 * photography (replace with real assets; the API stays the same).
 * Rendered to canvas; DOM consumers receive a cached object URL.
 */

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
const rgba = (c: readonly number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const shade = (c: readonly number[], k: number) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))))
const mixc = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t))

export function drawProjectArt(p: Project, w: number, h: number, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const rnd = hash(p.slug)
  const base = hexToRgb(p.color)
  const tone = hexToRgb(p.tone)
  const paper = [247, 246, 243] as const

  // cyclorama: tone wall → lighter floor, soft horizon
  const bg = g.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, rgba(mixc(tone, paper, 0.15)))
  bg.addColorStop(0.62, rgba(mixc(tone, paper, 0.45)))
  bg.addColorStop(1, rgba(mixc(tone, paper, 0.7)))
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)

  const floorY = h * (0.68 + rnd() * 0.08)
  const lightX = w * (0.2 + rnd() * 0.25)

  const forms = 2 + Math.floor(rnd() * 3)
  const placed: { x: number; r: number }[] = []
  for (let i = 0; i < forms; i++) {
    const kind = Math.floor(rnd() * 3) // 0 sphere, 1 block, 2 cylinder
    const r = h * (0.1 + rnd() * 0.16)
    let x = w * (0.22 + rnd() * 0.6)
    for (const q of placed) if (Math.abs(q.x - x) < (q.r + r) * 0.9) x = q.x + (q.r + r) * (x > q.x ? 1 : -1)
    placed.push({ x, r })
    const col = i === 0 ? base : rnd() > 0.5 ? mixc(paper, tone, 0.3) : mixc(base, paper, 0.55)
    const lightDir = (x - lightX) / w

    // contact + cast shadow (tinted, layered)
    const sh = g.createRadialGradient(x + r * 0.5, floorY, 1, x + r * 0.5, floorY, r * 2)
    sh.addColorStop(0, 'rgba(38,46,64,0.32)')
    sh.addColorStop(0.35, 'rgba(38,46,64,0.12)')
    sh.addColorStop(1, 'rgba(38,46,64,0)')
    g.save()
    g.translate(0, floorY)
    g.scale(1, 0.2)
    g.translate(0, -floorY)
    g.fillStyle = sh
    g.beginPath()
    g.arc(x + r * 0.5, floorY, r * 2, 0, Math.PI * 2)
    g.fill()
    g.restore()

    if (kind === 0) {
      const cy = floorY - r
      const grd = g.createRadialGradient(x - r * 0.4 - lightDir * r, cy - r * 0.45, r * 0.05, x, cy, r * 1.05)
      grd.addColorStop(0, rgba(mixc(col, [255, 255, 255], 0.55)))
      grd.addColorStop(0.55, rgba(col))
      grd.addColorStop(1, rgba(shade(col, 0.62)))
      g.fillStyle = grd
      g.beginPath()
      g.arc(x, cy, r, 0, Math.PI * 2)
      g.fill()
    } else if (kind === 1) {
      const bw = r * 1.5, bh = r * (1.2 + rnd() * 1.4)
      const top = floorY - bh
      const grd = g.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0)
      grd.addColorStop(0, rgba(mixc(col, [255, 255, 255], 0.25)))
      grd.addColorStop(1, rgba(shade(col, 0.78)))
      g.fillStyle = grd
      g.fillRect(x - bw / 2, top, bw, bh)
      g.fillStyle = rgba(mixc(col, [255, 255, 255], 0.45))
      g.fillRect(x - bw / 2, top, bw, 2)
    } else {
      const cw = r * 1.1, ch = r * (1.6 + rnd() * 1.2)
      const top = floorY - ch
      const grd = g.createLinearGradient(x - cw, 0, x + cw, 0)
      grd.addColorStop(0, rgba(shade(col, 0.82)))
      grd.addColorStop(0.3, rgba(mixc(col, [255, 255, 255], 0.4)))
      grd.addColorStop(1, rgba(shade(col, 0.66)))
      g.fillStyle = grd
      g.fillRect(x - cw, top, cw * 2, ch)
      g.fillStyle = rgba(mixc(col, [255, 255, 255], 0.3))
      g.beginPath()
      g.ellipse(x, top, cw, cw * 0.22, 0, 0, Math.PI * 2)
      g.fill()
    }
  }

  // chrome hairline ring motif
  g.strokeStyle = 'rgba(255,255,255,0.65)'
  g.lineWidth = Math.max(1, w / 700)
  g.beginPath()
  g.ellipse(w * (0.4 + rnd() * 0.3), h * 0.42, w * 0.32, h * 0.08, -0.2 + rnd() * 0.4, 0, Math.PI * 2)
  g.stroke()

  // grain
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 7
    d[i] = d[i]! + n
    d[i + 1] = d[i + 1]! + n
    d[i + 2] = d[i + 2]! + n
  }
  g.putImageData(img, 0, 0)

  // caption
  g.fillStyle = rgba(shade(base, 0.35), 0.8)
  g.font = `500 ${Math.round(Math.min(h * 0.035, 22 * (w / 1000)))}px ui-monospace, monospace`
  g.fillText(`${p.discipline.toUpperCase()} — ${p.year}`, w * 0.05, h * 0.09)
  return c
}

const urlCache = new Map<string, Promise<string>>()
/** Object URL for an <img>; cached per slug+size. */
export function projectArtURL(p: Project, w = 1200, h = 800): Promise<string> {
  const key = `${p.slug}@${w}x${h}`
  let v = urlCache.get(key)
  if (!v) {
    v = new Promise((resolve) => {
      const c = drawProjectArt(p, w, h)
      c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : c.toDataURL('image/jpeg', 0.9)), 'image/webp', 0.9)
    })
    urlCache.set(key, v)
  }
  return v
}

/**
 * Client-side dominant colour: downsample to 72×72, quantise into coarse
 * buckets (4 bits/channel), take the modal bucket. Near-white/near-black
 * pixels are ignored so the cyclorama doesn't win.
 */
export function dominantColor(src: CanvasImageSource): [number, number, number] {
  const c = document.createElement('canvas')
  c.width = c.height = 72
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, 72, 72)
  const d = g.getImageData(0, 0, 72, 72).data
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, gg = d[i + 1]!, b = d[i + 2]!
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b)
    if (max > 238 && min > 228) continue
    if (max < 24) continue
    const sat = max === 0 ? 0 : (max - min) / max
    const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    const wgt = 1 + sat * 2 // favour chroma over greys
    e.n += wgt
    e.r += r * wgt
    e.g += gg * wgt
    e.b += b * wgt
    buckets.set(key, e)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e
  if (!best) return [128, 128, 128]
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)]
}
