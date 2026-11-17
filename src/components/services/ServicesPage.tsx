'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { process as steps, services, stack } from '@/lib/content'
import { hasWebGL, isMobile, maxDPR } from '@/lib/env'
import { acquireContext } from '@/webgl/contexts'
import { glBegin } from '@/components/providers/MotionProvider'
import { SplitHeadline, LineReveal, FadeUp } from '@/components/primitives/TextReveal'
import { MagneticButton } from '@/components/primitives/Magnetic'
import { TiltCard } from '@/components/primitives/Tilt'
import { audio } from '@/lib/audio/AudioManager'
import type { Swarm } from '@/webgl/particles/Swarm'
import p from '@/components/primitives/primitives.module.css'
import s from './Services.module.css'

function SwarmHero() {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = cv.current
    if (!c || !hasWebGL()) return
    let swarm: Swarm | null = null
    let release: (() => void) | null = null
    let endGL: (() => void) | null = null
    let off: (() => void) | null = null
    let cancelled = false
    const reduced = useUI.getState().reducedMotion
    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      swarm?.setPointer(e.clientX, e.clientY, e.clientY > r.top && e.clientY < r.bottom)
    }
    ;(async () => {
      release = await acquireContext()
      if (cancelled) return release()
      const { Swarm } = await import('@/webgl/particles/Swarm')
      if (cancelled) return release()
      swarm = new Swarm(c, Math.min(maxDPR(), 2), isMobile() ? 6000 : 12000)
      endGL = glBegin()
      const sw = swarm
      if (reduced) {
        sw.frame(10, 10) // fully formed single frame, then stop
        return
      }
      window.addEventListener('pointermove', onMove, { passive: true })
      off = onFrame((f) => {
        if (document.hidden || f.scroll.y > f.viewport.h * 1.1) return
        sw.frame(f.dt, f.time)
      }, 80)
    })()
    const ro = new ResizeObserver(() => swarm?.resize())
    ro.observe(c)
    return () => {
      cancelled = true
      off?.()
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      endGL?.()
      swarm?.dispose()
      release?.()
    }
  }, [])
  return <canvas ref={cv} className={s.swarm} aria-hidden="true" />
}

function Accordion() {
  const [open, setOpen] = useState<number>(0)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduced = useUI.getState().reducedMotion
    el.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel, i) => {
      const inner = panel.firstElementChild as HTMLElement
      const items = panel.querySelectorAll('li')
      if (i === open) {
        gsap.to(panel, { height: inner.offsetHeight, duration: reduced ? 0 : 0.6, ease: 'expo.out', onComplete: () => void (panel.style.height = 'auto') })
        gsap.fromTo(items, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: reduced ? 0 : 0.5, ease: 'expo.out', stagger: 0.04, delay: 0.1 })
      } else {
        gsap.to(panel, { height: 0, duration: reduced ? 0 : 0.5, ease: 'quint.inOut' })
      }
    })
    ScrollTrigger.refresh()
  }, [open])
  return (
    <div ref={root} className={s.acc}>
      {stack.map((g, i) => {
        const isOpen = open === i
        return (
          <div key={g.group} className={s.accRow} data-open={isOpen ? '1' : '0'}>
            <h3>
              <button
                className={s.accBtn}
                aria-expanded={isOpen}
                aria-controls={`acc-${i}`}
                id={`accb-${i}`}
                onClick={() => {
                  audio().tick()
                  setOpen(isOpen ? -1 : i)
                }}
              >
                <span className="label faint">{String(i + 1).padStart(2, '0')}</span>
                <span className={s.accTitle}>{g.group}</span>
                <span className={s.plus} aria-hidden="true" />
              </button>
            </h3>
            <div id={`acc-${i}`} role="region" aria-labelledby={`accb-${i}`} data-panel="" className={s.accPanel} style={{ height: i === 0 ? 'auto' : 0 }}>
              <ul className={s.accItems}>
                {g.items.map((it) => (
                  <li key={it} className="label">
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Process() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const line = el.querySelector('[data-line]')
    const dots = el.querySelectorAll('[data-dot]')
    if (useUI.getState().reducedMotion) {
      gsap.set(line, { scaleY: 1 })
      return
    }
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 70%', end: 'bottom 60%', scrub: 1 } })
    tl.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: 'none' })
    dots.forEach((d, i) => tl.fromTo(d, { scale: 0 }, { scale: 1, duration: 0.05, ease: 'back.out(1.4)' }, i / dots.length))
    return () => {
      tl.scrollTrigger?.kill()
      tl.kill()
    }
  }, [])
  return (
    <div ref={root} className={s.process}>
      <div className={s.track} aria-hidden="true">
        <div data-line="" className={s.trackLine} />
      </div>
      {steps.map((st) => (
        <div key={st.index} className={s.step}>
          <span data-dot="" className={s.dot} aria-hidden="true" />
          <span className="label faint">{st.index}</span>
          <h3 className="h2">{st.title}</h3>
          <p className="mid">{st.body}</p>
        </div>
      ))}
    </div>
  )
}

export function ServicesPage() {
  return (
    <>
      <section className={s.hero}>
        <SwarmHero />
        <div className="dither-local" aria-hidden="true" />
        <div className={`${s.heroCopy} wrap`}>
          <span className="label">Services — six disciplines</span>
          <SplitHeadline as="h1" className="display mega">
            Capability,
            <br />
            machined.
          </SplitHeadline>
          <p className="lede">Website design and development, software, apps, graphic design, video and growth marketing — one team, one tolerance.</p>
        </div>
      </section>

      <section className="section wrap">
        <div className={`${s.cards} ${p.liftGroup}`}>
          {services.map((sv) => (
            <article key={sv.index} className={`${p.lift} ${p.ink} ${s.card}`}>
              <div className={s.cardHead}>
                <span className="label faint">{sv.index}</span>
                <span className="label">{sv.stack.join(' · ')}</span>
              </div>
              <h2 className="h2">{sv.title}</h2>
              <p className="mid">{sv.summary}</p>
              <ul className={s.scope}>
                {sv.scope.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section wrap">
        <div className={s.split}>
          <div>
            <span className="label">Tech stack</span>
            <LineReveal as="h2" className="h1">
              Tools chosen for the decade, not the quarter.
            </LineReveal>
          </div>
          <Accordion />
        </div>
      </section>

      <section className="section wrap">
        <span className="label">Process</span>
        <LineReveal as="h2" className={`h1 ${s.processTitle}`}>
          Calibrate. Machine. Seat.
        </LineReveal>
        <Process />
      </section>

      <section className="section wrap">
        <FadeUp>
          <TiltCard className={s.ctaCard}>
            <h2 className="h2">Have a system that needs to hold?</h2>
            <MagneticButton href="/#contact">Start a project</MagneticButton>
          </TiltCard>
        </FadeUp>
      </section>
    </>
  )
}
