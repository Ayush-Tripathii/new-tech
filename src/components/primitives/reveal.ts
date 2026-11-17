'use client'
import { useEffect, type RefObject } from 'react'
import { ScrollTrigger } from '@/lib/gsap'
import { useUI, whenReady } from '@/lib/motion/store'

/**
 * Run `play` once, when (a) the page gate is open (preloader + transition
 * complete) and (b) the element enters the viewport at `start`.
 * Returns nothing; cleans up its ScrollTrigger on unmount.
 */
export function useRevealOnce(
  ref: RefObject<HTMLElement | null>,
  play: (el: HTMLElement, reduced: boolean) => (() => void) | void,
  opts: { start?: string; immediate?: boolean } = {},
) {
  const { start = 'top 85%', immediate = false } = opts
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let st: ScrollTrigger | null = null
    let cleanup: (() => void) | void
    whenReady().then(() => {
      if (cancelled) return
      const reduced = useUI.getState().reducedMotion
      if (immediate) {
        cleanup = play(el, reduced)
        return
      }
      st = ScrollTrigger.create({
        trigger: el,
        start,
        once: true,
        onEnter: () => {
          cleanup = play(el, reduced)
        },
      })
    })
    return () => {
      cancelled = true
      st?.kill()
      if (typeof cleanup === 'function') cleanup()
    }
    // play intentionally excluded: reveal is defined once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, start, immediate])
}
