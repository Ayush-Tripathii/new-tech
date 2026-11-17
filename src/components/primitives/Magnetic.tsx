'use client'
import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { damp } from '@/lib/motion/tokens'
import { audio } from '@/lib/audio/AudioManager'
import { TLink } from '@/components/providers/TransitionProvider'
import { RollingText, Arrow } from './RollingText'
import s from './primitives.module.css'

interface Props {
  children: string
  href?: string
  onClick?: () => void
  variant?: 'solid' | 'raised' | 'ghost'
  arrow?: boolean
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
}

/**
 * §10.2 Magnetic button. Pulls toward the pointer at 0.35 strength within a
 * 1.5× bounding radius (lerp 0.15), snaps back with the seat ease. Its shadow
 * offsets opposite to the movement via --mx/--my. Only tracks while on screen.
 */
export function MagneticButton({ children, href, onClick, variant = 'solid', arrow = true, type = 'button', className, disabled }: Props) {
  const wrap = useRef<HTMLSpanElement>(null)
  const el = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const host = wrap.current
    const btn = el.current
    if (!host || !btn) return
    if (useUI.getState().coarse || useUI.getState().reducedMotion) return
    let visible = false
    let inside = false
    let x = 0, y = 0
    let tx = 0, ty = 0
    let returning: gsap.core.Tween | null = null
    const proxy = { x: 0, y: 0 }
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting))
    io.observe(host)

    const apply = (px: number, py: number) => {
      btn.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0)`
      btn.style.setProperty('--mx', `${px.toFixed(2)}px`)
      btn.style.setProperty('--my', `${py.toFixed(2)}px`)
    }

    const off = onFrame((f) => {
      if (!visible) return
      const r = host.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = f.pointer.x - cx
      const dy = f.pointer.y - cy
      const rx = r.width * 0.75 // 1.5× bounding radius
      const ry = r.height * 0.75 + 24
      const within = Math.abs(dx) < rx + 20 && Math.abs(dy) < ry + 20
      if (within) {
        if (!inside) {
          inside = true
          returning?.kill()
          x = proxy.x
          y = proxy.y
          btn.style.willChange = 'transform'
        }
        tx = dx * 0.35
        ty = dy * 0.35
        const k = damp(0.15, f.dt)
        x += (tx - x) * k
        y += (ty - y) * k
        proxy.x = x
        proxy.y = y
        apply(x, y)
      } else if (inside) {
        inside = false
        returning = gsap.to(proxy, {
          x: 0,
          y: 0,
          duration: 0.6,
          ease: 'back.out(1.4)',
          onUpdate: () => apply(proxy.x, proxy.y),
          onComplete: () => {
            btn.style.willChange = ''
          },
        })
      }
    }, 60)
    return () => {
      off()
      io.disconnect()
      returning?.kill()
    }
  }, [])

  const cls = `${s.magnetic} ${s[variant]} ${className ?? ''}`
  const inner = (
    <span className={s.magneticInner}>
      <RollingText>{children}</RollingText>
      {arrow && <Arrow />}
    </span>
  )
  const handleClick = () => {
    audio().click()
    onClick?.()
  }

  return (
    <span ref={wrap} style={{ display: 'inline-block' }}>
      {href ? (
        <TLink href={href} ref={(n) => void (el.current = n)} className={cls} data-cursor="link" onClick={handleClick}>
          {inner}
        </TLink>
      ) : (
        <button ref={(n) => void (el.current = n)} className={cls} type={type} onClick={handleClick} data-cursor="link" disabled={disabled}>
          {inner}
        </button>
      )}
    </span>
  )
}
