'use client'
import { useEffect, type ReactNode } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { frame, dispatchFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { hasWebGL, isCoarse, prefersReducedMotion } from '@/lib/env'
import { clamp } from '@/lib/motion/tokens'

let lenis: Lenis | null = null
export const getLenis = () => lenis

/** WebGL scenes increment this while rendering so the FPS ladder only judges GL load. */
let glActive = 0
export const glBegin = () => {
  glActive++
  return () => {
    glActive = Math.max(0, glActive - 1)
  }
}

/**
 * The one ticker. The one scroll source. Everything downstream reads `frame`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = prefersReducedMotion()
    const coarse = isCoarse()
    useUI.getState().set({ reducedMotion: reduced, coarse, webgl: hasWebGL() })

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => useUI.getState().set({ reducedMotion: mq.matches })
    mq.addEventListener('change', onMq)

    // ---- Lenis — exactly as specified (§4) -------------------------------
    lenis = new Lenis({ lerp: 0.085, smoothWheel: !reduced, wheelMultiplier: 1, syncTouch: false })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (t: number) => lenis?.raf(t * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    // Scroll stays locked until the preloader hands over.
    if (!useUI.getState().preloaderDone) lenis.stop()
    const unsubPre = useUI.subscribe((st, prev) => {
      if (st.preloaderDone && !prev.preloaderDone) lenis?.start()
    })

    // ---- Pointer: one listener set, written into shared frame -------------
    const onMove = (e: PointerEvent) => {
      const p = frame.pointer
      p.x = e.clientX
      p.y = e.clientY
      p.nx = (e.clientX / window.innerWidth) * 2 - 1
      p.ny = -((e.clientY / window.innerHeight) * 2 - 1)
      p.lastMove = frame.time
      if (!p.active) {
        p.active = true
        p.sx = p.x
        p.sy = p.y
      }
    }
    const onDown = () => (frame.pointer.down = true)
    const onUp = () => (frame.pointer.down = false)
    const onLeave = () => (frame.pointer.active = false)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    const onResize = () => {
      frame.viewport.w = window.innerWidth
      frame.viewport.h = window.innerHeight
      frame.viewport.dpr = window.devicePixelRatio || 1
    }
    onResize()
    window.addEventListener('resize', onResize, { passive: true })

    // ---- FPS ladder: rolling 60-frame average ------------------------------
    const samples = new Float32Array(60)
    let si = 0
    let filled = 0
    let lowFor = 0
    let cooldown = 0

    let lastY = window.scrollY
    const tick = (time: number, deltaMs: number) => {
      const dt = clamp(deltaMs / 1000, 1 / 240, 0.1)
      frame.time = time
      frame.dt = dt
      frame.frame++

      // scroll — read from Lenis (or native), velocity smoothed
      const y = lenis ? lenis.scroll : window.scrollY
      const v = (y - lastY) / dt
      lastY = y
      const s = frame.scroll
      s.velocity += (v - s.velocity) * 0.18
      if (Math.abs(v) > 2) s.direction = v > 0 ? 1 : -1
      s.y = y
      s.limit = lenis ? lenis.limit : document.documentElement.scrollHeight - window.innerHeight
      s.progress = s.limit > 0 ? y / s.limit : 0

      // pointer smoothing
      const p = frame.pointer
      p.sx += (p.x - p.sx) * 0.18
      p.sy += (p.y - p.sy) * 0.18

      // load sources — combined with Math.max (§5.4)
      const L = frame.load
      L.scroll = clamp(Math.abs(s.velocity) / 3000)
      L.idle = 0.08 + 0.04 * Math.sin(time * 0.8)
      L.hover *= 0.92
      L.value = Math.max(L.scroll, L.hover, L.press, L.idle)

      // fps
      const inst = 1 / dt
      samples[si] = inst
      si = (si + 1) % 60
      filled = Math.min(60, filled + 1)
      let sum = 0
      for (let i = 0; i < filled; i++) sum += samples[i]!
      frame.fps = sum / filled
      if (cooldown > 0) cooldown -= dt
      if (glActive > 0 && filled === 60 && !document.hidden && cooldown <= 0) {
        lowFor = frame.fps < 50 ? lowFor + dt : 0
        if (lowFor > 2) {
          useUI.getState().degrade()
          lowFor = 0
          cooldown = 3 // let the new level settle before judging again
          filled = 0
        }
      }

      dispatchFrame()
    }
    gsap.ticker.add(tick)

    const onVis = () => {
      filled = 0
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      unsubPre()
      gsap.ticker.remove(raf)
      gsap.ticker.remove(tick)
      lenis?.destroy()
      lenis = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
      mq.removeEventListener('change', onMq)
    }
  }, [])

  return <>{children}</>
}
