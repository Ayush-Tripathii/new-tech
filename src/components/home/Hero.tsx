'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { frame, onFrame } from '@/lib/motion/frame'
import { useUI, whenReady } from '@/lib/motion/store'
import { expectSceneWarm, markSceneWarm } from '@/lib/motion/assets'
import { hasWebGL, isMobile, maxDPR } from '@/lib/env'
import { SceneSlot } from '@/webgl/contexts'
import { glBegin } from '@/components/providers/MotionProvider'
import { audio } from '@/lib/audio/AudioManager'
import { brand } from '@/lib/content'
import { clamp } from '@/lib/motion/tokens'
import { SplitHeadline, BlurTextReveal } from '@/components/primitives/TextReveal'
import { MagneticButton } from '@/components/primitives/Magnetic'
import { DatumLines } from './DatumLines'
import type { ArmatureScene } from '@/webgl/armature/ArmatureScene'
import s from './Hero.module.css'

export function Hero({ mode = 'hero' }: { mode?: 'hero' | 'error' }) {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const host = canvas.current
    const sec = section.current
    const st = stage.current
    if (!host || !sec || !st) return
    expectSceneWarm()
    if (!hasWebGL()) {
      setFallback(true)
      markSceneWarm()
      return
    }
    const reduced = useUI.getState().reducedMotion
    let endGL: (() => void) | null = null
    let firstWarm = true

    // The scene only exists while the hero is near the viewport; its context
    // slot is handed on to scenes further down the page (max 2 concurrent).
    const slot = new SceneSlot<ArmatureScene>(async () => {
      const { ArmatureScene } = await import('@/webgl/armature/ArmatureScene')
      const canvas = document.createElement('canvas')
      canvas.className = s.canvasEl ?? ''
      host.appendChild(canvas)
      const sc = new ArmatureScene({ canvas, mode, dpr: maxDPR(), mobile: isMobile(), quality: useUI.getState().quality })
      sc.setEvents({
        onDisperse: () => {
          audio().humStop()
          audio().release()
          useUI.getState().set({ cursor: 'default' })
          frame.load.press = 0
        },
        onSeat: (_i, strength) => audio().seat(0.4 + strength * 0.6),
      })
      await sc.warm()
      const dispose = sc.dispose.bind(sc)
      sc.dispose = () => {
        dispose()
        canvas.remove()
      }
      return sc
    }, (sc) => {
      endGL?.()
      endGL = null
      if (!sc) return
      endGL = glBegin()
      renderedStatic = false
      if (firstWarm) {
        firstWarm = false
        markSceneWarm()
        setLive(true)
      }
    })

    const unsubQ = useUI.subscribe((stt, prev) => {
      if (stt.quality !== prev.quality) slot.scene?.setQuality(stt.quality)
    })
    const ro = new ResizeObserver(() => slot.scene?.resize())
    ro.observe(host)

    // ---- interaction (listeners live on the host, survive scene rebuilds) --
    let down = false
    let dragMode = false
    let sx = 0, sy = 0, lx = 0, ly = 0
    // Listen on the whole stage: datum-line hit areas (24px) cross the object
    // and must not swallow a hold. Only real controls opt out.
    const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('a, button, input, textarea, select')
    const onDown = (e: PointerEvent) => {
      const sc = slot.scene
      if (e.button !== 0 || !sc || isControl(e.target)) return
      down = true
      dragMode = false
      sx = lx = e.clientX
      sy = ly = e.clientY
      if (sc.pressDown()) {
        audio().humStart()
        useUI.getState().set({ cursor: 'hold', cursorLabel: 'HOLD' })
      }
    }
    const onMove = (e: PointerEvent) => {
      const sc = slot.scene
      if (!sc) return
      const r = host.getBoundingClientRect()
      const t = e.target as Node | null
      const inside = e.clientY >= r.top && e.clientY <= r.bottom && !!t && st.contains(t) && !isControl(t)
      sc.setPointer(e.clientX, e.clientY, inside)
      if (!down) return
      if (!dragMode && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
        dragMode = true
        sc.pressUp()
        audio().humStop()
        useUI.getState().set({ cursor: 'default' })
      }
      if (dragMode) sc.dragBy(e.clientX - lx, e.clientY - ly)
      lx = e.clientX
      ly = e.clientY
    }
    const onUp = () => {
      if (!down) return
      down = false
      slot.scene?.pressUp()
      slot.scene?.dragEnd()
      audio().humStop()
      if (useUI.getState().cursor === 'hold') useUI.getState().set({ cursor: 'default' })
    }
    st.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    // ---- the render loop is a subscriber on the ONE ticker ----------------
    let renderedStatic = false
    void slot.want(true)
    const off = onFrame((f) => {
      const vh = f.viewport.h
      // sticky elements report a scroll-shifted offsetTop — derive the static
      // position from the next sibling instead
      const next = sec.nextElementSibling as HTMLElement | null
      const top = next ? next.offsetTop - sec.offsetHeight : 0
      const p = clamp((f.scroll.y - top) / vh)
      // DOM scroll-out: scale to 0.94 as the next sheet slides over
      st.style.transform = p > 0 ? `scale(${(1 - 0.06 * p).toFixed(4)})` : ''
      // hysteresis: release beyond 1.8 viewports, rebuild inside 1.4
      const y = f.scroll.y - top
      if (y > vh * 1.8) void slot.want(false)
      else if (y < vh * 1.4) void slot.want(true)
      const sc = slot.scene
      const visible = y < vh * 1.02 && !document.hidden
      if (!sc || !visible) return
      if (reduced || sc.isStatic) {
        if (!renderedStatic) {
          sc.update(0)
          sc.render()
          renderedStatic = true
        }
        return
      }
      sc.setRecede(p)
      sc.update(f.dt)
      sc.render()
      f.load.press = sc.tension
      if (sc.tension > 0.01) audio().humUpdate(sc.tension)
    }, 80)

    return () => {
      off()
      unsubQ()
      ro.disconnect()
      st.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      audio().humStop()
      endGL?.()
      slot.dispose()
      frame.load.press = 0
    }
  }, [mode])

  // Entrance: canvas fades up from the paper once the gate opens
  useEffect(() => {
    let tw: gsap.core.Tween | null = null
    whenReady().then(() => {
      if (!canvas.current) return
      tw = gsap.fromTo(canvas.current, { opacity: 0, scale: 1.03 }, { opacity: 1, scale: 1, duration: 1.4, ease: 'expo.out' })
    })
    return () => void tw?.kill()
  }, [live])

  return (
    <section ref={section} className={s.hero} aria-labelledby="hero-title">
      <div ref={stage} className={s.stage}>
        {/* Layer A — WebGL (decorative) */}
        <div ref={canvas} className={s.canvas} aria-hidden="true" data-cursor="drag" data-cursor-label="DRAG · HOLD" />
        {fallback && <Poster />}
        <div className="dither-local" aria-hidden="true" />

        {/* Layer B — DOM */}
        <div className={s.layer}>
          {mode === 'hero' && <DatumLines />}
          <div className={`${s.copy} wrap`}>
            <p className={`${s.eyebrow} label`}>
              <span className={s.dot} aria-hidden="true" />
              <BlurTextReveal words={[`${brand.name} — Digital engineering studio`]} onScroll={false} />
            </p>
            {mode === 'hero' ? (
              <SplitHeadline as="h1" id="hero-title" className={`${s.title} display mega`} doneEvent="hero:revealed">
                Engineering
                <br />
                the Future.
              </SplitHeadline>
            ) : (
              <SplitHeadline as="h1" id="hero-title" className={`${s.title} display mega`}>
                Out of
                <br />
                tolerance.
              </SplitHeadline>
            )}
            <div className={s.foot}>
              <p className={s.lede}>
                {mode === 'hero'
                  ? 'We design and engineer unforgettable digital experiences — websites, software, apps, film and growth systems — machined to tolerance in Bhopal since 2020.'
                  : 'This page has been dispersed. Hold the armature to see what that means — then let us put you back on the right path.'}
              </p>
              <div className={s.ctas}>
                <MagneticButton href={mode === 'hero' ? '/work' : '/'}>{mode === 'hero' ? 'See the work' : 'Back to index'}</MagneticButton>
                {mode === 'hero' && (
                  <MagneticButton href="/#contact" variant="raised" arrow={false}>
                    Start a project
                  </MagneticButton>
                )}
              </div>
            </div>
          </div>
          <div className={`${s.cues} label`} aria-hidden="true">
            <span>
              <i>↧</i> Hold to disperse
            </span>
            {mode === 'hero' && (
              <span>
                <i>⟂</i> Touch the datum lines
              </span>
            )}
          </div>
          <div className={`${s.meta} label`} aria-hidden="true">
            <span>{brand.coords}</span>
            <span>Est. {brand.founded}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** No-WebGL fallback: a lit still (SVG) — same composition, no motion. */
function Poster() {
  return (
    <svg className={s.poster} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="p-ball" cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FBF9F5" />
          <stop offset="0.55" stopColor="#E4DFD5" />
          <stop offset="1" stopColor="#B7B1A6" />
        </radialGradient>
        <radialGradient id="p-sh" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="hsl(218 25% 20%)" stopOpacity="0.3" />
          <stop offset="1" stopColor="hsl(218 25% 20%)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="282" cy="236" rx="80" ry="14" fill="url(#p-sh)" />
      <circle cx="270" cy="150" r="58" fill="url(#p-ball)" />
      <ellipse cx="270" cy="150" rx="92" ry="26" fill="none" stroke="#8d939b" strokeWidth="1.6" transform="rotate(-20 270 150)" />
      <ellipse cx="270" cy="150" rx="84" ry="40" fill="none" stroke="#a7acb3" strokeWidth="1.2" transform="rotate(48 270 150)" />
    </svg>
  )
}
