'use client'
import { useEffect, useRef } from 'react'
import { ScrollTrigger } from '@/lib/gsap'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { services } from '@/lib/content'
import { hasWebGL, isMobile, maxDPR } from '@/lib/env'
import { clamp, damp, ease, win } from '@/lib/motion/tokens'
import { SceneSlot } from '@/webgl/contexts'
import { glBegin } from '@/components/providers/MotionProvider'
import { audio } from '@/lib/audio/AudioManager'
import type { ArmatureScene } from '@/webgl/armature/ArmatureScene'
import s from './Services.module.css'

const HEADLINE = 'Six disciplines. One tolerance.'
const SHEETS = 5

// palette endpoints (sRGB 0–255)
const C = {
  paper: [247, 246, 243],
  ink: [21, 23, 27],
  inkMid: [90, 95, 105],
  invert: [11, 12, 15],
  raise: [255, 255, 255],
  raiseDark: [22, 24, 29],
  sh: [38, 46, 64], // hsl(218 25% 20%)
  halo: [255, 255, 255],
} as const
const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(' ')
const smooth = (x: number) => x * x * (3 - 2 * x)

/**
 * §8.4 — ~400vh pinned (250vh mobile). ONE normalised progress value drives
 * everything; each effect derives its window from it. No per-effect timelines.
 */
export function ServicesSequence() {
  const section = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const glyphs = useRef<HTMLHeadingElement>(null)
  const cards = useRef<HTMLDivElement>(null)
  const sheets = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sec = section.current!
    const pinEl = pin.current!
    const reduced = useUI.getState().reducedMotion
    const chars = Array.from(glyphs.current!.querySelectorAll<HTMLElement>('[data-g]'))
    const cardEls = Array.from(cards.current!.querySelectorAll<HTMLElement>('[data-card]'))
    const sheetEls = Array.from(sheets.current!.children) as HTMLElement[]

    // per-glyph scatter vectors (deterministic)
    const gv = chars.map((_, i) => {
      const r = (k: number) => {
        const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
        return x - Math.floor(x) - 0.5
      }
      return { x: r(1) * 380, y: r(2) * 260 - 60, rot: r(3) * 140, z: 0.5 + r(4) }
    })
    // predefined card motion paths (fractions of viewport + rotation)
    const paths = [
      { x: -0.7, y: 0.35, r: -18 },
      { x: 0.1, y: 0.9, r: 10 },
      { x: 0.75, y: 0.4, r: 22 },
      { x: -0.55, y: -0.5, r: 14 },
      { x: 0.25, y: 1.0, r: -12 },
      { x: 0.8, y: -0.3, r: -20 },
    ]

    let target = reduced ? 0.8 : 0
    let cur = target
    let last = -1
    let scene: ArmatureScene | null = null
    let endGL: (() => void) | null = null
    let cancelled = false
    let inView = false
    let lastInv = -1

    const st = reduced
      ? null
      : ScrollTrigger.create({
          trigger: sec,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => void (target = self.progress),
          onToggle: (self) => {
            inView = self.isActive
            if (!self.isActive) {
              useUI.getState().set({ inverted: false })
              sec.dataset.theme = 'light'
              audio().setBed(0)
            }
          },
          invalidateOnRefresh: true,
        })

    // WebGL — dynamically imported; lives only while the section is near,
    // so its context slot can be handed on down the page.
    const host = canvas.current!
    const slot = new SceneSlot<ArmatureScene>(
      async () => {
        const { ArmatureScene } = await import('@/webgl/armature/ArmatureScene')
        const c = document.createElement('canvas')
        c.className = s.canvasEl ?? ''
        host.appendChild(c)
        const sc = new ArmatureScene({ canvas: c, mode: 'scrub', dpr: Math.min(maxDPR(), 1.75), mobile: isMobile(), quality: useUI.getState().quality, transparent: true })
        await sc.warm()
        const dispose = sc.dispose.bind(sc)
        sc.dispose = () => {
          dispose()
          c.remove()
        }
        return sc
      },
      (sc) => {
        scene = sc
        endGL?.()
        endGL = sc ? glBegin() : null
        last = -1 // force a render
      },
    )
    const io = new IntersectionObserver(([e]) => {
      if (hasWebGL() && !cancelled) void slot.want(!!e?.isIntersecting)
    }, { rootMargin: '60% 0px' })
    io.observe(sec)
    const ro = new ResizeObserver(() => {
      scene?.resize()
      last = -1
    })
    ro.observe(pinEl)

    const apply = (p: number) => {
      const vw = window.innerWidth
      const vh = window.innerHeight

      // 0.05–0.25 glyph scatter → pull back into formation
      const g = Math.sin(Math.PI * win(p, 0.05, 0.25))
      for (let i = 0; i < chars.length; i++) {
        const v = gv[i]!
        const el = chars[i]!
        if (g < 0.0005) {
          el.style.transform = ''
          el.style.textShadow = ''
          continue
        }
        el.style.transform = `translate3d(${(v.x * g).toFixed(1)}px,${(v.y * g).toFixed(1)}px,0) rotate(${(v.rot * g).toFixed(1)}deg) scale(${(1 + (v.z - 0.5) * 0.4 * g).toFixed(3)})`
        // faint offset shadow → glyphs read as tiles lifting off the page
        el.style.textShadow = `${(g * 4).toFixed(1)}px ${(g * 9).toFixed(1)}px ${(g * 12).toFixed(1)}px rgb(var(--sv-sh) / ${(g * 0.22).toFixed(3)})`
      }

      // 0.20–0.80 cards along motion paths; elevation 1→2; border draws
      for (let i = 0; i < cardEls.length; i++) {
        const a = 0.2 + i * 0.07
        const ct = ease.outExpo(win(p, a, a + 0.2))
        const pth = paths[i]!
        const inv = 1 - ct
        const el = cardEls[i]!
        el.style.transform = inv < 0.0005 ? '' : `translate3d(${(pth.x * vw * inv).toFixed(1)}px,${(pth.y * vh * inv).toFixed(1)}px,0) rotate(${(pth.r * inv).toFixed(2)}deg)`
        el.style.opacity = clamp(ct * 2.5).toFixed(3)
        el.style.setProperty('--settle', ct.toFixed(3))
        el.style.setProperty('--draw', (1 - ct).toFixed(4))
      }

      // 0.55–0.75 full palette inversion (hold dark ≈ 0.12 of progress)
      const invT = smooth(win(p, 0.55, 0.59)) * (1 - smooth(win(p, 0.71, 0.75)))
      if (Math.abs(invT - lastInv) > 0.0005) {
        lastInv = invT
        sec.style.setProperty('--sv-bg', mix(C.paper, C.invert, invT))
        sec.style.setProperty('--sv-ink', mix(C.ink, C.paper, invT))
        sec.style.setProperty('--sv-ink-mid', mix(C.inkMid, [176, 180, 188], invT))
        sec.style.setProperty('--sv-raise', mix(C.raise, C.raiseDark, invT))
        sec.style.setProperty('--sv-sh', mix(C.sh, C.halo, invT))
        sec.style.setProperty('--sv-line', mix([21, 23, 27], [247, 246, 243], invT))
        const dark = invT > 0.5
        if ((sec.dataset.theme === 'dark') !== dark) {
          sec.dataset.theme = dark ? 'dark' : 'light'
          useUI.getState().set({ inverted: dark && inView })
        }
      }

      // 0.85–1.00 five sheets wipe up in sequence (stagger 0.04)
      for (let i = 0; i < sheetEls.length; i++) {
        const a = 0.85 + i * 0.022
        const t = ease.inOutQuint(win(p, a, a + 0.06))
        sheetEls[i]!.style.transform = `scaleY(${t.toFixed(4)})`
      }

      // 0.00–0.70 the armature turns, disperses and re-seats; canvas inverts via uniform
      if (scene) {
        scene.setScrub(p)
        scene.setInvert(invT)
      }
    }

    apply(cur)
    const off = onFrame((f) => {
      if (cancelled) return
      cur += (target - cur) * damp(0.12, f.dt) // lerp kills scrub jitter
      if (Math.abs(target - cur) < 0.00005) cur = target
      if (inView) audio().setBed(Math.abs(f.scroll.velocity) / 4000)
      const changed = Math.abs(cur - last) > 0.00002
      if (!changed && !(scene && inView)) return
      if (changed) {
        apply(cur)
        last = cur
      }
      // render on demand: while progress moves, plus a gentle idle when pinned
      if (scene && (changed || inView) && !document.hidden) {
        scene.update(changed ? f.dt : f.dt * 0.6)
        scene.render()
      }
    }, 70)

    return () => {
      cancelled = true
      off()
      st?.kill()
      io.disconnect()
      ro.disconnect()
      endGL?.()
      slot.dispose()
      useUI.getState().set({ inverted: false })
      audio().setBed(0)
    }
  }, [])

  return (
    <section ref={section} className={s.section} data-theme="light" aria-labelledby="services-title" id="services">
      <div ref={pin} className={s.pin}>
        <div className={s.bg} aria-hidden="true" />
        <div ref={canvas} className={s.canvas} aria-hidden="true" />
        <div className="dither-local" aria-hidden="true" />
        <div className={`${s.inner} wrap`}>
          <div className={s.left}>
            <div className={s.head}>
              <span className="label">(03) Services</span>
            </div>
            <h2 ref={glyphs} id="services-title" className={`${s.title} h1`} aria-label={HEADLINE}>
              {HEADLINE.split(' ').map((w, wi) => (
                <span key={wi} className={s.word} aria-hidden="true">
                  {Array.from(w).map((c, ci) => (
                    <span key={ci} data-g="" className={s.glyph}>
                      {c}
                    </span>
                  ))}{' '}
                </span>
              ))}
            </h2>
            <p className={s.sub}>Eight capabilities, consolidated into six disciplines that ship as one team.</p>
          </div>
          <div ref={cards} className={s.cards}>
            {services.map((sv) => (
              <article key={sv.index} data-card="" className={s.card}>
                <svg className={s.border} aria-hidden="true">
                  <rect x="0" y="0" width="100%" height="100%" rx="10" pathLength={1} />
                </svg>
                <div className={s.cardTop}>
                  <span className="label">{sv.index}</span>
                  <span className={`label ${s.cardStack}`}>{sv.stack.slice(0, 2).join(' · ')}</span>
                </div>
                <h3 className={s.cardTitle}>{sv.title}</h3>
                <p className={s.cardBody}>{sv.summary}</p>
                <ul className={s.scope}>
                  {sv.scope.map((x) => (
                    <li key={x} className="label">
                      {x}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
        <div ref={sheets} className={s.sheets} aria-hidden="true">
          {Array.from({ length: SHEETS }, (_, i) => (
            <div key={i} className={s.sheet} />
          ))}
        </div>
      </div>
    </section>
  )
}
