'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from '@/lib/gsap'
import { testimonials } from '@/lib/content'
import { useUI } from '@/lib/motion/store'
import { getLenis } from '@/components/providers/MotionProvider'
import { RollingText } from '@/components/primitives/RollingText'
import { LineReveal } from '@/components/primitives/TextReveal'
import { audio } from '@/lib/audio/AudioManager'
import s from './Home.module.css'

export function Testimonials() {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const tabs = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const quote = useRef<HTMLDivElement>(null)
  const modal = useRef<HTMLDivElement>(null)
  const origin = useRef({ x: 0, y: 0 })
  const first = useRef(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // highlight bar — measures the target tab's exact position and width
  const placeBar = useCallback((i: number, instant = false) => {
    const el = tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[i]
    if (!el || !bar.current) return
    gsap.to(bar.current, { x: el.offsetLeft, width: el.offsetWidth, duration: instant ? 0 : 0.6, ease: 'quart.out' })
  }, [])

  useLayoutEffect(() => {
    placeBar(active, first.current)
    if (first.current) {
      first.current = false
      return
    }
    const q = quote.current
    if (!q) return
    if (useUI.getState().reducedMotion) return
    gsap.fromTo(q, { opacity: 0, filter: 'blur(8px)', y: 10 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.4, ease: 'quart.out', clearProps: 'filter' })
  }, [active, placeBar])

  useEffect(() => {
    const ro = new ResizeObserver(() => placeBar(active, true))
    if (tabs.current) ro.observe(tabs.current)
    return () => ro.disconnect()
  }, [active, placeBar])

  const select = (i: number) => {
    if (i === active) return
    audio().tick()
    setActive(i)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const n = testimonials.length
    const next = (active + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
    select(next)
    tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  // Listen modal — circular clip-path from the click, page blurs 4px / dims 6%
  const openModal = (e: MouseEvent) => {
    origin.current = { x: e.clientX, y: e.clientY }
    setOpen(true)
  }
  useEffect(() => {
    const m = modal.current
    const page = document.getElementById('main')
    if (!m || !page) return
    const { x, y } = origin.current
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const reduced = useUI.getState().reducedMotion
    if (open) {
      getLenis()?.stop()
      gsap.set(m, { display: 'grid' })
      gsap.fromTo(m.querySelector('[data-scrim]'), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'quart.out' })
      gsap.fromTo(
        m.querySelector('[data-panel]'),
        { clipPath: `circle(0px at ${x}px ${y}px)` },
        { clipPath: `circle(${R}px at ${x}px ${y}px)`, duration: reduced ? 0.01 : 0.9, ease: 'quint.inOut' },
      )
      gsap.to(page, { filter: 'blur(4px)', duration: 0.6, ease: 'quart.out' })
      const close = m.querySelector<HTMLButtonElement>('[data-close]')
      setTimeout(() => close?.focus(), 50)
      const key = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') setOpen(false)
        if (ev.key === 'Tab') {
          ev.preventDefault()
          close?.focus()
        }
      }
      document.addEventListener('keydown', key)
      return () => document.removeEventListener('keydown', key)
    } else if (m.style.display === 'grid') {
      gsap.to(m.querySelector('[data-panel]'), { clipPath: `circle(0px at ${x}px ${y}px)`, duration: reduced ? 0.01 : 0.6, ease: 'quint.inOut' })
      gsap.to(m.querySelector('[data-scrim]'), { opacity: 0, duration: 0.5, onComplete: () => void gsap.set(m, { display: 'none' }) })
      gsap.to(page, { filter: 'blur(0px)', duration: 0.5, clearProps: 'filter' })
      getLenis()?.start()
    }
  }, [open])

  const t = testimonials[active]!

  return (
    <section className={`${s.testimonials} section`} aria-labelledby="voices-title">
      <div className="wrap">
        <div className={s.sectionHead}>
          <span className="label faint">(05)</span>
          <span className="label">Voices</span>
        </div>
        <LineReveal as="h2" className="h2">
          <span id="voices-title">What tolerance feels like from the other side of the table.</span>
        </LineReveal>

        <div className={s.tabs} ref={tabs} role="tablist" aria-label="Clients" onKeyDown={onKey}>
          <span ref={bar} className={s.tabBar} aria-hidden="true" />
          {testimonials.map((x, i) => (
            <button
              key={x.name}
              role="tab"
              id={`tab-${i}`}
              aria-selected={i === active}
              aria-controls="voice-panel"
              tabIndex={i === active ? 0 : -1}
              className={s.tab}
              onClick={() => select(i)}
            >
              <RollingText>{x.name}</RollingText>
            </button>
          ))}
        </div>

        <div id="voice-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className={s.quoteWrap}>
          <div ref={quote}>
            <blockquote className={`${s.quote} serif`}>“{t.quote}”</blockquote>
            <div className={s.quoteMeta}>
              <span className="label">{t.name}</span>
              <span className="label faint">{t.role}</span>
              <button className={`${s.listen} press`} onClick={openModal} data-cursor="link">
                <span aria-hidden="true">▷</span> <RollingText>Listen</RollingText>
              </button>
            </div>
          </div>
        </div>
      </div>

      {mounted && createPortal(<div ref={modal} className={s.modal} role="dialog" aria-modal="true" aria-label={`${t.name} — audio note`} data-lenis-prevent style={{ display: 'none' }}>
        <div className={s.scrim} data-scrim="" onClick={() => setOpen(false)} />
        <div className={s.modalPanel} data-panel="">
          <div className={s.modalCard}>
            <div className={s.modalHead}>
              <span className="label">Audio note — {t.name}</span>
              <button data-close="" className={`label ${s.close} press`} onClick={() => setOpen(false)}>
                <RollingText>Close</RollingText>
              </button>
            </div>
            <div className={s.wave} aria-hidden="true">
              {Array.from({ length: 64 }, (_, i) => (
                <i key={i} style={{ height: `${18 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 70}%`, animationDelay: `${(i % 9) * -0.11}s` }} />
              ))}
            </div>
            <p className={s.transcript}>
              <span className="label faint">Transcript</span>
              <br />“{t.quote}”
            </p>
          </div>
        </div>
      </div>, document.body)}
    </section>
  )
}
