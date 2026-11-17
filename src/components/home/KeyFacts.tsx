'use client'
import { useEffect, useRef } from 'react'
import { awards, facts } from '@/lib/content'
import { Odometer } from '@/components/primitives/Odometer'
import { TiltCard } from '@/components/primitives/Tilt'
import { BlurTextReveal, FadeUp } from '@/components/primitives/TextReveal'
import { useUI } from '@/lib/motion/store'
import { onFrame } from '@/lib/motion/frame'
import p from '@/components/primitives/primitives.module.css'
import s from './Home.module.css'

/**
 * Video-on-hover card. No footage ships yet, so the "video" is a procedural
 * canvas loop (a turning hairline armature) with identical behaviour:
 * poster frame at rest, play on enter, pause + reset on leave, scale 1.04,
 * elevation --elev-2 → --elev-3. Swap <canvas> for <video src="#t=0.1"
 * playsInline muted loop> when real footage exists.
 */
function MotionCard() {
  const cv = useRef<HTMLCanvasElement>(null)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = cv.current
    const el = card.current
    if (!c || !el) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    let playing = false
    let t = 0.1 // poster at #t=0.1
    const dpr = Math.min(devicePixelRatio, 2)
    const size = () => {
      c.width = c.clientWidth * dpr
      c.height = c.clientHeight * dpr
      draw()
    }
    const draw = () => {
      const w = c.width, h = c.height
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2
      const R = Math.min(w, h) * 0.3
      ctx.lineWidth = 1 * dpr
      for (let i = 0; i < 3; i++) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1) + i)
        ctx.strokeStyle = `hsla(218,12%,${30 + i * 12}%,${0.7 - i * 0.15})`
        ctx.beginPath()
        ctx.ellipse(0, 0, R * (1.35 + i * 0.12), R * (0.32 + 0.25 * Math.abs(Math.sin(t * 0.5 + i))), 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + t * 0.3
        const off = Math.max(0, Math.sin(t * 1.2)) * R * 0.25
        ctx.strokeStyle = 'hsla(218,25%,20%,.55)'
        ctx.beginPath()
        ctx.arc(cx + Math.cos(a + 0.39) * off, cy + Math.sin(a + 0.39) * off, R, a + 0.04, a + Math.PI / 4 - 0.04)
        ctx.stroke()
      }
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(c)
    const off = onFrame((f) => {
      if (!playing) return
      t += f.dt
      draw()
    })
    const enter = () => {
      if (useUI.getState().reducedMotion) return
      playing = true
    }
    const leave = () => {
      playing = false
      t = 0.1
      draw()
    }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    return () => {
      off()
      ro.disconnect()
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])
  return (
    <div ref={card} className={s.videoCard} data-cursor="media" data-cursor-label="PLAY">
      <canvas ref={cv} className={s.videoCanvas} aria-hidden="true" />
      <div className={s.videoMeta}>
        <span className="label">Reel — 2026</span>
        <span className="label faint">01:24</span>
      </div>
    </div>
  )
}

export function KeyFacts() {
  return (
    <section className={`${s.facts} section`} aria-labelledby="facts-title">
      <div className="wrap">
        <div className={s.sectionHead}>
          <span className="label faint">(02)</span>
          <span className="label">Key facts</span>
        </div>
        <h2 id="facts-title" className={`h1 ${s.factsTitle}`}>
          Six years of shipping.
          <br />
          <span className="faint">Measured, not claimed.</span>
        </h2>
        <div className={s.factsGrid}>
          {facts.map((f, i) => (
            <TiltCard key={f.label} className={s.factCard}>
              <span className="label faint">{String(i + 1).padStart(2, '0')}</span>
              <Odometer value={f.value} className={s.factValue} delay={i * 0.09} />
              <div>
                <p className={s.factLabel}>{f.label}</p>
                <BlurTextReveal words={[f.hint]} className="label faint" />
              </div>
            </TiltCard>
          ))}
          <MotionCard />
        </div>
        <FadeUp className={`${s.awards} ${p.dimGroup}`}>
          <span className="label faint">Recognition</span>
          <ul className={s.awardList}>
            {awards.map((a) => (
              <li key={a} className={`${p.dim} ${s.award}`}>
                {a}
              </li>
            ))}
          </ul>
        </FadeUp>
      </div>
    </section>
  )
}
