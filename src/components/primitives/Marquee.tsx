'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import s from './primitives.module.css'

/**
 * §10.9 Marquee — DOM-duplicated for a seamless loop. Base speed modulated by
 * scroll velocity; direction follows scroll direction. Reads the shared frame
 * state — no scroll listener of its own. Pauses offscreen.
 */
export function Marquee({ children, speed = 40, className, reverse = false }: { children: ReactNode; speed?: number; className?: string; reverse?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    const tr = track.current
    if (!el || !tr) return
    let visible = false
    let x = 0
    let width = 0
    let dir = reverse ? -1 : 1
    const measure = () => {
      width = (tr.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(tr)
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting))
    io.observe(el)
    const off = onFrame((f) => {
      if (!visible || width === 0 || useUI.getState().reducedMotion) return
      const v = f.scroll.velocity
      if (Math.abs(v) > 30) dir = (v > 0 ? 1 : -1) * (reverse ? -1 : 1)
      const boost = 1 + Math.min(Math.abs(v) / 180, 7)
      x -= speed * boost * dir * f.dt
      if (x <= -width) x += width
      if (x > 0) x -= width
      tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`
    })
    return () => {
      off()
      ro.disconnect()
      io.disconnect()
    }
  }, [speed, reverse])
  return (
    <div ref={root} className={`${s.marquee} ${className ?? ''}`}>
      <div ref={track} className={s.marqueeTrack}>
        <div className={s.marqueeTrack}>{children}</div>
        <div className={s.marqueeTrack} aria-hidden="true">
          {children}
        </div>
        <div className={s.marqueeTrack} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  )
}
