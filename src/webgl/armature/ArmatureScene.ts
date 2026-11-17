import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { gsap } from '@/lib/gsap'
import { createRenderer, disposeObject, disposeRenderer, makeContactShadowTexture, makeGrainTexture, lerpColor } from '../core'
import { buildSphereSegments, build404Segments, type SegmentDef } from './geometry'
import { Caustics } from './caustics'
import { clamp, damp, win } from '@/lib/motion/tokens'
import type { Quality } from '@/lib/motion/store'

/* ==========================================================================
   THE ARMATURE
   Matte bisque ceramic · three polished chrome rings · one glass core.
   No emissive anywhere. Everything is lit.
   ========================================================================== */

export type ArmatureMode = 'hero' | 'scrub' | 'error'

export interface ArmatureOptions {
  canvas: HTMLCanvasElement
  mode: ArmatureMode
  dpr: number
  mobile: boolean
  quality: Quality
  /** transparent canvas (DOM supplies the ground) */
  transparent?: boolean
}

export interface ArmatureEvents {
  onDisperse?: () => void
  onSeat?: (index: number, strength: number) => void
  onAllSeated?: () => void
}

const PAPER = '#F7F6F3'
const INVERT = '#0B0C0F'
const FLOOR = -1.95
const MAG_RADIUS = 0.95 // scene-relative equivalent of the spec's 2.2 units
const SHADOW_TINT = new THREE.Color().setHSL(218 / 360, 0.25, 0.2)

interface Segment extends SegmentDef {
  mesh: THREE.Mesh
  phase: number
  hover: number
  hoverQ: THREE.Quaternion
  dispPos: THREE.Vector3
  dispQ: THREE.Quaternion
  vel: THREE.Vector3
  ang: THREE.Vector3
  seated: boolean
  scrubAxis: THREE.Vector3
}

/* ---- Cyclorama: exact paper colour, soft studio falloff, in-shader dither -- */
const cycVert = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const cycFrag = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormalW;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec2 uPool;
uniform float uInvert;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  // key-light pool on the floor + gentle fall-off into the curve
  float d = length(vWorld.xz - uPool);
  float pool = exp(-d * d / 38.0);
  float curve = smoothstep(0.0, 1.0, clamp(vNormalW.z, 0.0, 1.0)); // 0 floor → 1 wall
  float horizon = exp(-pow((vWorld.y + 1.2) / 2.2, 2.0)) * curve;
  float lum = 0.965 + 0.035 * pool - 0.018 * horizon + 0.012 * curve;
  vec3 col = mix(uPaper * lum, uInk * (0.9 + 0.1 * pool), uInvert);
  // 1/255 triangular dither — kills banding on 8-bit panels
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.yx + 17.0) - 1.0;
  col += n / 255.0;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export class ArmatureScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private mode: ArmatureMode
  private mobile: boolean
  private transparent: boolean
  private canvas: HTMLCanvasElement

  private root = new THREE.Group() // drift / layout offset
  private spin = new THREE.Group() // drag rotation
  private assembly = new THREE.Group()
  private segments: Segment[] = []
  private rings: { pivot: THREE.Group; mesh: THREE.Mesh; speed: number; angle: number }[] = []
  private glass!: THREE.Mesh
  private glassMat!: THREE.MeshPhysicalMaterial
  private glassMatte!: THREE.MeshStandardMaterial
  private ceramic!: THREE.MeshPhysicalMaterial
  private chrome!: THREE.MeshStandardMaterial

  private key!: THREE.DirectionalLight
  private rect!: THREE.RectAreaLight
  private rim!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private envRT: THREE.WebGLRenderTarget | null = null

  private cyc: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null
  private shadowCatcher: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | null = null
  private blobs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = []
  private blobTex: THREE.CanvasTexture
  private caustics: Caustics | null = null

  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2(9, 9)
  private pointerInside = false

  // state
  private time = 0
  tension = 0 // 0..1 hold progress
  private pressing = false
  private pressStart = 0
  private dispersed = 0 // 0..1 how released the assembly is
  private phase: 'aligned' | 'flying' | 'seating' = 'aligned'
  private flyT = 0
  private angVel = new THREE.Vector3()
  private dragging = false
  private lastDrag = -10
  private recede = 0
  private scrub = 0
  private invert = 0
  private impact = 0
  private quality: Quality = 0
  private baseDpr: number
  private disposed = false
  private tweens: gsap.core.Tween[] = []
  private hitLocal = new THREE.Vector3()
  private hasHit = false
  private events: ArmatureEvents = {}
  private colPaper = new THREE.Color(PAPER)
  private colInvert = new THREE.Color(INVERT)
  private colTmp = new THREE.Color()
  private colLightHalo = new THREE.Color('#F7F6F3')

  // scratch
  private v1 = new THREE.Vector3()
  private v2 = new THREE.Vector3()
  private q1 = new THREE.Quaternion()
  private q2 = new THREE.Quaternion()
  private qId = new THREE.Quaternion()
  private e1 = new THREE.Euler()

  constructor(o: ArmatureOptions) {
    this.mode = o.mode
    this.transparent = !!o.transparent
    this.mobile = o.mobile
    this.canvas = o.canvas
    this.baseDpr = o.dpr
    const realShadows = o.mode === 'hero' || o.mode === 'error'
    this.renderer = createRenderer(o.canvas, { dpr: o.dpr, shadows: realShadows, alpha: !!o.transparent })
    if (o.transparent) this.renderer.setClearColor(0x000000, 0)
    else this.renderer.setClearColor(PAPER, 1)

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 80)
    this.camera.position.set(0, 0.55, 10.2)
    this.camera.lookAt(0, -0.15, 0)

    this.blobTex = makeContactShadowTexture(256)
    this.buildLighting(realShadows)
    this.buildMaterials()
    this.buildArmature()
    if (!o.transparent) this.buildCyclorama()
    this.buildShadows(realShadows)

    this.root.add(this.spin)
    this.spin.add(this.assembly)
    this.scene.add(this.root)
    this.setQuality(o.quality)
    this.resize()
  }

  /* ------------------------------------------------------------ lighting rig */
  private buildLighting(shadows: boolean) {
    RectAreaLightUniformsLib.init()
    // HDRI-equivalent studio environment for the chrome — generated, no file.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envRT = pmrem.fromScene(room, 0.035)
    room.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
    pmrem.dispose()

    // Key: 2.4, the only shadow caster, 2048 PCF soft
    this.key = new THREE.DirectionalLight(0xfff6ec, 2.4)
    this.key.position.set(-4.6, 7.2, 5.2)
    this.key.target.position.set(0, 0, 0)
    if (shadows) {
      this.key.castShadow = true
      this.key.shadow.mapSize.set(2048, 2048)
      const c = this.key.shadow.camera
      c.left = -3.4
      c.right = 3.4
      c.top = 3.4
      c.bottom = -3.4
      c.near = 2
      c.far = 20
      this.key.shadow.bias = -0.0004
      this.key.shadow.normalBias = 0.022
      this.key.shadow.radius = 4
    }
    this.scene.add(this.key, this.key.target)

    // Softbox fill — large RectAreaLight camera-right
    this.rect = new THREE.RectAreaLight(0xffffff, 3.2, 6, 4)
    this.rect.position.set(5.5, 2.2, 4.4)
    this.rect.lookAt(0, 0, 0)
    this.scene.add(this.rect)

    // Rim — low, cool, from behind
    this.rim = new THREE.DirectionalLight(0xe6edff, 0.65)
    this.rim.position.set(2.5, 3.5, -6)
    this.scene.add(this.rim)

    // Ambient ≤ 0.25 — any higher and the ceramic goes plastic
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe7e1d6, 0.22)
    this.scene.add(this.hemi)
  }

  /* ------------------------------------------------------------ material law */
  private buildMaterials() {
    const grain = makeGrainTexture(256)
    grain.repeat.set(2, 2)
    this.ceramic = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#E7E2D8'),
      roughness: 0.65,
      metalness: 0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.42,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.35,
      envMap: this.envRT!.texture,
      envMapIntensity: 0.32,
      sheen: 0.15,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color('#ffffff'),
    })
    this.chrome = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e9ecf0'),
      metalness: 1.0,
      roughness: 0.04,
      envMap: this.envRT!.texture,
      envMapIntensity: 1.15,
    })
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f6f9ff'),
      metalness: 0,
      roughness: 0.03,
      transmission: 0.95,
      ior: 1.52,
      thickness: 0.9,
      attenuationColor: new THREE.Color('#dde7f3'),
      attenuationDistance: 2.2,
      specularIntensity: 1,
      envMap: this.envRT!.texture,
      envMapIntensity: 1,
      flatShading: true,
    })
    // Matte stand-in for degrade level ≥ 4
    this.glassMatte = new THREE.MeshStandardMaterial({ color: '#d9dee5', roughness: 0.35, metalness: 0, envMap: this.envRT!.texture, envMapIntensity: 0.6, flatShading: true })
  }

  /* --------------------------------------------------------------- armature */
  private buildArmature() {
    const defs = this.mode === 'error' ? build404Segments() : buildSphereSegments(this.mobile ? 4 : 8)
    for (const d of defs) {
      const mesh = new THREE.Mesh(d.geometry, this.ceramic)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.copy(d.center)
      this.assembly.add(mesh)
      const axis = new THREE.Vector3(Math.sin(d.rand * 40), Math.cos(d.rand * 23), Math.sin(d.rand * 71)).normalize()
      this.segments.push({
        ...d,
        mesh,
        phase: d.rand * Math.PI * 2,
        hover: 0,
        hoverQ: new THREE.Quaternion(),
        dispPos: new THREE.Vector3(),
        dispQ: new THREE.Quaternion(),
        vel: new THREE.Vector3(),
        ang: new THREE.Vector3(),
        seated: true,
        scrubAxis: axis,
      })
    }

    // Glass core
    const glassGeo = new THREE.IcosahedronGeometry(this.mode === 'error' ? 0.26 : 0.6, 1)
    this.glass = new THREE.Mesh(glassGeo, this.glassMat)
    this.glass.castShadow = true
    if (this.mode === 'error') this.glass.position.set(0, 0.36, 0)
    this.assembly.add(this.glass)

    // Three chrome rings on independent axes — 0.08 / −0.05 / 0.11 rad/s
    const ringDefs =
      this.mode === 'error'
        ? [
            { r: 0.62, tilt: [0.3, 0, 0.4], speed: 0.08, at: [0, 0.36, 0] },
            { r: 0.72, tilt: [1.2, 0.4, -0.3], speed: -0.05, at: [0, 0.36, 0] },
            { r: 0.82, tilt: [0.7, 1.1, 1.0], speed: 0.11, at: [0, 0.36, 0] },
          ]
        : [
            { r: 1.33, tilt: [0.25, 0, 0.42], speed: 0.08, at: [0, 0, 0] },
            { r: 1.46, tilt: [1.35, 0.35, -0.28], speed: -0.05, at: [0, 0, 0] },
            { r: 1.59, tilt: [0.75, 1.15, 1.05], speed: 0.11, at: [0, 0, 0] },
          ]
    for (const rd of ringDefs) {
      const pivot = new THREE.Group()
      pivot.rotation.set(rd.tilt[0]!, rd.tilt[1]!, rd.tilt[2]!)
      pivot.position.set(rd.at[0]!, rd.at[1]!, rd.at[2]!)
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(rd.r, this.mode === 'error' ? 0.012 : 0.021, 20, 240), this.chrome)
      mesh.castShadow = true
      pivot.add(mesh)
      this.assembly.add(pivot)
      this.rings.push({ pivot, mesh, speed: rd.speed, angle: rd.speed * 37 })
    }
  }

  /* ------------------------------------------------------------ cyclorama */
  private buildCyclorama() {
    // Profile: floor (z +14 → −4), quarter-circle curve r=5, wall up to y=+14
    const profile: THREE.Vector2[] = [] // (z, y)
    for (let z = 14; z > -4; z -= 1) profile.push(new THREE.Vector2(z, FLOOR))
    const R = 5
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * (Math.PI / 2)
      profile.push(new THREE.Vector2(-4 - Math.sin(a) * R, FLOOR + (1 - Math.cos(a)) * R))
    }
    for (let y = FLOOR + R + 1; y < 16; y += 2) profile.push(new THREE.Vector2(-4 - R, y))
    const xs = 2
    const W = 40
    const pos: number[] = []
    const nrm: number[] = []
    const idx: number[] = []
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i]!
      const prev = profile[Math.max(0, i - 1)]!
      const next = profile[Math.min(profile.length - 1, i + 1)]!
      const tz = next.x - prev.x
      const ty = next.y - prev.y
      const len = Math.hypot(tz, ty) || 1
      // normal faces the camera side (+z / +y)
      const nz = ty / len
      const ny = -tz / len
      for (let j = 0; j < xs; j++) {
        pos.push(j === 0 ? -W : W, p.y, p.x)
        nrm.push(0, ny, nz)
      }
    }
    for (let i = 0; i < profile.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3
      idx.push(a, c, b, b, c, d)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setIndex(idx)
    const mat = new THREE.ShaderMaterial({
      vertexShader: cycVert,
      fragmentShader: cycFrag,
      uniforms: {
        uPaper: { value: new THREE.Color(PAPER) },
        uInk: { value: new THREE.Color(INVERT) },
        uPool: { value: new THREE.Vector2(0.5, 0.5) },
        uInvert: { value: 0 },
      },
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.cyc = new THREE.Mesh(g, mat)
    this.cyc.renderOrder = -1
    this.scene.add(this.cyc)
  }

  /* --------------------------------------------------------------- shadows */
  private buildShadows(real: boolean) {
    if (real) {
      // Real PCF soft shadow composited as tinted alpha (never neutral grey)
      const m = new THREE.ShadowMaterial({ color: SHADOW_TINT.clone(), opacity: 0.3, transparent: true, depthWrite: false })
      this.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), m)
      this.shadowCatcher.rotation.x = -Math.PI / 2
      this.shadowCatcher.position.y = FLOOR + 0.002
      this.shadowCatcher.receiveShadow = true
      this.shadowCatcher.renderOrder = 1
      this.scene.add(this.shadowCatcher)
    }
    // Baked contact shadows: core, mid, wide. They split into separate
    // penumbras under tension.
    const specs = [
      { s: 1.6, a: 0.55 },
      { s: 2.6, a: 0.32 },
      { s: 4.2, a: 0.18 },
    ]
    for (const sp of specs) {
      const m = new THREE.MeshBasicMaterial({
        map: this.blobTex,
        color: SHADOW_TINT.clone(),
        transparent: true,
        opacity: sp.a,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sp.s, sp.s * 0.82), m)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = FLOOR + 0.004
      mesh.renderOrder = 2
      mesh.userData.baseScale = 1
      mesh.userData.baseAlpha = sp.a
      this.blobs.push(mesh)
      this.scene.add(mesh)
    }
    if (this.mode !== 'scrub') {
      this.caustics = new Caustics(512)
      this.caustics.decal.position.y = FLOOR + 0.006
      this.scene.add(this.caustics.decal)
    }
  }

  /* --------------------------------------------------------------- public */
  setEvents(e: ArmatureEvents) {
    this.events = e
  }

  setQuality(q: Quality) {
    this.quality = q
    const dpr = q >= 1 ? Math.min(this.baseDpr, 1) : this.baseDpr
    if (this.renderer.getPixelRatio() !== dpr) {
      this.renderer.setPixelRatio(dpr)
      this.resize()
    }
    const size = q >= 2 ? 1024 : 2048
    if (this.key.castShadow && this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size)
      this.key.shadow.map?.dispose()
      this.key.shadow.map = null
    }
    if (this.caustics) this.caustics.enabled = q < 3
    // Transmission samples the opaque scene behind it; on a transparent canvas
    // that buffer is empty and the glass reads as a white blob → matte stand-in.
    this.glass.material = q >= 4 || this.transparent ? this.glassMatte : this.glassMat
  }

  get isStatic() {
    return this.quality >= 5
  }

  resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    const aspect = w / h
    this.camera.aspect = aspect
    // Layout: object right-of-centre on landscape, above the type on portrait
    if (this.mode === 'hero') {
      if (aspect > 1.15) {
        this.root.position.set(1.85 * Math.min(aspect / 1.6, 1.25), 0.05, 0)
        this.camera.fov = 26
      } else {
        this.root.position.set(0, 0.85, 0)
        this.camera.fov = (26 / Math.max(aspect, 0.48)) * 0.8
      }
    } else if (this.mode === 'scrub') {
      // portrait: smaller, between the headline and the card grid
      this.root.position.set(aspect > 1.15 ? -1.5 : 0, aspect > 1.15 ? 0 : 0.35, 0)
      this.camera.fov = aspect > 1.15 ? 26 : 52
    } else {
      // 404: lift the glyphs clear of the headline (bottom-left) on landscape
      this.root.position.set(aspect > 1.15 ? 1.1 : 0, aspect > 1.15 ? 0.55 : 0.9, 0)
      this.camera.fov = aspect > 1 ? 24 : 40
    }
    this.camera.updateProjectionMatrix()
  }

  setPointer(clientX: number, clientY: number, inside: boolean) {
    const r = this.canvas.getBoundingClientRect()
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.pointerInside = inside
  }

  /** seatProgress > 0.98 gates magnetic hover */
  get seatProgress() {
    return 1 - Math.max(this.tension, this.dispersed)
  }

  dragBy(dx: number, dy: number) {
    if (this.phase !== 'aligned' && this.phase !== 'seating') return
    this.dragging = true
    this.lastDrag = this.time
    this.angVel.x += dy * 0.0042
    this.angVel.y += dx * 0.0042
  }
  dragEnd() {
    this.dragging = false
  }

  pressDown() {
    if (this.phase !== 'aligned') return false
    this.pressing = true
    this.pressStart = this.time
    return true
  }
  pressUp() {
    this.pressing = false
  }

  setRecede(p: number) {
    this.recede = p
  }
  setScrub(p: number) {
    this.scrub = p
  }
  setInvert(t: number) {
    this.invert = t
  }

  /** Warm the GPU: compile every program before the curtain lifts. */
  async warm() {
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<void> }
    try {
      if (r.compileAsync) await r.compileAsync(this.scene, this.camera)
      else r.compile(this.scene, this.camera)
    } catch {
      /* fall through to a render */
    }
    this.update(1 / 60)
    this.render()
  }

  /* ---------------------------------------------------------------- update */
  update(dt: number) {
    if (this.disposed) return
    this.time += dt
    const t = this.time

    // hold → tension (900ms)
    if (this.pressing && this.phase === 'aligned') {
      this.tension = clamp((t - this.pressStart) / 0.9)
      if (this.tension >= 1) this.disperse()
    } else {
      this.tension += (0 - this.tension) * damp(0.2, dt)
    }

    // dispersal flight → reseat after 3.5s
    if (this.phase === 'flying') {
      this.flyT += dt
      const drag = Math.exp(-1.7 * dt)
      const angDrag = Math.exp(-0.7 * dt)
      for (const s of this.segments) {
        s.dispPos.addScaledVector(s.vel, dt)
        s.vel.multiplyScalar(drag)
        s.vel.y -= 0.12 * dt // the faintest settle — they drift, not fall
        const w = s.ang.length()
        if (w > 1e-5) {
          this.q1.setFromAxisAngle(this.v1.copy(s.ang).divideScalar(w), w * dt)
          s.dispQ.premultiply(this.q1)
        }
        s.ang.multiplyScalar(angDrag)
      }
      if (this.flyT > 3.5) this.reseat()
    }

    // drag inertia — damping 0.94 per 60fps frame
    if (this.mode !== 'scrub') {
      const d = Math.pow(0.94, dt * 60)
      this.angVel.multiplyScalar(d)
      const w = this.angVel.length()
      if (w > 1e-5) {
        this.q1.setFromAxisAngle(this.v1.copy(this.angVel).divideScalar(w), w * dt * 60)
        this.spin.quaternion.premultiply(this.q1)
      }
      // precise re-seat of orientation after the user lets go
      if (!this.dragging && t - this.lastDrag > 2.6 && w < 0.002) {
        this.spin.quaternion.slerp(this.qId, damp(0.025, dt))
      }
    }

    // idle: Lissajous drift + slow yaw
    const scrubbing = this.mode === 'scrub'
    const breathAmp = 0.015
    if (!scrubbing) {
      this.assembly.position.set(0.06 * Math.sin(t * 0.23), 0.05 * Math.sin(t * 0.31 + 1.2) - this.recede * 0.4, 0.04 * Math.sin(t * 0.17 + 2.1) - this.recede * 2.6)
      this.assembly.rotation.y = t * 0.06
      this.assembly.rotation.x = Math.sin(t * 0.13) * 0.05
    } else {
      const p = win(this.scrub, 0, 0.7)
      this.assembly.position.set(0, 0.03 * Math.sin(t * 0.31), 0)
      this.assembly.rotation.set(0.18 * Math.sin(p * Math.PI), p * Math.PI * 2.5, 0)
    }

    // rings — tighten & counter-rotate under tension
    const tension = this.tension
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i]!
      const mult = 1 - tension * 9 - this.dispersed * 2 + (scrubbing ? win(this.scrub, 0, 0.7) * 22 : 0)
      r.angle += r.speed * mult * dt
      r.mesh.rotation.x = r.angle
      r.mesh.rotation.y = r.angle * 0.35
      const sc = 1 - tension * 0.035 + this.dispersed * 0.06 * (i + 1)
      r.mesh.scale.setScalar(sc)
    }
    this.glass.rotation.set(t * 0.21, t * 0.17, 0)

    // magnetic hover raycast — only when fully seated
    this.hasHit = false
    if (!scrubbing && this.pointerInside && this.seatProgress > 0.98 && !this.dragging) {
      this.raycaster.setFromCamera(this.ndc, this.camera)
      const meshes = this.segments.map((s) => s.mesh)
      const hit = this.raycaster.intersectObjects(meshes, false)[0]
      if (hit) {
        this.hasHit = true
        this.assembly.worldToLocal(this.hitLocal.copy(hit.point))
      }
    }

    // segments
    const scrubDisp = scrubbing ? smooth(win(this.scrub, 0.1, 0.28)) * (1 - smooth(win(this.scrub, 0.44, 0.62))) : 0
    const toCam = this.v2.copy(this.camera.position).sub(this.root.position).normalize()
    for (const s of this.segments) {
      const breath = breathAmp * Math.sin(t * Math.PI * 2 * 0.4 + s.phase)
      // hover
      let hTarget = 0
      if (this.hasHit) {
        const d = s.center.distanceTo(this.hitLocal)
        const f = 1 - smooth(clamp(d / MAG_RADIUS))
        hTarget = f * 0.085
      }
      s.hover += (hTarget - s.hover) * damp(0.12, dt)
      // tilt toward the cursor
      const tiltAmt = s.hover * 1.4
      this.v1.crossVectors(s.normal, toCam)
      if (this.v1.lengthSq() > 1e-6 && tiltAmt > 1e-4) this.q2.setFromAxisAngle(this.v1.normalize(), tiltAmt)
      else this.q2.identity()
      s.hoverQ.slerp(this.q2, damp(0.12, dt))

      const tensionGap = tension * (0.04 + s.rand * 0.025)
      const out = breath * (1 - this.dispersed) + s.hover + tensionGap + scrubDisp * (0.55 + s.rand * 0.6)
      s.mesh.position.copy(s.center).addScaledVector(s.normal, out).add(s.dispPos)
      if (scrubbing && scrubDisp > 0.0001) {
        this.q1.setFromAxisAngle(s.scrubAxis, scrubDisp * (2 + s.rand * 4))
        s.mesh.quaternion.copy(this.q1)
      } else {
        s.mesh.quaternion.copy(s.hoverQ).multiply(s.dispQ)
      }
    }

    // micro camera shake while tensioned
    const shake = tension * tension * 0.018
    this.camera.position.set(0 + Math.sin(t * 61) * shake, 0.55 + Math.cos(t * 53) * shake, 10.2)
    this.camera.lookAt(0, -0.15, 0)

    // key light sweeps — moving tonal gradation across the matte surface
    const sweep = Math.sin(t * 0.12)
    this.key.position.set(-4.6 + sweep * 1.8, 7.2 + Math.cos(t * 0.09) * 0.4, 5.2 - sweep * 1.2)
    this.key.position.add(this.root.position)
    this.key.target.position.copy(this.root.position)
    this.key.target.updateMatrixWorld()

    // contact shadows track the assembly; breathe with the light; split under tension
    this.root.updateMatrixWorld()
    const world = this.assembly.getWorldPosition(this.v1)
    const height = world.y - FLOOR
    const lightDir = this.v2.copy(this.key.target.position).sub(this.key.position).normalize()
    const k = height / -lightDir.y
    const sx = world.x + lightDir.x * k * 0.18
    const sz = world.z + lightDir.z * k * 0.18
    this.impact *= Math.exp(-6 * dt)
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i]!
      const split = (tension * 0.5 + this.dispersed * 0.9) * (i - 1)
      const spread = 1 + this.recede * 1.3 + this.dispersed * 0.7 + i * 0.04 * sweep + scrubDisp * 0.5
      b.position.set(sx + split * 0.32 + lightDir.x * i * 0.12, FLOOR + 0.004 + i * 0.0005, sz + split * 0.18 + lightDir.z * i * 0.12)
      b.scale.set(spread * (1 + this.impact * 0.12), spread * (1 + this.impact * 0.12), 1)
      const fade = (1 - this.recede * 0.65) * (1 - this.dispersed * 0.45) * (1 - scrubDisp * 0.35) * (1 + this.impact * 0.5)
      const m = b.material
      m.opacity = (b.userData.baseAlpha as number) * fade * (this.mode === 'scrub' ? 1.1 : 1)
      lerpColor(m.color, SHADOW_TINT, this.colLightHalo, this.invert)
      if (this.invert > 0) m.opacity *= 1 - this.invert * 0.55
    }
    // real cast shadow stays light — the baked contact blobs carry the density
    if (this.shadowCatcher) this.shadowCatcher.material.opacity = (this.mode === 'error' ? 0.14 : 0.22) * (1 - this.recede * 0.5)

    // cyclorama pool follows the key
    if (this.cyc) {
      const u = this.cyc.material.uniforms
      ;(u.uPool!.value as THREE.Vector2).set(this.key.position.x * 0.35 + world.x, world.z + 1.5)
      u.uInvert!.value = this.invert
    }

    // caustics — under the glass, along the light, scatter on dispersal
    if (this.caustics) {
      const gw = this.glass.getWorldPosition(this.v1)
      const kk = (gw.y - FLOOR) / -lightDir.y
      this.caustics.decal.position.set(gw.x + lightDir.x * kk, FLOOR + 0.006, gw.z + lightDir.z * kk)
      const scatter = Math.max(this.dispersed, tension * 0.3)
      this.caustics.decal.scale.setScalar(1 + scatter * 1.2)
      this.caustics.update(this.renderer, t, scatter, (0.55 + 0.45 * scatter) * (1 - this.recede * 0.7))
    }

    if (this.invert > 0 && this.mode === 'scrub') {
      // studio dims slightly as the ground goes dark — ceramic stays ceramic
      lerpColor(this.colTmp, this.colPaper, this.colInvert, this.invert)
      this.hemi.intensity = 0.22 - this.invert * 0.08
      this.rim.intensity = 0.65 + this.invert * 1.1
    }
  }

  render() {
    if (this.disposed) return
    if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = true
    this.renderer.render(this.scene, this.camera)
  }

  /* ----------------------------------------------------------- dispersal */
  private disperse() {
    if (this.phase !== 'aligned') return
    this.phase = 'flying'
    this.pressing = false
    this.tension = 0
    this.flyT = 0
    this.tweens.forEach((tw) => tw.kill())
    this.tweens = []
    const d = { v: this.dispersed }
    this.tweens.push(gsap.to(d, { v: 1, duration: 0.25, ease: 'expo.out', onUpdate: () => void (this.dispersed = d.v) }))
    for (const s of this.segments) {
      s.seated = false
      const speed = 2.1 + s.rand * 1.7
      s.vel.copy(s.normal).multiplyScalar(speed)
      s.vel.x += (Math.random() - 0.5) * 0.8
      s.vel.y += (Math.random() - 0.3) * 0.8
      s.vel.z += (Math.random() - 0.5) * 0.8
      s.ang.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4.5)
    }
    this.angVel.multiplyScalar(0.2)
    this.events.onDisperse?.()
  }

  private reseat() {
    this.phase = 'seating'
    // stagger by distance from centre of the last interaction (or the top)
    const origin = this.hasHit ? this.hitLocal.clone() : new THREE.Vector3(0, 1, 0)
    const order = [...this.segments].sort((a, b) => a.center.distanceTo(origin) - b.center.distanceTo(origin))
    let seatedCount = 0
    const total = order.length
    order.forEach((s, i) => {
      const startPos = s.dispPos.clone()
      const startQ = s.dispQ.clone()
      const p = { t: 0 }
      s.vel.set(0, 0, 0)
      s.ang.set(0, 0, 0)
      const tw = gsap.to(p, {
        t: 1,
        duration: 0.95,
        delay: i * (1.1 / total),
        ease: 'back.out(1.4)',
        onUpdate: () => {
          // back.out overshoots past 1 → the segment seats a hair past rest, then settles
          s.dispPos.copy(startPos).multiplyScalar(1 - p.t)
          s.dispQ.slerpQuaternions(startQ, this.qId, Math.min(1, p.t))
        },
        onComplete: () => {
          s.dispPos.set(0, 0, 0)
          s.dispQ.identity()
          s.seated = true
          seatedCount++
          this.impact = Math.min(1, this.impact + 0.25)
          this.dispersed = 1 - seatedCount / total
          this.events.onSeat?.(i, 1 - i / total)
          if (seatedCount === total) {
            this.phase = 'aligned'
            this.dispersed = 0
            this.events.onAllSeated?.()
          }
        },
      })
      this.tweens.push(tw)
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.tweens.forEach((t) => t.kill())
    disposeObject(this.scene)
    this.glassMat.dispose()
    this.glassMatte.dispose()
    this.blobTex.dispose()
    this.caustics?.dispose()
    this.envRT?.dispose()
    this.key.shadow.map?.dispose()
    this.renderer.renderLists.dispose()
    disposeRenderer(this.renderer)
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x)
