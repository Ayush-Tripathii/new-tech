import * as THREE from 'three'

/**
 * Caustics (§5.5): rendered into a 512px offscreen target at HALF framerate,
 * then composited onto the ground as a decal positioned where the glass core's
 * light lands. Never computed per-pixel at full resolution.
 */
const causticFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uScatter;
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
void main() {
  vec2 uv = vUv * (1.6 + uScatter * 1.4);
  float a = caustic(uv, uTime * 0.35);
  float b = caustic(uv * 1.07 + 0.31, uTime * 0.35 + 0.6); // slight chromatic offset
  gl_FragColor = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
}
`

const decalVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const decalFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uStrength;
uniform float uScatter;
uniform vec3 uShade;
uniform vec3 uLight;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c * vec2(1.0, 1.35));
  float rad = mix(0.22, 0.48, uScatter);
  float mask = smoothstep(rad, rad * 0.25, r);
  vec2 s = texture2D(uMap, vUv).rg;
  float k = (s.r * 0.7 + s.g * 0.3);
  // light lines on a faint refracted shade — visible on a bright ground
  vec3 col = mix(uShade, uLight, smoothstep(0.05, 0.6, k));
  float alpha = mask * uStrength * (0.07 + k * 0.42);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`

export class Caustics {
  readonly target: THREE.WebGLRenderTarget
  readonly decal: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private quadScene = new THREE.Scene()
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quadMat: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private frameToggle = false
  enabled = true

  constructor(size = 512) {
    this.target = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      generateMipmaps: false,
      depthBuffer: false,
    })
    this.target.texture.wrapS = this.target.texture.wrapT = THREE.RepeatWrapping
    this.quadMat = new THREE.ShaderMaterial({
      vertexShader: decalVert.replace('projectionMatrix * modelViewMatrix * ', ''),
      fragmentShader: causticFrag,
      uniforms: { uTime: { value: 0 }, uScatter: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat)
    this.quadScene.add(this.quad)

    const decalMat = new THREE.ShaderMaterial({
      vertexShader: decalVert,
      fragmentShader: decalFrag,
      uniforms: {
        uMap: { value: this.target.texture },
        uStrength: { value: 1 },
        uScatter: { value: 0 },
        uShade: { value: new THREE.Color().setHSL(218 / 360, 0.25, 0.2) },
        uLight: { value: new THREE.Color('#fffdf8') },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
    this.decal = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), decalMat)
    this.decal.rotation.x = -Math.PI / 2
    this.decal.renderOrder = 3
  }

  /** Call every frame; actually renders on every other call (half framerate). */
  update(renderer: THREE.WebGLRenderer, time: number, scatter: number, strength: number) {
    const u = this.decal.material.uniforms
    u.uScatter!.value = scatter
    u.uStrength!.value = this.enabled ? strength : 0
    this.decal.visible = this.enabled && strength > 0.001
    if (!this.decal.visible) return
    this.frameToggle = !this.frameToggle
    if (!this.frameToggle) return
    this.quadMat.uniforms.uTime!.value = time
    this.quadMat.uniforms.uScatter!.value = scatter
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.render(this.quadScene, this.quadCam)
    renderer.setRenderTarget(prev)
  }

  dispose() {
    this.target.dispose()
    this.quad.geometry.dispose()
    this.quadMat.dispose()
    this.decal.geometry.dispose()
    this.decal.material.dispose()
  }
}
