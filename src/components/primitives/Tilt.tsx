'use client'
import { useEffect, useRef, type ReactNode } from 'react'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { damp } from '@/lib/motion/tokens'
import s from './primitives.module.css'

/**
 * §10.7 3D tilt — ±7°, lerp 0.14. Physics are entirely shadow: the shadow
 * offset counter-moves against the tilt (card edge nearest the light lifts,
 * its shadow falls away) and the top inset highlight brightens/dims.
 * The frame subscription only does work while hovered or settling.
 */
export function TiltCard({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { coarse, reducedMotion } = useUI.getState()
    if (coarse || reducedMotion) return
    let tx = 0, ty = 0, x = 0, y = 0
    let active = false
    let hovering = false
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      tx = ((e.clientX - r.left) / r.width) * 2 - 1
      ty = ((e.clientY - r.top) / r.height) * 2 - 1
    }
    const onEnter = () => {
      hovering = true
      active = true
      el.style.willChange = 'transform'
    }
    const onLeave = () => {
      hovering = false
      tx = 0
      ty = 0
    }
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    const off = onFrame((f) => {
      if (!active) return
      const k = damp(0.14, f.dt)
      x += (tx - x) * k
      y += (ty - y) * k
      el.style.setProperty('--ry', `${(x * max).toFixed(3)}deg`)
      el.style.setProperty('--rx', `${(-y * max).toFixed(3)}deg`)
      el.style.setProperty('--sx', `${(-x * 10).toFixed(2)}px`)
      el.style.setProperty('--sy', `${(-y * 8).toFixed(2)}px`)
      el.style.setProperty('--hl', `${(0.85 - y * 0.35).toFixed(3)}`)
      el.style.setProperty('--hx', `${(50 + x * 40).toFixed(1)}%`)
      if (!hovering && Math.abs(x) < 0.001 && Math.abs(y) < 0.001) {
        active = false
        el.style.willChange = ''
      }
    })
    return () => {
      off()
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [max])
  return (
    <div ref={ref} className={`${s.tilt} ${className ?? ''}`}>
      {children}
    </div>
  )
}
