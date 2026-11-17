'use client'
import { useRef } from 'react'
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap'
import { useUI } from '@/lib/motion/store'
import { brand } from '@/lib/content'
import { LineReveal, BlurTextReveal } from '@/components/primitives/TextReveal'
import { Marquee } from '@/components/primitives/Marquee'
import s from './Home.module.css'

const TICKER = ['Website design', 'Web development', 'Software development', 'Application development', 'Graphic design', 'Video editing', 'Digital marketing', 'Performance marketing']

export function Manifesto() {
  const root = useRef<HTMLElement>(null)
  const rule = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (useUI.getState().reducedMotion) {
        gsap.set(rule.current, { scaleX: 1 })
        return
      }
      // scrubbed hairline 0 → 100% (scrub: 1, never `true` against Lenis)
      gsap.fromTo(
        rule.current,
        { scaleX: 0 },
        { scaleX: 1, ease: 'none', scrollTrigger: { trigger: rule.current, start: 'top 90%', end: 'top 35%', scrub: 1 } },
      )
      return () => ScrollTrigger.getAll().forEach((t) => t.trigger === rule.current && t.kill())
    },
    { scope: root },
  )

  return (
    <section ref={root} className={`${s.sheet} ${s.manifesto}`} aria-labelledby="manifesto-title">
      <div className="wrap">
        <div className={s.sectionHead}>
          <span className="label faint">(01)</span>
          <span className="label">Manifesto</span>
        </div>
        <div ref={rule} className={s.rule} />
        <div className={`grid ${s.manifestoGrid}`}>
          <h2 id="manifesto-title" className="visually-hidden">
            Manifesto
          </h2>
          <LineReveal as="p" className={`${s.statement}`}>
            We are an engineering studio for the digital surface. Every pixel, frame and millisecond is held to tolerance — released only under load, and re-seated with precision.
          </LineReveal>
          <p className={s.verbLine}>
            <span className="faint">We</span>{' '}
            <BlurTextReveal words={brand.verbs} className={s.verb} />{' '}
            <span className="faint">what others only prototype.</span>
          </p>
          <div className={s.manifestoCols}>
            <LineReveal className="mid">
              Founded in Bhopal in 2020, GBGTech brings designers, engineers, editors and growth strategists into one loop. No hand-offs, no translation loss — one team accountable from first sketch to the thousandth release.
            </LineReveal>
            <LineReveal className="mid">
              We work with enterprises modernising critical systems and startups building their first. The constraint is the same: it has to be fast, it has to be beautiful, and it has to hold.
            </LineReveal>
          </div>
        </div>
      </div>
      <div className={s.seam}>
        <Marquee speed={36}>
          {TICKER.map((t) => (
            <span key={t} className={`${s.tick} label`}>
              {t}
              <i aria-hidden="true">◇</i>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  )
}
