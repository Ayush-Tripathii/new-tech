import * as THREE from 'three'
import { createRenderer, disposeObject, disposeRenderer } from '../core'

/**
 * /services hero — the Armature dissolved into an orbiting graphite swarm.
 * 12k GPU points. All motion in the vertex shader: per-particle orbit around
 * Y + an ABC (Arnold–Beltrami–Childress) flow — divergence-free, so it swirls
 * like curl noise without clumping — plus attraction to the cursor.
 * On a light ground particles must be DARK and SMALL: ink, 1–2px, 40–70% α.
 */
const vert = /* glsl */ `
uniform float uTime;
uniform vec3 uMouse;
uniform float uMouseOn;
uniform float uPx;
uniform float uForm;
attribute vec3 seed; // x: orbit speed, y: radius jitter, z: alpha
varying float vAlpha;
vec3 abc(vec3 p, float t) {
  const float A = 1.0, B = 0.8, C = 0.6;
  return vec3(A * sin(p.z + t) + C * cos(p.y + t * 0.7),
              B * sin(p.x + t * 0.9) + A * cos(p.z),
              C * sin(p.y) + B * cos(p.x + t * 1.1));
}
void main() {
  float t = uTime;
  // orbit
  float a = t * (0.05 + seed.x * 0.12);
  float ca = cos(a), sa = sin(a);
  vec3 p = position;
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  // dissolve from the armature shell into the flow
  vec3 flow = abc(p * 0.9, t * 0.25) * (0.35 + seed.y * 0.5);
  p += flow * uForm;
  // cursor attraction within a radius
  vec3 d = uMouse - p;
  float dist = length(d);
  float pull = uMouseOn * smoothstep(2.2, 0.0, dist) * 0.55;
  p += d * pull;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (1.0 + seed.y * 0.9) * (6.0 / -mv.z);
  vAlpha = (0.4 + seed.z * 0.3) * smoothstep(-14.0, -4.0, mv.z);
}
`
const frag = /* glsl */ `
precision highp float;
uniform vec3 uInk;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a = smoothstep(0.5, 0.32, r) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uInk, a);
  #include <colorspace_fragment>
}
`

export class Swarm {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
  private mat: THREE.ShaderMaterial
  private points: THREE.Points
  private canvas: HTMLCanvasElement
  private mouse = new THREE.Vector3()
  private mouseOn = 0
  private targetOn = 0
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  private ndc = new THREE.Vector2()
  private form = 0

  constructor(canvas: HTMLCanvasElement, dpr: number, count = 12000) {
    this.canvas = canvas
    this.renderer = createRenderer(canvas, { dpr, alpha: true, antialias: false })
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(0, 0.4, 9)
    this.camera.lookAt(0, 0, 0)
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // start on the armature's spherical shell + three ring bands
      const band = Math.random()
      let x: number, y: number, z: number
      if (band < 0.7) {
        const u = Math.random() * 2 - 1
        const th = Math.random() * Math.PI * 2
        const r = 1.6 + Math.random() * 0.25
        const s = Math.sqrt(1 - u * u)
        x = r * s * Math.cos(th)
        y = r * u
        z = r * s * Math.sin(th)
      } else {
        const th = Math.random() * Math.PI * 2
        const r = 2.2 + Math.floor(Math.random() * 3) * 0.24 + Math.random() * 0.04
        const tilt = (Math.floor(Math.random() * 3) - 1) * 0.6
        x = r * Math.cos(th)
        y = r * Math.sin(th) * Math.sin(tilt)
        z = r * Math.sin(th) * Math.cos(tilt)
      }
      pos.set([x, y, z], i * 3)
      seed.set([Math.random(), Math.random(), Math.random()], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3))
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: this.mouse },
        uMouseOn: { value: 0 },
        uPx: { value: 1.4 * dpr },
        uForm: { value: 0 },
        uInk: { value: new THREE.Color('#15171B') },
      },
    })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
    this.scene.add(this.points)
    this.resize()
  }

  resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.position.z = w / h < 1 ? 13 : 9
    this.camera.updateProjectionMatrix()
  }

  setPointer(x: number, y: number, inside: boolean) {
    const r = this.canvas.getBoundingClientRect()
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.camera)
    this.ray.ray.intersectPlane(this.plane, this.mouse)
    this.targetOn = inside ? 1 : 0
  }

  frame(dt: number, time: number) {
    this.form = Math.min(1, this.form + dt * 0.35) // dissolve in over ~3s
    this.mouseOn += (this.targetOn - this.mouseOn) * Math.min(1, dt * 4)
    const u = this.mat.uniforms
    u.uTime!.value = time
    u.uMouseOn!.value = this.mouseOn
    u.uForm!.value = this.form * this.form * (3 - 2 * this.form)
    this.points.rotation.y = time * 0.03
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    disposeObject(this.scene)
    disposeRenderer(this.renderer)
  }
}
