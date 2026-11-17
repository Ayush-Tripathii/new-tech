import * as THREE from 'three'
import { createRenderer, disposeObject, disposeRenderer } from '../core'
import { damp } from '@/lib/motion/tokens'

/**
 * §8.5 Double-helix gallery. Each card is a subdivided plane whose vertices are
 * bent onto the helix curvature in the vertex shader every frame. Rounded
 * corners (uRadius 8px) and a soft tinted drop shadow are rendered inside the
 * fragment shader — on a light ground, unshadowed cards look pasted on.
 * Rendering is on demand: only when progress moves or a spring is settling.
 */

const vert = /* glsl */ `
uniform float uAngle;
uniform float uY;
uniform float uR;
uniform float uLift;
uniform float uScale;
uniform float uFly;
uniform vec3 uFlyCenter;
uniform float uFlyScale;
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec3 p = position * uScale;
  float a = uAngle + p.x / uR;
  float r = uR + uLift;
  vec3 bent = vec3(r * sin(a), uY + p.y, r * cos(a));
  vec3 flown = uFlyCenter + vec3(position.x * uFlyScale, position.y * uFlyScale, 0.0); // 'flat' is reserved in GLSL ES 3
  vec3 world = mix(bent, flown, uFly);
  // facing: how much the card surface looks at the camera (+z)
  vFacing = mix(cos(a), 1.0, uFly);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec2 uSize;     // card size (units)
uniform vec2 uPad;      // padding for shadow (units)
uniform float uRadius;  // px
uniform float uPxPerUnit;
uniform float uAlpha;
uniform float uBlur;    // mip bias for focal blur
uniform vec3 uShadow;
uniform vec3 uBack;
varying vec2 vUv;
varying float vFacing;
float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 full = uSize + uPad * 2.0;
  vec2 p = (vUv - 0.5) * full;           // units, centred
  float rad = uRadius / uPxPerUnit;
  float d = sdRound(p, uSize * 0.5, rad);
  float aa = 1.2 / uPxPerUnit;
  float inside = 1.0 - smoothstep(-aa, aa, d);

  // shadow: offset down-right (key light top-left), two layers, tinted
  vec2 so = vec2(0.035, -0.07);
  float ds = sdRound(p - so, uSize * 0.5, rad);
  float sh = (1.0 - smoothstep(-0.02, 0.22, ds)) * 0.13 + (1.0 - smoothstep(-0.01, 0.06, ds)) * 0.07;
  sh *= (1.0 - inside);

  vec4 col;
  if (gl_FrontFacing) {
    vec2 uv = (p + uSize * 0.5) / uSize;
    vec3 tex = texture2D(uMap, uv, uBlur).rgb;
    float light = 0.84 + 0.16 * clamp(vFacing, 0.0, 1.0);
    // inset top highlight — physically lit from above
    float hl = smoothstep(uSize.y * 0.5 - 0.012, uSize.y * 0.5, p.y) * 0.25;
    col = vec4(tex * light + hl, inside);
  } else {
    float light = 0.8 + 0.2 * clamp(-vFacing, 0.0, 1.0);
    col = vec4(uBack * light, inside);
  }
  vec4 shadow = vec4(uShadow, sh);
  vec4 outc = mix(shadow, col, inside);
  outc.a *= uAlpha;
  gl_FragColor = outc;
  #include <colorspace_fragment>
}
`

export interface HelixCard {
  slug: string
  color: string
  image: HTMLCanvasElement
}

interface CardState {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  angle: number
  y: number
  scale: number
  scaleV: number
  lift: number
  liftV: number
  alpha: number
  blur: number
}

const W = 2.1
const H = 1.4
const PAD = 0.35
const R = 3.3

export class HelixScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60)
  private cards: CardState[] = []
  private canvas: HTMLCanvasElement
  private progress = 0
  private hovered = -1
  private flying = -1
  private pointer = new THREE.Vector2(-9, -9)
  private dirty = true
  private disposed = false
  private v = new THREE.Vector3()
  private pxPerUnit = 100
  private mobile: boolean

  constructor(canvas: HTMLCanvasElement, items: HelixCard[], dpr: number, mobile: boolean) {
    this.canvas = canvas
    this.mobile = mobile
    this.renderer = createRenderer(canvas, { dpr, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(0, 0, 10.5)
    const geo = new THREE.PlaneGeometry(W + PAD * 2, H + PAD * 2, 40, 1)
    const shadow = new THREE.Color().setHSL(218 / 360, 0.25, 0.2)
    items.forEach((it, i) => {
      const strand = i % 2
      const texture = new THREE.CanvasTexture(it.image)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      texture.minFilter = THREE.LinearMipmapLinearFilter
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uMap: { value: texture },
          uAngle: { value: 0 },
          uY: { value: 0 },
          uR: { value: R },
          uLift: { value: 0 },
          uScale: { value: 1 },
          uFly: { value: 0 },
          uFlyCenter: { value: new THREE.Vector3() },
          uFlyScale: { value: 1 },
          uSize: { value: new THREE.Vector2(W, H) },
          uPad: { value: new THREE.Vector2(PAD, PAD) },
          uRadius: { value: 8.0 },
          uPxPerUnit: { value: 100 },
          uAlpha: { value: 1 },
          uBlur: { value: 0 },
          uShadow: { value: shadow },
          uBack: { value: new THREE.Color('#EDEBE6') },
        },
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      const k = Math.floor(i / 2)
      this.cards.push({
        mesh,
        angle: k * 1.05 + strand * Math.PI,
        y: (i - (items.length - 1) / 2) * 0.62,
        scale: 1,
        scaleV: 0,
        lift: 0,
        liftV: 0,
        alpha: 1,
        blur: 0,
      })
    })
    this.resize()
  }

  resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.position.z = this.mobile || w / h < 1 ? 15 : 10.5
    this.camera.updateProjectionMatrix()
    // pixels per world unit at the helix front (distance z - R)
    const dist = this.camera.position.z - R
    const viewH = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist
    this.pxPerUnit = h / viewH
    this.dirty = true
  }

  setProgress(p: number) {
    if (Math.abs(p - this.progress) > 1e-5) {
      this.progress = p
      this.dirty = true
    }
  }

  setPointer(clientX: number, clientY: number, inside: boolean) {
    if (!inside) {
      this.pointer.set(-9, -9)
    } else {
      const r = this.canvas.getBoundingClientRect()
      this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    }
    this.dirty = true
  }

  get hoveredIndex() {
    return this.hovered
  }

  /** Prepare card `index` to fly to a viewport-filling plane; drive with setFly(t). */
  fly(index: number) {
    this.flying = index
    const c = this.cards[index]!
    c.mesh.renderOrder = 999
    // a plane at distance d in front of the camera that covers the viewport
    const d = 4
    const center = new THREE.Vector3(0, 0, this.camera.position.z - d)
    const viewH = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * d
    const viewW = viewH * this.camera.aspect
    const scale = Math.max(viewW / W, viewH / H) * 1.02
    c.mesh.material.uniforms.uFlyCenter!.value.copy(center)
    c.mesh.material.uniforms.uFlyScale!.value = scale
  }

  setFly(t: number) {
    if (this.flying < 0) return
    this.cards[this.flying]!.mesh.material.uniforms.uFly!.value = t
    this.dirty = true
  }

  /** Projected screen-space hit test (shader-bent geometry has no CPU copy). */
  private pick(rot: number, yOff: number): number {
    if (this.pointer.x < -2) return -1
    let best = -1
    let bestZ = -Infinity
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]!
      const a = c.angle + rot
      const z = Math.cos(a) * R
      if (z < 0.6) continue // only cards facing us
      const pts: THREE.Vector2[] = []
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const aa = a + (sx * W * 0.5 * c.scale) / R
        this.v.set(R * Math.sin(aa), c.y + yOff + sy * H * 0.5 * c.scale, R * Math.cos(aa)).project(this.camera)
        pts.push(new THREE.Vector2(this.v.x, this.v.y))
      }
      if (inQuad(this.pointer, pts) && z > bestZ) {
        bestZ = z
        best = i
      }
    }
    return best
  }

  /** Returns true if it rendered (something was moving). */
  frame(dt: number): boolean {
    if (this.disposed) return false
    const p = this.progress
    const rot = -p * Math.PI * 2 * 1.15
    const yOff = (0.5 - p) * this.cards.length * 0.62 * 0.9
    this.hovered = this.flying >= 0 ? this.flying : this.pick(rot, yOff)
    let moving = this.dirty
    const k = 170, dmp = 18 // spring
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]!
      const hov = i === this.hovered
      const anyHover = this.hovered >= 0
      const ts = hov ? 1.08 : 1
      const tl = hov ? 0.4 : 0
      c.scaleV += ((ts - c.scale) * k - c.scaleV * dmp) * dt
      c.scale += c.scaleV * dt
      c.liftV += ((tl - c.lift) * k - c.liftV * dmp) * dt
      c.lift += c.liftV * dt
      const ta = anyHover && !hov ? 0.4 : 1
      const tb = anyHover && !hov ? 2.2 : 0 // ≈ 2px focal blur via mip bias
      c.alpha += (ta - c.alpha) * damp(0.15, dt)
      c.blur += (tb - c.blur) * damp(0.15, dt)
      if (Math.abs(c.scaleV) > 1e-4 || Math.abs(c.liftV) > 1e-4 || Math.abs(ta - c.alpha) > 1e-3 || Math.abs(tb - c.blur) > 1e-3) moving = true
      const u = c.mesh.material.uniforms
      u.uAngle!.value = c.angle + rot
      u.uY!.value = c.y + yOff
      u.uScale!.value = c.scale
      u.uLift!.value = c.lift
      u.uAlpha!.value = c.alpha
      u.uBlur!.value = c.blur
      u.uPxPerUnit!.value = this.pxPerUnit
      // painter's order: back to front
      if (i !== this.flying) c.mesh.renderOrder = Math.round(Math.cos(c.angle + rot) * 100)
    }
    if (!moving) return false
    this.dirty = false
    this.renderer.render(this.scene, this.camera)
    return true
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    disposeObject(this.scene)
    disposeRenderer(this.renderer)
  }
}

function inQuad(p: THREE.Vector2, q: THREE.Vector2[]) {
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i]!, b = q[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
