'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { projects } from '@/lib/content'
import { drawProjectArt } from '@/lib/projectArt'
import { hasWebGL, isMobile, maxDPR, idle } from '@/lib/env'
import { damp } from '@/lib/motion/tokens'
import { SceneSlot } from '@/webgl/contexts'
import { glBegin } from '@/components/providers/MotionProvider'
import { useTransitionNav, TLink } from '@/components/providers/TransitionProvider'
import { MagneticButton } from '@/components/primitives/Magnetic'
import { audio } from '@/lib/audio/AudioManager'
import type { HelixScene } from '@/webgl/helix/HelixScene'
import s from './Work.module.css'

const ITEMS = projects.slice(0, 10)

export function WorkHelix() {
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const rowA = useRef<HTMLDivElement>(null)
  const rowB = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const { navigate } = useTransitionNav()

  useEffect(() => {
    const sec = section.current!
    const host = canvas.current!
    const reduced = useUI.getState().reducedMotion
    let endGL: (() => void) | null = null
    let target = 0
    let cur = 0
    let inView = false
    let hover = -1
    let flying = false

    const st = ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => void (target = self.progress),
      onToggle: (self) => void (inView = self.isActive),
    })

    // Lives only while near; frees its context slot for the footer ink-wash.
    const slot = new SceneSlot<HelixScene>(
      () =>
        new Promise((resolve) => {
          // texture generation is non-critical → idle
          idle(async () => {
            const { HelixScene } = await import('@/webgl/helix/HelixScene')
            const items = ITEMS.map((p) => ({ slug: p.slug, color: p.color, image: drawProjectArt(p, 1024, 682) }))
            const c = document.createElement('canvas')
            c.className = s.canvasEl ?? ''
            host.appendChild(c)
            const sc = new HelixScene(c, items, Math.min(maxDPR(), 1.75), isMobile())
            const dispose = sc.dispose.bind(sc)
            sc.dispose = () => {
              dispose() // disposes textures via uniforms
              c.remove()
            }
            sc.setProgress(cur)
            sc.frame(1 / 60)
            resolve(sc)
          })
        }),
      (sc) => {
        endGL?.()
        endGL = sc ? glBegin() : null
      },
    )
    const io = new IntersectionObserver(([e]) => {
      if (hasWebGL()) void slot.want(!!e?.isIntersecting)
    }, { rootMargin: '60% 0px' })
    io.observe(sec)
    const ro = new ResizeObserver(() => slot.scene?.resize())
    ro.observe(host)

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      slot.scene?.setPointer(e.clientX, e.clientY, inView && e.clientY > r.top && e.clientY < r.bottom)
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const onClick = () => {
      const sc = slot.scene
      if (!sc || hover < 0 || flying) return
      flying = true
      const proj = ITEMS[hover]!
      sc.fly(hover)
      audio().sweep()
      const p = { t: 0 }
      gsap.to(p, {
        t: 1,
        duration: 0.9,
        ease: 'expo.inOut',
        onUpdate: () => {
          sc.setFly(p.t)
          sc.frame(1 / 60)
        },
        onComplete: () => navigate(`/work/${proj.slug}`),
      })
    }
    host.addEventListener('click', onClick)

    const off = onFrame((f) => {
      cur += (target - cur) * damp(reduced ? 1 : 0.12, f.dt)
      // kinetic type: two layers counter to the helix rotation
      const x = (cur - 0.5) * 40
      if (rowA.current) rowA.current.style.transform = `translate3d(${x.toFixed(2)}vw,0,0)`
      if (rowB.current) rowB.current.style.transform = `translate3d(${(-x).toFixed(2)}vw,0,0)`
      const sc = slot.scene
      if (!sc || document.hidden) return
      sc.setProgress(cur)
      sc.frame(f.dt) // renders only if something moved
      const h = sc.hoveredIndex
      if (h !== hover) {
        hover = h
        setActive(h)
        if (h >= 0) audio().tick()
        // ground tints toward the project's dominant colour at ~6%
        sec.style.setProperty('--tint', h >= 0 ? ITEMS[h]!.color : 'transparent')
        sec.dataset.hover = h >= 0 ? '1' : '0'
      }
    }, 70)

    return () => {
      off()
      st.kill()
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      host.removeEventListener('click', onClick)
      endGL?.()
      slot.dispose()
    }
  }, [navigate])

  const cur = active >= 0 ? ITEMS[active] : null

  return (
    <section ref={section} className={s.section} aria-labelledby="work-title" data-hover="0">
      <div className={s.pin}>
        <div className={s.tint} aria-hidden="true" />
        <div className={s.kinetic} aria-hidden="true">
          <div ref={rowA} className={s.row}>
            Selected work — Selected work — Selected work —
          </div>
          <div ref={rowB} className={`${s.row} ${s.rowB}`}>
            2020 → 2026 · Ten systems · 2020 → 2026 · Ten systems ·
          </div>
        </div>
        <div ref={canvas} className={s.canvas} aria-hidden="true" data-cursor="media" data-cursor-label="VIEW" />
        <div className={`${s.overlay} wrap`}>
          <div className={s.top}>
            <span className="label">(04) Work</span>
            <h2 id="work-title" className="h2">
              Double helix.
            </h2>
          </div>
          <div className={s.bottom}>
            <div className={s.now} aria-live="polite">
              <span className="label faint">{cur ? `${cur.discipline} — ${cur.year}` : 'Hover a card · click to open'}</span>
              <p className={s.nowName}>{cur ? cur.name : 'Ten systems, 2020 → 2026'}</p>
            </div>
            <MagneticButton href="/work" variant="raised">
              All projects
            </MagneticButton>
          </div>
          {/* Accessible, keyboard-navigable equivalent of the WebGL gallery */}
          <ul className="visually-hidden">
            {ITEMS.map((p) => (
              <li key={p.slug}>
                <TLink href={`/work/${p.slug}`}>
                  {p.name} — {p.discipline}, {p.year}
                </TLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
