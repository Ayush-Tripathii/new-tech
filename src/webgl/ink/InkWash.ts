/**
 * Ink-wash field (§8.7) — raw WebGL2, a single fullscreen triangle.
 * Domain-warped multi-octave simplex noise rendered as translucent graphite
 * diffusing through paper. Composited with CSS multiply at ≤ 0.12 opacity.
 * Turbulence is fed by uPluckEnergy from the shared atmosphere.
 */

const VS = `#version 300 es
in vec2 p;
out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform float uTime;
uniform float uPluck;
uniform float uPluckX;
uniform vec2 uRes;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  uv.x *= uRes.x / uRes.y;
  float t = uTime * 0.035;
  // pluck: a ripple that radiates from the last plucked string
  vec2 c = vec2(uPluckX * uRes.x / uRes.y, 0.35);
  float d = length(uv - c);
  float ripple = sin(d * 26.0 - uTime * 6.0) * exp(-d * 3.0) * uPluck;
  // domain warp
  vec2 q = vec2(fbm(uv * 1.6 + t), fbm(uv * 1.6 - t + 5.2));
  vec2 r = vec2(fbm(uv * 1.6 + 3.0 * q + vec2(1.7, 9.2) + t * 1.4 + ripple * 0.25),
                fbm(uv * 1.6 + 3.0 * q + vec2(8.3, 2.8) - t * 1.1));
  float f = fbm(uv * 1.6 + (3.6 + uPluck * 1.6) * r);
  float ink = smoothstep(-0.15, 0.85, f + 0.18 * length(q));
  ink = pow(ink, 1.6);
  // fades to nothing at the top so it blooms up from the base of the page
  ink *= smoothstep(1.0, 0.1, vUv.y);
  // graphite, cool-tinted; alpha encodes density (CSS multiplies it on paper)
  vec3 graphite = vec3(0.15, 0.18, 0.25);
  float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(graphite + n, clamp(ink, 0.0, 1.0));
}`

export class InkWash {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private buf: WebGLBuffer
  private vao: WebGLVertexArrayObject
  private u: Record<string, WebGLUniformLocation | null> = {}
  private canvas: HTMLCanvasElement
  private dpr: number

  static create(canvas: HTMLCanvasElement, dpr: number): InkWash | null {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true, antialias: false })
    if (!gl) return null
    return new InkWash(canvas, gl, dpr)
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, dpr: number) {
    this.canvas = canvas
    this.gl = gl
    this.dpr = dpr
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s))
      return s
    }
    const vs = sh(gl.VERTEX_SHADER, VS)
    const fs = sh(gl.FRAGMENT_SHADER, FS)
    this.prog = gl.createProgram()!
    gl.attachShader(this.prog, vs)
    gl.attachShader(this.prog, fs)
    gl.bindAttribLocation(this.prog, 0, 'p')
    gl.linkProgram(this.prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    for (const n of ['uTime', 'uPluck', 'uPluckX', 'uRes']) this.u[n] = gl.getUniformLocation(this.prog, n)
    this.resize()
  }

  resize() {
    // half resolution: it's a soft field, nobody can tell, the GPU can
    const scale = this.dpr * 0.5
    const w = Math.max(1, Math.round(this.canvas.clientWidth * scale))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * scale))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  render(time: number, pluck: number, pluckX: number) {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.uniform1f(this.u.uTime!, time)
    gl.uniform1f(this.u.uPluck!, pluck)
    gl.uniform1f(this.u.uPluckX!, pluckX)
    gl.uniform2f(this.u.uRes!, this.canvas.width, this.canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    const gl = this.gl
    gl.deleteBuffer(this.buf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
