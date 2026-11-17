import * as THREE from 'three'

/**
 * Shared WebGL plumbing: renderer factory with a hard concurrent-context cap,
 * deep disposal, and small texture generators (baked contact shadow, ceramic
 * micro-roughness) so no image files are needed for materials.
 */

export interface RendererOpts {
  alpha?: boolean
  antialias?: boolean
  shadows?: boolean
  dpr: number
}

export function createRenderer(canvas: HTMLCanvasElement, o: RendererOpts) {
  const r = new THREE.WebGLRenderer({
    canvas,
    alpha: o.alpha ?? false,
    antialias: o.antialias ?? true,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: false,
  })
  r.setPixelRatio(o.dpr)
  r.outputColorSpace = THREE.SRGBColorSpace
  // Neutral keeps paper whites true (ACES would grey them and shift hue).
  r.toneMapping = THREE.NeutralToneMapping
  r.toneMappingExposure = 1
  if (o.shadows) {
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    r.shadowMap.autoUpdate = false // updated only when something moved
  }
  return r
}

/** Recursively dispose geometries, materials and their textures. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (!mat) return
    const list = Array.isArray(mat) ? mat : [mat]
    for (const mm of list) {
      for (const v of Object.values(mm)) if (v instanceof THREE.Texture) v.dispose()
      if ((mm as THREE.ShaderMaterial).uniforms) {
        for (const u of Object.values((mm as THREE.ShaderMaterial).uniforms)) {
          if (u.value instanceof THREE.Texture) u.value.dispose()
        }
      }
      mm.dispose()
    }
  })
}

/** Full teardown: scene graph, renderer, and forced context loss. */
export function disposeRenderer(r: THREE.WebGLRenderer) {
  r.dispose()
  r.forceContextLoss()
}

/**
 * Baked soft contact shadow: radial falloff in the cool shadow tint, alpha
 * encodes density. Generated once on a canvas — no file, no banding (dithered).
 */
export function makeContactShadowTexture(size = 256, hardness = 0.35): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const d = Math.sqrt(dx * dx + dy * dy) * 2
      // two-stage falloff: dense core + long penumbra
      const core = Math.max(0, 1 - d / hardness)
      const pen = Math.max(0, 1 - d)
      let a = core * core * 0.6 + Math.pow(pen, 2.4) * 0.55
      a += (Math.random() - 0.5) / 255 // dither
      const i = (y * size + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255))
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

/** Ceramic micro-roughness: fine multi-octave value noise as a bump map. */
export function makeGrainTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  const rnd = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  const vnoise = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const w = (k: number) => ((k % p) + p) % p
    const a = rnd(w(xi), w(yi)), b = rnd(w(xi + 1), w(yi))
    const c = rnd(w(xi), w(yi + 1)), d = rnd(w(xi + 1), w(yi + 1))
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0, amp = 0.5, f = 8
      for (let o = 0; o < 4; o++) {
        n += vnoise((x / size) * f, (y / size) * f, f) * amp
        amp *= 0.5
        f *= 2
      }
      n = n * 0.7 + Math.random() * 0.3
      const v = Math.round(n * 255)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, size, size)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

/** Lerp a THREE.Color between two hex strings without allocations in hot paths. */
export function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number) {
  out.r = a.r + (b.r - a.r) * t
  out.g = a.g + (b.g - a.g) * t
  out.b = a.b + (b.b - a.b) * t
  return out
}
