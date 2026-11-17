'use client'
import { createElement, useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { gsap, SplitText } from '@/lib/gsap'
import { useUI } from '@/lib/motion/store'
import { DUR, STAGGER } from '@/lib/motion/tokens'
import { useRevealOnce } from './reveal'
import s from './primitives.module.css'

/* --------------------------------------------------------------------------
   SplitHeadline — chars within lines. y 110%→0, blur 8→0, stagger 0.012,
   0.9s expo.out. Container height is locked via getBoundingClientRect()
   BEFORE SplitText runs so nothing below jumps.
   -------------------------------------------------------------------------- */
interface SplitProps {
  as?: ElementType
  children: ReactNode
  className?: string
  /** CustomEvent name dispatched on window when the reveal completes */
  doneEvent?: string
  delay?: number
  immediate?: boolean
  id?: string
}

export function SplitHeadline({ as = 'h1', children, className, doneEvent, delay = 0, immediate = true, id }: SplitProps) {
  const ref = useRef<HTMLElement>(null)
  useRevealOnce(
    ref,
    (el, reduced) => {
      const done = () => {
        if (doneEvent) window.dispatchEvent(new CustomEvent(doneEvent))
      }
      if (reduced) {
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, onComplete: done })
        return
      }
      const h = el.getBoundingClientRect().height
      el.style.height = `${h}px`
      const split = SplitText.create(el, {
        type: 'lines,chars',
        linesClass: 'split-line',
        charsClass: 'split-char',
        mask: 'lines',
        aria: 'auto',
      })
      gsap.set(el, { opacity: 1 })
      const tw = gsap.fromTo(
        split.chars,
        { yPercent: 110, opacity: 0, filter: 'blur(8px)' },
        {
          yPercent: 0,
          opacity: 1,
          filter: 'blur(0px)',
          duration: DUR.slow,
          ease: 'expo.out',
          stagger: STAGGER.chars,
          delay,
          onComplete: () => {
            gsap.set(split.chars, { clearProps: 'filter' })
            el.style.height = ''
            done()
          },
        },
      )
      return () => {
        tw.kill()
        split.revert()
      }
    },
    { immediate, start: 'top 85%' },
  )
  return createElement(as, { ref, className: `${s.splitHost} ${className ?? ''}`, style: { opacity: 0 }, id }, children)
}

/* --------------------------------------------------------------------------
   LineReveal — each line in its own overflow-clipped mask, y 100%→0, 0.08.
   -------------------------------------------------------------------------- */
export function LineReveal({ as = 'p', children, className, start = 'top 82%' }: { as?: ElementType; children: ReactNode; className?: string; start?: string }) {
  const ref = useRef<HTMLElement>(null)
  useRevealOnce(
    ref,
    (el, reduced) => {
      if (reduced) {
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 })
        return
      }
      const split = SplitText.create(el, { type: 'lines', linesClass: 'split-line', mask: 'lines', aria: 'auto' })
      gsap.set(el, { opacity: 1 })
      const tw = gsap.fromTo(
        split.lines,
        { yPercent: 100 },
        { yPercent: 0, duration: DUR.slow, ease: 'expo.out', stagger: STAGGER.lines, onComplete: () => split.revert() },
      )
      return () => {
        tw.kill()
        split.revert()
      }
    },
    { start },
  )
  return createElement(as, { ref, className: `${s.splitHost} ${className ?? ''}`, style: { opacity: 0 } }, children)
}

/* --------------------------------------------------------------------------
   BlurTextReveal — THE reusable primitive. Cycles through `words` on an
   interval (rotating verb), or reveals a single string once (eyebrows, hints).
   Chars: blur 6→0, y 60%→0, stagger 0.012.
   -------------------------------------------------------------------------- */
interface BlurProps {
  words: string[]
  interval?: number
  className?: string
  /** reveal on scroll-in rather than immediately once ready */
  onScroll?: boolean
  as?: ElementType
}

export function BlurTextReveal({ words, interval = 2.4, className, onScroll = true, as = 'span' }: BlurProps) {
  // Motion is CSS keyframes keyed off data attributes: freshly keyed spans
  // animate themselves on mount, so there is no tween/commit race.
  const ref = useRef<HTMLElement>(null)
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '')

  useRevealOnce(ref, () => setShown(true), { immediate: !onScroll })

  useEffect(() => {
    if (words.length < 2 || !shown) return
    let t: number | undefined
    const id = window.setInterval(() => {
      if (document.hidden) return
      const word = words[index] ?? ''
      const outMs = useUI.getState().reducedMotion ? 0 : DUR.fast * 1000 + word.length * STAGGER.chars * 1000
      setLeaving(true)
      t = window.setTimeout(() => {
        setLeaving(false)
        setIndex((i) => (i + 1) % words.length)
      }, outMs)
    }, interval * 1000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(t)
    }
  }, [words, interval, shown, index])

  const word = words[index] ?? ''
  return createElement(
    as,
    {
      ref,
      className: `${s.blurText} ${className ?? ''}`,
      'data-shown': shown ? '' : undefined,
      'data-leaving': leaving ? '' : undefined,
      'aria-live': words.length > 1 ? 'off' : undefined,
    },
    <>
      {/* width reservation: longest word, invisible */}
      <span aria-hidden="true" style={{ visibility: 'hidden' }}>
        {longest}
      </span>
      <span data-active="" key={index} aria-label={word}>
        {Array.from(word).map((c, i) => (
          <span key={i} className={s.ch} aria-hidden="true" style={{ ['--i' as string]: i }}>
            {c === ' ' ? ' ' : c}
          </span>
        ))}
      </span>
    </>,
  )
}

/* --------------------------------------------------------------------------
   ImageReveal — clip-path inset 100%→0 with 1.1→1 scale counter-move.
   -------------------------------------------------------------------------- */
export function ImageReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useRevealOnce(ref, (el, reduced) => {
    const inner = el.firstElementChild
    if (reduced) {
      gsap.set(el, { clipPath: 'inset(0% 0 0 0)' })
      return
    }
    const tl = gsap.timeline()
    tl.to(el, { clipPath: 'inset(0% 0 0 0)', duration: DUR.cine, ease: 'expo.inOut' }, 0)
    if (inner) tl.fromTo(inner, { scale: 1.1 }, { scale: 1, duration: DUR.cine + 0.4, ease: 'expo.out' }, 0)
    return () => tl.kill()
  })
  return (
    <div ref={ref} className={`${s.imgReveal} ${className ?? ''}`}>
      {children}
    </div>
  )
}

/** Simple fade-up for blocks (cards stagger). */
export function FadeUp({ children, className, stagger = STAGGER.cards, selector }: { children: ReactNode; className?: string; stagger?: number; selector?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useRevealOnce(ref, (el, reduced) => {
    const items = selector ? el.querySelectorAll(selector) : [el]
    if (reduced) {
      gsap.set(items, { opacity: 1 })
      return
    }
    gsap.fromTo(items, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: DUR.slow, ease: 'expo.out', stagger, clearProps: 'transform' })
  })
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
