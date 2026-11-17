/**
 * Precomputed image + depth map for the /about depth-parallax set-piece.
 * A studio still-life (ceramic spheres, a plinth, a chrome ring) is rendered
 * analytically, so the depth map is exact — no ML depth estimation needed.
 * Replace with a real portrait + its depth map when photography exists.
 */
export function drawDepthStill(w = 1000, h = 1250) {
  const img = document.createElement('canvas')
  const dep = document.createElement('canvas')
  img.width = dep.width = w
  img.height = dep.height = h
  const g = img.getContext('2d')!
  const gd = dep.getContext('2d')!
  const I = g.createImageData(w, h)
  const D = gd.createImageData(w, h)
  const L = normalize([-0.55, 0.65, 0.52])

  interface Sphere { x: number; y: number; r: number; c: number[] }
  const spheres: Sphere[] = [
    { x: 0.52, y: 0.5, r: 0.27, c: [231, 226, 216] },
    { x: 0.24, y: 0.76, r: 0.11, c: [205, 211, 224] },
    { x: 0.8, y: 0.73, r: 0.075, c: [222, 205, 190] },
  ]
  const floorY = 0.82
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = px / w
      const v = py / h
      const ar = h / w
      // background cyclorama
      let col = mix([238, 236, 231], [247, 246, 243], Math.min(1, v * 1.2))
      let depth = 0.04 + Math.max(0, v - floorY) * 1.2
      // plinth
      if (u > 0.3 && u < 0.74 && v > 0.74 && v < floorY + 0.12) {
        const shade = u < 0.33 ? 0.9 : 1 - (u - 0.33) * 0.35
        col = mix([226, 222, 214], [210, 206, 198], 1 - shade)
        if (v < 0.752) col = [244, 242, 238] // lit top edge
        depth = 0.42
      }
      // floor contact shadows (tinted)
      for (const s of spheres) {
        const dx = (u - s.x) / (s.r * 1.6)
        const dy = (v - (s.y + s.r / ar)) / (s.r * 0.25)
        const k = Math.exp(-(dx * dx + dy * dy) * 1.4)
        col = mix(col, [38, 46, 64], k * 0.22)
      }
      // spheres
      for (const s of spheres) {
        const dx = (u - s.x) / s.r
        const dy = ((v - s.y) * ar) / s.r
        const d2 = dx * dx + dy * dy
        if (d2 < 1) {
          const nz = Math.sqrt(1 - d2)
          const n = [dx, -dy, nz]
          const lam = Math.max(0, dot(n, L))
          const rim = Math.pow(1 - nz, 3) * 0.25
          const k = 0.32 + lam * 0.72 + rim
          col = s.c.map((c) => Math.min(255, c * k + (Math.random() - 0.5) * 3))
          depth = 0.5 + nz * 0.5 * (s.r / 0.27)
        }
      }
      // chrome ring (ellipse band in front)
      const ex = (u - 0.52) / 0.43
      const ey = ((v - 0.5) * ar) / 0.12
      const er = Math.sqrt(ex * ex + ey * ey)
      if (Math.abs(er - 1) < 0.018 && (ey > 0 || er > 1.0)) {
        const t = (Math.sin(ex * 9) + 1) / 2
        col = mix([120, 126, 136], [252, 252, 255], t)
        depth = 0.95
      }
      const i = (py * w + px) * 4
      I.data[i] = col[0]!
      I.data[i + 1] = col[1]!
      I.data[i + 2] = col[2]!
      I.data[i + 3] = 255
      const dv = Math.round(Math.min(1, depth) * 255)
      D.data[i] = D.data[i + 1] = D.data[i + 2] = dv
      D.data[i + 3] = 255
    }
  }
  g.putImageData(I, 0, 0)
  gd.putImageData(D, 0, 0)
  // soften depth edges to avoid tearing at discontinuities
  const soft = document.createElement('canvas')
  soft.width = w
  soft.height = h
  const sg = soft.getContext('2d')!
  sg.filter = 'blur(6px)'
  sg.drawImage(dep, 0, 0)
  return { image: img, depth: soft }
}

const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
function normalize(v: number[]) {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!)
  return v.map((x) => x / l)
}
function mix(a: number[], b: number[], t: number) {
  return a.map((x, i) => x + (b[i]! - x) * t)
}
