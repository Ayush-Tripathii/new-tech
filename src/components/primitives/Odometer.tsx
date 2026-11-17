'use client'
import { useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { useRevealOnce } from './reveal'
import s from './primitives.module.css'

/**
 * §10.10 Split-flap / odometer. Digits roll through two full reels and land on
 * the target; translateY is snapped to whole digits so the motion is stepped
 * (mechanical) rather than smooth. Non-digit glyphs (".", "K", "+") are static.
 * Fires once at 70% viewport.
 */
export function Odometer({ value, className, start = 'top 70%', delay = 0 }: { value: string; className?: string; start?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useRevealOnce(
    ref,
    (el, reduced) => {
      const reels = el.querySelectorAll<HTMLElement>('[data-reel]')
      reels.forEach((reel, i) => {
        const d = Number(reel.dataset.reel)
        const target = 10 + d // land in the second reel
        if (reduced) {
          gsap.set(reel, { yPercent: (-100 * target) / 20 })
          return
        }
        const proxy = { v: 0 }
        gsap.to(proxy, {
          v: target,
          duration: 1.4 + i * 0.12,
          delay: delay + i * 0.035,
          ease: 'expo.out',
          onUpdate: () => {
            const step = Math.round(proxy.v) // stepped
            reel.style.transform = `translateY(${-step}em)`
          },
        })
      })
    },
    { start },
  )
  return (
    <span ref={ref} className={`${s.odo} ${className ?? ''}`} aria-label={value} role="img">
      {Array.from(value).map((c, i) =>
        /\d/.test(c) ? (
          <span key={i} className={s.odoCol} aria-hidden="true">
            <span className={s.odoReel} data-reel={c}>
              {Array.from({ length: 20 }, (_, n) => (
                <span key={n}>{n % 10}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className={s.odoStatic} aria-hidden="true">
            {c}
          </span>
        ),
      )}
    </span>
  )
}
