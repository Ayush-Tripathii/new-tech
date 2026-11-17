import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * Armature segment geometry. Each segment is a machined spherical-shell patch
 * (outer, inner and four side walls) with an angular tolerance gap so seams
 * catch shadow. Geometry is re-centred on its centroid so segments tumble
 * about their own centre when dispersed.
 */

export interface SegmentDef {
  geometry: THREE.BufferGeometry
  center: THREE.Vector3
  normal: THREE.Vector3
  /** 0..1 deterministic per-segment random */
  rand: number
}

const sph = (out: THREE.Vector3, r: number, th: number, ph: number) =>
  out.set(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph))

/**
 * Grid surface builder with analytic normals. Winding is verified per-triangle
 * against the desired normal so FrontSide culling is always correct.
 */
function surface(
  nu: number,
  nv: number,
  pos: (u: number, v: number, out: THREE.Vector3) => void,
  nrm: (u: number, v: number, out: THREE.Vector3) => void,
): THREE.BufferGeometry {
  const P: number[] = []
  const N: number[] = []
  const I: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv
      pos(u, v, p)
      nrm(u, v, n)
      P.push(p.x, p.y, p.z)
      N.push(n.x, n.y, n.z)
    }
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), want = new THREE.Vector3()
  const tri = (i0: number, i1: number, i2: number) => {
    a.fromArray(P, i0 * 3)
    b.fromArray(P, i1 * 3)
    c.fromArray(P, i2 * 3)
    fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a))
    if (fn.lengthSq() < 1e-14) return // degenerate (pole)
    want.fromArray(N, i0 * 3).add(n.fromArray(N, i1 * 3)).add(n.fromArray(N, i2 * 3))
    if (fn.dot(want) >= 0) I.push(i0, i1, i2)
    else I.push(i0, i2, i1)
  }
  const row = nu + 1
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * row + i
      tri(k, k + 1, k + row)
      tri(k + 1, k + row + 1, k + row)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  // simple planar uvs for the grain map
  const uv: number[] = []
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) uv.push(i / nu, j / nv)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(I)
  return g
}

function shellPatch(R: number, r: number, t0: number, t1: number, p0: number, p1: number): THREE.BufferGeometry {
  const nu = 10, nv = 8, ns = 2
  const parts: THREE.BufferGeometry[] = []
  const th = (v: number) => t0 + (t1 - t0) * v
  const ph = (u: number) => p0 + (p1 - p0) * u
  // outer
  parts.push(
    surface(nu, nv, (u, v, o) => sph(o, R, th(v), ph(u)), (u, v, o) => sph(o, 1, th(v), ph(u))),
  )
  // inner
  parts.push(
    surface(nu, nv, (u, v, o) => sph(o, r, th(v), ph(u)), (u, v, o) => sph(o, -1, th(v), ph(u))),
  )
  // theta walls (latitude edges) — normal = ∓ d/dθ
  const dTheta = (th_: number, ph_: number, sign: number, o: THREE.Vector3) =>
    o.set(Math.cos(th_) * Math.cos(ph_), -Math.sin(th_), Math.cos(th_) * Math.sin(ph_)).multiplyScalar(sign)
  if (t0 > 1e-3) {
    parts.push(surface(nu, ns, (u, v, o) => sph(o, r + (R - r) * v, t0, ph(u)), (u, _v, o) => dTheta(t0, ph(u), -1, o)))
  }
  if (t1 < Math.PI - 1e-3) {
    parts.push(surface(nu, ns, (u, v, o) => sph(o, r + (R - r) * v, t1, ph(u)), (u, _v, o) => dTheta(t1, ph(u), 1, o)))
  }
  // phi walls (longitude edges) — normal = ∓ d/dφ
  const dPhi = (ph_: number, sign: number, o: THREE.Vector3) => o.set(-Math.sin(ph_), 0, Math.cos(ph_)).multiplyScalar(sign)
  parts.push(surface(ns, nv, (u, v, o) => sph(o, r + (R - r) * u, th(v), p0), (_u, _v, o) => dPhi(p0, -1, o)))
  parts.push(surface(ns, nv, (u, v, o) => sph(o, r + (R - r) * u, th(v), p1), (_u, _v, o) => dPhi(p1, 1, o)))
  const merged = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * The sphere armature. 6 latitude bands × N longitude slices; the equatorial
 * band is omitted to open a window onto the glass core.
 */
export function buildSphereSegments(slices = 8, R = 1, r = 0.84, gap = 0.014): SegmentDef[] {
  const bands: [number, number][] = [
    [0, 0.52],
    [0.52, 0.98],
    [0.98, 1.4],
    [1.74, 2.16],
    [2.16, 2.62],
    [2.62, Math.PI],
  ]
  const defs: SegmentDef[] = []
  let k = 0
  for (const [a, b] of bands) {
    for (let s = 0; s < slices; s++) {
      const p0 = (s / slices) * Math.PI * 2
      const p1 = ((s + 1) / slices) * Math.PI * 2
      const t0 = a === 0 ? 0 : a + gap
      const t1 = b === Math.PI ? Math.PI : b - gap
      // pole caps shrink their phi gap with sin(theta) so seams look even
      const geo = shellPatch(R, r, t0, t1, p0 + gap * 1.4, p1 - gap * 1.4)
      const tc = (t0 + t1) / 2
      const pc = (p0 + p1) / 2
      const normal = sph(new THREE.Vector3(), 1, tc, pc).normalize()
      geo.computeBoundingBox()
      const center = new THREE.Vector3()
      geo.boundingBox!.getCenter(center)
      geo.translate(-center.x, -center.y, -center.z)
      const rand = fract(Math.sin(k * 91.7 + 13.1) * 43758.5453)
      defs.push({ geometry: geo, center, normal, rand })
      k++
    }
  }
  return defs
}

const fract = (x: number) => x - Math.floor(x)

/** Machined "404": rounded ceramic blocks on a 3×5 bitmap per glyph. */
export function build404Segments(): SegmentDef[] {
  const four = ['101', '101', '111', '001', '001']
  const zero = ['111', '101', '101', '101', '111']
  const glyphs = [four, zero, four]
  const cell = 0.36
  const size = 0.33
  const defs: SegmentDef[] = []
  const totalW = (3 * 3 + 2) * cell
  let k = 0
  glyphs.forEach((g, gi) => {
    g.forEach((row, ry) => {
      Array.from(row).forEach((ch, rx) => {
        if (ch !== '1') return
        const x = (gi * 4 + rx) * cell - totalW / 2 + cell / 2
        const y = (2 - ry) * cell
        const geo = new RoundedBoxGeometry(size, size, size * 1.1, 3, 0.05)
        const center = new THREE.Vector3(x, y, 0)
        const normal = new THREE.Vector3(x * 0.6, y * 0.6, 1).normalize()
        const rand = fract(Math.sin(k * 51.3 + 7.7) * 43758.5453)
        defs.push({ geometry: geo, center, normal, rand })
        k++
      })
    })
  })
  return defs
}
