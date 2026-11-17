/**
 * Depth-mapped portrait — one fragment shader, zero geometry. Samples a
 * precomputed depth map and parallaxes the image against the cursor.
 * Raw WebGL2: a single fullscreen triangle.
 */
const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uMouse;   // −1..1
uniform float uStrength;
uniform vec2 uCover;   // uv scale for object-fit: cover
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = (vUv - 0.5) * uCover + 0.5;
  float d = texture(uDepth, uv).r;
  // 3-tap refinement reduces stretching on steep depth edges
  vec2 off = uMouse * uStrength;
  vec2 uv2 = uv + off * (d - 0.5);
  d = texture(uDepth, uv2).r;
  uv2 = uv + off * (d - 0.5);
  d = texture(uDepth, uv2).r;
  uv2 = uv + off * (d - 0.5);
  vec3 c = texture(uImg, clamp(uv2, 0.001, 0.999)).rgb;
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`

export class DepthPortrait {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private tex: WebGLTexture[] = []
  private vao: WebGLVertexArrayObject
  private buf: WebGLBuffer
  private u: Record<string, WebGLUniformLocation | null> = {}
  private canvas: HTMLCanvasElement
  private aspect: number
  private dpr: number

  static create(canvas: HTMLCanvasElement, image: HTMLCanvasElement, depth: HTMLCanvasElement, dpr: number) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) return null
    return new DepthPortrait(canvas, gl, image, depth, dpr)
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, image: HTMLCanvasElement, depth: HTMLCanvasElement, dpr: number) {
    this.canvas = canvas
    this.gl = gl
    this.dpr = dpr
    this.aspect = image.width / image.height
    const sh = (t: number, src: string) => {
      const s = gl.createShader(t)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
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
    for (const src of [image, depth]) {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.tex.push(t)
    }
    for (const n of ['uImg', 'uDepth', 'uMouse', 'uStrength', 'uCover']) this.u[n] = gl.getUniformLocation(this.prog, n)
    this.resize()
  }

  resize() {
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr))
    this.canvas.width = w
    this.canvas.height = h
  }

  render(mx: number, my: number) {
    const gl = this.gl
    const ca = this.canvas.width / this.canvas.height
    // object-fit: cover
    const cover = ca > this.aspect ? [1, this.aspect / ca] : [ca / this.aspect, 1]
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.prog)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex[0]!)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.tex[1]!)
    gl.uniform1i(this.u.uImg!, 0)
    gl.uniform1i(this.u.uDepth!, 1)
    gl.uniform2f(this.u.uMouse!, mx, my)
    gl.uniform1f(this.u.uStrength!, 0.045)
    gl.uniform2f(this.u.uCover!, cover[0]!, cover[1]!)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    const gl = this.gl
    this.tex.forEach((t) => gl.deleteTexture(t))
    gl.deleteBuffer(this.buf)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
