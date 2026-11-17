'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { whenReady, useUI } from '@/lib/motion/store'
import { audio } from '@/lib/audio/AudioManager'
import s from './Hero.module.css'

interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  /** which lines a ripple travels to next */
  links: number[]
}

/**
 * Three hairline measurement lines with mono dimension labels. Drawn on load
 * (DrawSVG, 1.2s, stagger 0.15). Once all three complete, hovering a line
 * fires a tick ripple outward from the pointer, travelling on to one or two
 * linked lines. One synthesized tick per burst.
 */
export function DatumLines() {
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const armed = useRef(false)
  const busy = useRef<boolean[]>([false, false, false])

  useEffect(() => {
    const el = svg.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      if (!e) return
      setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const wide = w > h * 1.15
  const m = Math.max(16, Math.min(56, w * 0.032))
  const ax = wide ? w * 0.5 + Math.min(w, 2000) * 0.2 : w * 0.5
  const lines: Line[] =
    w === 0
      ? []
      : [
          { x1: m, y1: h * (wide ? 0.62 : 0.5), x2: w - m, y2: h * (wide ? 0.62 : 0.5), label: 'DATUM A — 0.000', links: [1] },
          { x1: ax, y1: h * 0.13, x2: ax, y2: h * (wide ? 0.9 : 0.46), label: 'Ø 2.000 ±0.015', links: [0, 2] },
          { x1: wide ? w * 0.52 : m, y1: h * 0.2, x2: w - m, y2: h * 0.2, label: 'Z 1.950', links: [1] },
        ]

  // draw-in
  useEffect(() => {
    if (!lines.length) return
    const root = svg.current
    if (!root) return
    let tl: gsap.core.Timeline | null = null
    whenReady().then(() => {
      const paths = root.querySelectorAll('[data-draw]')
      const labels = root.querySelectorAll('[data-label]')
      const ticks = root.querySelectorAll('[data-tick]')
      if (useUI.getState().reducedMotion) {
        gsap.set([paths, labels, ticks], { opacity: 1 })
        armed.current = true
        return
      }
      tl = gsap.timeline({ delay: 0.5, onComplete: () => void (armed.current = true) })
      tl.fromTo(paths, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.2, stagger: 0.15, ease: 'expo.inOut' }, 0)
        .fromTo(ticks, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.004 }, 0.4)
        .fromTo(labels, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: 'expo.out' }, 0.9)
    })
    return () => void tl?.kill()
    // size change re-renders paths; only draw once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length > 0])

  const ripple = (i: number, from: number, depth: number, withSound: boolean) => {
    if (!armed.current || busy.current[i]) return
    const root = svg.current
    if (!root) return
    busy.current[i] = true
    const ticks = Array.from(root.querySelectorAll<SVGLineElement>(`[data-line="${i}"] [data-tick]`))
    if (withSound) audio().datum()
    const n = ticks.length
    const fromIdx = Math.round(from * (n - 1))
    gsap.fromTo(
      ticks,
      { scale: 1 },
      {
        scale: 2.6,
        duration: 0.15,
        ease: 'quart.out',
        yoyo: true,
        repeat: 1,
        stagger: { each: 0.012, from: fromIdx },
        transformOrigin: '50% 50%',
        onComplete: () => void (busy.current[i] = false),
      },
    )
    if (depth > 0) {
      const line = lines[i]!
      line.links.slice(0, depth === 2 ? 2 : 1).forEach((j) => {
        gsap.delayedCall(0.28, () => ripple(j, 0.5, depth - 1, false))
      })
    }
  }

  if (!lines.length) return <svg ref={svg} className={s.datum} aria-hidden="true" />

  return (
    <svg ref={svg} className={s.datum} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {lines.map((l, i) => {
        const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1)
        const ux = (l.x2 - l.x1) / len
        const uy = (l.y2 - l.y1) / len
        const nx = -uy
        const ny = ux
        const count = Math.floor(len / 22)
        return (
          <g key={i} data-line={i}>
            <line data-draw="" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={s.datumLine} />
            {Array.from({ length: count + 1 }, (_, k) => {
              const t = (k * 22) / len
              const px = l.x1 + (l.x2 - l.x1) * t
              const py = l.y1 + (l.y2 - l.y1) * t
              const L = k % 5 === 0 ? 6 : 3
              return <line key={k} data-tick="" x1={px} y1={py} x2={px + nx * L} y2={py + ny * L} className={s.datumTick} style={{ transformBox: 'fill-box' }} />
            })}
            <text data-label="" x={uy !== 0 ? l.x1 + 10 : l.x2} y={uy !== 0 ? l.y2 - 6 : l.y1 - 10} textAnchor={uy !== 0 ? 'start' : 'end'} className={s.datumLabel}>
              {l.label}
            </text>
            <line
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              className={s.datumHit}
              onPointerEnter={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                const px = e.clientX - r.left
                const py = e.clientY - r.top
                const t = ((px - l.x1) * ux + (py - l.y1) * uy) / len
                ripple(i, Math.max(0, Math.min(1, t)), Math.random() > 0.5 ? 2 : 1, true)
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}
