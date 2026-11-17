'use client'
import { useEffect, useRef, useState } from 'react'
import { brand, nav, services } from '@/lib/content'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { atmosphere } from '@/lib/motion/atmosphere'
import { audio } from '@/lib/audio/AudioManager'
import { SceneSlot } from '@/webgl/contexts'
import { maxDPR } from '@/lib/env'
import { TLink } from '@/components/providers/TransitionProvider'
import { RollingText, Arrow } from '@/components/primitives/RollingText'
import { MagneticButton } from '@/components/primitives/Magnetic'
import s from './Footer.module.css'

/* --------------------------------------------------------------------------
   Wire wordmark geometry — GBGTECH as straight strokes (each one a string).
   Letter cell 60×100, tracking 28.
   -------------------------------------------------------------------------- */
type Seg = [number, number, number, number]
const L: Record<string, Seg[]> = {
  G: [[60, 0, 0, 0], [0, 0, 0, 100], [0, 100, 60, 100], [60, 100, 60, 54], [60, 54, 28, 54]],
  B: [[0, 0, 0, 100], [0, 0, 46, 0], [46, 0, 60, 14], [60, 14, 60, 36], [60, 36, 46, 50], [0, 50, 46, 50], [46, 50, 60, 64], [60, 64, 60, 86], [60, 86, 46, 100], [46, 100, 0, 100]],
  T: [[0, 0, 60, 0], [30, 0, 30, 100]],
  E: [[0, 0, 0, 100], [0, 0, 60, 0], [0, 50, 44, 50], [0, 100, 60, 100]],
  C: [[60, 0, 0, 0], [0, 0, 0, 100], [0, 100, 60, 100]],
  H: [[0, 0, 0, 100], [60, 0, 60, 100], [0, 50, 60, 50]],
}
const WORD = 'GBGTECH'
const CELL = 60
const TRACK = 28
const VW = WORD.length * CELL + (WORD.length - 1) * TRACK
const STROKES: Seg[] = []
WORD.split('').forEach((ch, i) => {
  const ox = i * (CELL + TRACK)
  for (const [a, b, c, d] of L[ch]!) STROKES.push([a + ox, b, c + ox, d])
})

interface Wire {
  x1: number; y1: number; x2: number; y2: number
  nx: number; ny: number; len: number
  d: number; v: number
  grabbed: boolean
  lastS: number
  freq: number; damping: number; phase: number
  el: SVGPathElement | null
}

function WireWordmark() {
  const svg = useRef<SVGSVGElement>(null)
  const wires = useRef<Wire[]>(
    STROKES.map(([x1, y1, x2, y2], i) => {
      const len = Math.hypot(x2 - x1, y2 - y1)
      return {
        x1, y1, x2, y2, len,
        nx: -(y2 - y1) / len, ny: (x2 - x1) / len,
        d: 0, v: 0, grabbed: false, lastS: NaN,
        // shorter strings ring higher and die faster — like real wire.
        // freq in Hz (visual), damping as ratio ζ
        freq: Math.min(12, 5 + 160 / Math.max(len, 14)),
        damping: 0.03 + 0.5 / Math.max(len, 14),
        phase: i,
        el: null,
      }
    }),
  )

  useEffect(() => {
    const root = svg.current
    if (!root) return
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('[data-wire]'))
    wires.current.forEach((w, i) => (w.el = paths[i] ?? null))
    let visible = false
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting))
    io.observe(root)
    const pt = root.createSVGPoint()
    const reduced = useUI.getState().reducedMotion

    const off = onFrame((f) => {
      if (!visible) return
      const ctm = root.getScreenCTM()
      if (!ctm) return
      pt.x = f.pointer.x
      pt.y = f.pointer.y
      const p = pt.matrixTransform(ctm.inverse())
      const dt = Math.min(f.dt, 1 / 30)
      for (let i = 0; i < wires.current.length; i++) {
        const w = wires.current[i]!
        // pointer in string space: t along, s perpendicular
        const t = ((p.x - w.x1) * (w.x2 - w.x1) + (p.y - w.y1) * (w.y2 - w.y1)) / (w.len * w.len)
        const sDist = (p.x - w.x1) * w.nx + (p.y - w.y1) * w.ny
        const inSpan = t > 0.06 && t < 0.94 && f.pointer.active
        if (!reduced && inSpan && !w.grabbed && !Number.isNaN(w.lastS) && Math.sign(sDist) !== Math.sign(w.lastS) && Math.abs(sDist) < 30) {
          w.grabbed = true // pointer crossed the wire → it catches
        }
        if (w.grabbed) {
          // deflect toward the cursor via the quadratic control point
          const bell = Math.sin(Math.PI * Math.max(0, Math.min(1, t)))
          w.d = sDist / Math.max(bell, 0.35)
          w.v = 0
          const max = Math.min(26, w.len * 0.35)
          if (!inSpan || Math.abs(w.d) > max) {
            // release → plucked wire oscillates to rest
            w.grabbed = false
            w.d = Math.max(-max, Math.min(max, w.d))
            const strength = Math.min(1, Math.abs(w.d) / 22)
            audio().pluck(i, strength)
            atmosphere.pluck(strength * 0.6, (w.x1 + w.x2) / 2 / VW)
          }
        } else if (Math.abs(w.d) > 0.01 || Math.abs(w.v) > 0.5) {
          // damped harmonic oscillator, semi-implicit Euler: a = −ω²d − 2ζωv
          const omega = Math.PI * 2 * w.freq
          w.v += (-omega * omega * w.d - 2 * w.damping * omega * w.v) * dt
          w.d += w.v * dt
        } else {
          w.d = 0
          w.v = 0
        }
        w.lastS = inSpan ? sDist : NaN
        if (w.el) {
          const mx = (w.x1 + w.x2) / 2 + w.nx * w.d
          const my = (w.y1 + w.y2) / 2 + w.ny * w.d
          w.el.setAttribute('d', `M${w.x1} ${w.y1}Q${mx.toFixed(2)} ${my.toFixed(2)} ${w.x2} ${w.y2}`)
        }
      }
    }, 60)
    return () => {
      off()
      io.disconnect()
    }
  }, [])

  return (
    <svg ref={svg} className={s.wordmark} viewBox={`-16 -16 ${VW + 32} 132`} role="img" aria-label={brand.name}>
      {STROKES.map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <path data-wire="" d={`M${x1} ${y1}Q${(x1 + x2) / 2} ${(y1 + y2) / 2} ${x2} ${y2}`} className={s.wire} />
          {/* invisible enlarged hit area */}
          <line x1={x1} y1={y1} x2={x2} y2={y2} className={s.wireHit} />
        </g>
      ))}
    </svg>
  )
}

function Clock() {
  const [time, setTime] = useState('--:--:--')
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: brand.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const tick = () => setTime(fmt.format(new Date()))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span className="label" suppressHydrationWarning>
      <span className="faint">{brand.city} · IST </span>
      <time>{time}</time>
    </span>
  )
}

function Ink() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = host.current
    if (!h || useUI.getState().reducedMotion) return
    let visible = false
    const slot = new SceneSlot<import('@/webgl/ink/InkWash').InkWash>(async () => {
      const { InkWash } = await import('@/webgl/ink/InkWash')
      const c = document.createElement('canvas')
      c.className = s.inkCanvas ?? ''
      h.appendChild(c)
      const ink = InkWash.create(c, Math.min(maxDPR(), 1.5))
      if (!ink) {
        c.remove()
        return null
      }
      const dispose = ink.dispose.bind(ink)
      ink.dispose = () => {
        dispose()
        c.remove()
      }
      return ink
    })
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      void slot.want(visible)
    }, { rootMargin: '30% 0px' })
    io.observe(h)
    const ro = new ResizeObserver(() => slot.scene?.resize())
    ro.observe(h)
    let frameSkip = 0
    const off = onFrame((f) => {
      const ink = slot.scene
      if (!visible || !ink || document.hidden) return
      atmosphere.pluckEnergy *= Math.exp(-1.4 * f.dt)
      // 30fps is plenty for a slow wash — halves its cost
      if ((frameSkip = (frameSkip + 1) % 2) !== 0 && atmosphere.pluckEnergy < 0.02) return
      ink.render(f.time, atmosphere.pluckEnergy, atmosphere.pluckX)
    }, 85)
    return () => {
      off()
      io.disconnect()
      ro.disconnect()
      slot.dispose()
    }
  }, [])
  return <div ref={host} className={s.ink} aria-hidden="true" />
}

export function Footer() {
  return (
    <footer className={s.footer}>
      <Ink />
      <div className="dither-local" aria-hidden="true" />
      <div className={`${s.inner} wrap`}>
        <div className={s.cta}>
          <p className="label faint">Next step</p>
          <p className={`${s.ctaTitle} h1`}>Let’s engineer something unforgettable.</p>
          <MagneticButton href="/#contact">Start a project</MagneticButton>
        </div>
        <div className={s.cols}>
          <div>
            <p className="label faint">Sitemap</p>
            <ul>
              {[{ label: 'Index', href: '/' }, ...nav].map((n) => (
                <li key={n.href}>
                  <TLink href={n.href}>
                    <RollingText>{n.label}</RollingText>
                  </TLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label faint">Disciplines</p>
            <ul>
              {services.map((sv) => (
                <li key={sv.index}>
                  <TLink href="/services">
                    <RollingText>{sv.title}</RollingText>
                  </TLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label faint">Elsewhere</p>
            <ul>
              {brand.socials.map((so) => (
                <li key={so.label}>
                  <a href={so.href} target="_blank" rel="noopener noreferrer" className={s.ext}>
                    <RollingText>{so.label}</RollingText>
                    <Arrow />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label faint">Studio</p>
            <address className={s.addr}>
              {brand.city}, Madhya Pradesh
              <br />
              {brand.country}
              <br />
              <a href={`mailto:${brand.email}`}>
                <RollingText>{brand.email}</RollingText>
              </a>
            </address>
          </div>
        </div>
        <div className={s.markWrap}>
          <WireWordmark />
          <p className={`label faint ${s.pluckHint}`} aria-hidden="true">
            Pluck the wires
          </p>
        </div>
        <div className={s.legal}>
          <span className="label faint">© {new Date().getFullYear()} {brand.name}. Est. {brand.founded}.</span>
          <Clock />
          <span className="label faint">{brand.coords}</span>
        </div>
      </div>
    </footer>
  )
}
