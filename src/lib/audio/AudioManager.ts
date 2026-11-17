'use client'
/**
 * AudioManager — global singleton (§11).
 *
 * - Muted by default; state persisted to localStorage.
 * - AudioContext created lazily on the first user gesture AFTER enabling.
 * - Everything synthesized at runtime, 400Hz–4kHz, short decays. The two
 *   "file" loops (mechanical bed, air-rush) are generated into AudioBuffers on
 *   idle instead of fetched — same behaviour, zero network weight.
 * - Every voice has an attack/decay envelope. Master ceiling 0.4.
 * - One sound per discrete event, debounced 60ms, voice-stealing at 8 voices.
 */

const STORAGE_KEY = 'gbg:audio'
const MASTER_CEILING = 0.4
const DEBOUNCE_MS = 60
const MAX_VOICES = 8

/** Pentatonic set (A major pentatonic, A4→E6) — any combination resolves. */
const PENTATONIC = [440, 493.88, 554.37, 659.25, 739.99, 880, 987.77, 1108.73]

interface Voice {
  stop: (t: number) => void
  end: number
}

type Listener = (on: boolean) => void

class AudioManagerImpl {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private comp: DynamicsCompressorNode | null = null
  private voices: Voice[] = []
  private last = new Map<string, number>()
  private listeners = new Set<Listener>()
  private enabled = false
  private noiseBuf: AudioBuffer | null = null
  private bedBuf: AudioBuffer | null = null
  private airBuf: AudioBuffer | null = null
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private hum: { osc: OscillatorNode; osc2: OscillatorNode; noise: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null

  constructor() {
    if (typeof window === 'undefined') return
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      this.enabled = false
    }
    // Lazy context on first gesture — never before (autoplay policy).
    const unlock = () => {
      if (this.enabled) this.ensure()
    }
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock)
  }

  get on() {
    return this.enabled
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => void this.listeners.delete(l)
  }

  toggle(force?: boolean) {
    this.enabled = force ?? !this.enabled
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? '1' : '0')
    } catch {
      /* private mode */
    }
    if (this.enabled) {
      this.ensure()
      this.master?.gain.setTargetAtTime(MASTER_CEILING, this.now(), 0.05)
      this.startBed()
    } else if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.now(), 0.05)
    }
    this.listeners.forEach((l) => l(this.enabled))
  }

  private now() {
    return this.ctx?.currentTime ?? 0
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor({ latencyHint: 'interactive' })
    } catch {
      return null
    }
    const ctx = this.ctx
    this.comp = ctx.createDynamicsCompressor()
    this.comp.threshold.value = -14
    this.comp.ratio.value = 6
    this.master = ctx.createGain()
    this.master.gain.value = this.enabled ? MASTER_CEILING : 0
    this.comp.connect(this.master).connect(ctx.destination)
    this.noiseBuf = this.makeNoise(2, 'white')
    // Generated "file" loops — built on idle so the first gesture stays snappy.
    setTimeout(() => {
      this.bedBuf = this.makeBed()
      this.airBuf = this.makeNoise(1.6, 'pink')
      if (this.enabled) this.startBed()
    }, 0)
    return ctx
  }

  private gate(key: string) {
    const t = performance.now()
    const prev = this.last.get(key) ?? 0
    if (t - prev < DEBOUNCE_MS) return false
    this.last.set(key, t)
    return this.enabled && !!this.ensure()
  }

  private claimVoice(v: Voice) {
    const now = this.now()
    this.voices = this.voices.filter((x) => x.end > now)
    if (this.voices.length >= MAX_VOICES) {
      // steal the oldest
      const oldest = this.voices.shift()
      oldest?.stop(now)
    }
    this.voices.push(v)
  }

  private makeNoise(seconds: number, color: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (color === 'white') d[i] = w
      else if (color === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18
      } else {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    // Crossfade the loop seam
    const fade = Math.min(2048, len >> 3)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      d[i] = d[i]! * k + d[len - fade + i]! * (1 - k)
    }
    return buf
  }

  /** Ambient mechanical bed — filtered noise with a faint 4-stroke modulation. */
  private makeBed(): AudioBuffer {
    const ctx = this.ctx!
    const sr = ctx.sampleRate
    const len = sr * 4
    const buf = ctx.createBuffer(1, len, sr)
    const d = buf.getChannelData(0)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / sr
      lp += 0.08 * (Math.random() * 2 - 1 - lp)
      const pulse = 0.55 + 0.45 * Math.pow(Math.sin(Math.PI * t * 2), 8)
      const tone = Math.sin(2 * Math.PI * 440 * t) * 0.04 + Math.sin(2 * Math.PI * 660 * t) * 0.02
      d[i] = (lp * 0.6 + tone) * pulse
    }
    return buf
  }

  private startBed() {
    if (!this.ctx || !this.bedBuf || this.bed || !this.comp) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.bedBuf
    src.loop = true
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'bandpass'
    hp.frequency.value = 900
    hp.Q.value = 0.6
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    src.connect(hp).connect(gain).connect(this.comp)
    src.start()
    this.bed = { src, gain }
  }

  /** Bed gain follows scroll velocity — clamped 0–0.35 (§8.4). */
  setBed(v: number) {
    if (!this.bed || !this.ctx) return
    const g = Math.max(0, Math.min(0.35, v))
    this.bed.gain.gain.setTargetAtTime(g, this.now(), 0.25)
  }

  // ------------------------------------------------------------------ voices

  private blip(freq: number, opts: { dur?: number; type?: OscillatorType; gain?: number; attack?: number; detune?: number; filter?: number } = {}) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const dur = opts.dur ?? 0.06
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'triangle'
    osc.frequency.value = freq
    if (opts.detune) osc.detune.value = opts.detune
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.25, t + (opts.attack ?? 0.002))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let node: AudioNode = osc
    if (opts.filter) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = opts.filter
      node.connect(f)
      node = f
    }
    node.connect(g).connect(this.comp!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    this.claimVoice({
      end: t + dur,
      stop: (at) => {
        g.gain.cancelScheduledValues(at)
        g.gain.setTargetAtTime(0, at, 0.005)
        osc.stop(at + 0.03)
      },
    })
  }

  private noiseBurst(opts: { dur: number; freq: number; q?: number; gain: number; attack?: number; buf?: AudioBuffer | null; sweepTo?: number }) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = opts.buf ?? this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(opts.freq, t)
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur)
    f.Q.value = opts.q ?? 1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.004))
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
    src.connect(f).connect(g).connect(this.comp!)
    src.start(t)
    src.stop(t + opts.dur + 0.05)
    this.claimVoice({
      end: t + opts.dur,
      stop: (at) => {
        g.gain.cancelScheduledValues(at)
        g.gain.setTargetAtTime(0, at, 0.005)
        src.stop(at + 0.03)
      },
    })
  }

  /** Hover tick — tiny, crisp. */
  tick() {
    if (!this.gate('tick')) return
    this.blip(2400, { dur: 0.025, type: 'square', gain: 0.05, filter: 3800 })
  }

  /** Datum ripple — one per burst, never per mark. */
  datum() {
    if (!this.gate('datum')) return
    this.blip(1760, { dur: 0.05, type: 'sine', gain: 0.12 })
    this.blip(2637, { dur: 0.035, type: 'sine', gain: 0.05 })
  }

  /** UI click / press depth */
  click() {
    if (!this.gate('click')) return
    this.noiseBurst({ dur: 0.03, freq: 3200, q: 2, gain: 0.12 })
  }

  /** Wire pluck — Karplus-ish: triangle + harmonic, decaying exponential envelope. */
  pluck(index: number, strength = 1) {
    if (!this.gate('pluck' + index)) return
    const f = PENTATONIC[((index % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]!
    const s = Math.max(0.25, Math.min(1, strength))
    this.blip(f, { dur: 0.9 * s + 0.2, type: 'triangle', gain: 0.18 * s, filter: 3600 })
    this.blip(f * 2, { dur: 0.35, type: 'sine', gain: 0.05 * s })
    this.noiseBurst({ dur: 0.02, freq: f * 3, q: 6, gain: 0.05 * s })
  }

  /** Seat impact — segment landing */
  seat(strength = 1) {
    if (!this.gate('seat')) return
    this.blip(620 + Math.random() * 120, { dur: 0.07, type: 'triangle', gain: 0.1 * strength })
    this.noiseBurst({ dur: 0.04, freq: 2600, q: 3, gain: 0.06 * strength })
  }

  /** Tensioning hum — filtered brown noise through a slowly opening lowpass, rising pitch. */
  humStart() {
    if (!this.enabled || !this.ensure() || this.hum) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 420
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = 843
    const noise = ctx.createBufferSource()
    noise.buffer = this.makeNoise(2, 'brown')
    noise.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    filter.Q.value = 4
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    const og = ctx.createGain()
    og.gain.value = 0.18
    osc.connect(og).connect(filter)
    osc2.connect(filter)
    noise.connect(filter)
    filter.connect(gain).connect(this.comp!)
    osc.start()
    osc2.start()
    noise.start()
    this.hum = { osc, osc2, noise, filter, gain }
  }

  /** p 0→1 over the 900ms hold. */
  humUpdate(p: number) {
    if (!this.hum || !this.ctx) return
    const t = this.ctx.currentTime
    this.hum.osc.frequency.setTargetAtTime(420 + p * 520, t, 0.03)
    this.hum.osc2.frequency.setTargetAtTime(843 + p * 1100, t, 0.03)
    this.hum.filter.frequency.setTargetAtTime(500 + p * 3200, t, 0.05)
    this.hum.gain.gain.setTargetAtTime(0.03 + p * 0.16, t, 0.04)
  }

  humStop() {
    if (!this.hum || !this.ctx) return
    const h = this.hum
    const t = this.ctx.currentTime
    h.gain.gain.cancelScheduledValues(t)
    h.gain.gain.setTargetAtTime(0, t, 0.04)
    setTimeout(() => {
      try {
        h.osc.stop()
        h.osc2.stop()
        h.noise.stop()
        h.gain.disconnect()
      } catch {
        /* already stopped */
      }
    }, 300)
    this.hum = null
  }

  /** Dispersal release + air-rush */
  release() {
    if (!this.gate('release')) return
    this.blip(1320, { dur: 0.12, type: 'square', gain: 0.07, filter: 3000 })
    this.blip(990, { dur: 0.25, type: 'triangle', gain: 0.12 })
    this.noiseBurst({ dur: 1.1, freq: 3600, q: 0.7, gain: 0.22, attack: 0.02, buf: this.airBuf, sweepTo: 600 })
  }

  /** Curtain strip / paper sheet */
  paper(i = 0) {
    if (!this.gate('paper' + (i % 4))) return
    this.noiseBurst({ dur: 0.18, freq: 1800 + (i % 5) * 300, q: 1.2, gain: 0.09, attack: 0.02 })
  }

  /** Page-transition whoosh */
  sweep() {
    if (!this.gate('sweep')) return
    this.noiseBurst({ dur: 0.6, freq: 800, q: 0.8, gain: 0.08, attack: 0.15, buf: this.airBuf, sweepTo: 3200 })
  }

  dispose() {
    this.humStop()
    try {
      this.bed?.src.stop()
    } catch {
      /* noop */
    }
    void this.ctx?.close()
    this.ctx = null
    this.bed = null
  }
}

let instance: AudioManagerImpl | null = null
export const audio = (): AudioManagerImpl => {
  if (!instance) instance = new AudioManagerImpl()
  return instance
}
