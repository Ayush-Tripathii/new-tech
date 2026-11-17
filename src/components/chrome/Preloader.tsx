'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { useUI } from '@/lib/motion/store'
import { allAssets, isSceneWarmExpected, onAssetProgress, registerAsset, sceneWarm } from '@/lib/motion/assets'
import { brand } from '@/lib/content'
import s from './Preloader.module.css'

const KEY = 'gbg:calibrated'
const BELTS = 12
const SQ = 220 // square side (px, viewBox units)

/**
 * §7 "Calibration" — a machine calibrating, not a loading screen.
 * Beats are positioned on one timeline; the timeline PAUSES before Beat 5
 * until real assets resolve (reel 3 never shows 100 early), with a hard 5s
 * ceiling after which it force-completes.
 */
export function Preloader() {
  const root = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'full' | 'return' | 'done'>('full')

  useEffect(() => {
    // Critical assets: fonts + noise + hero scene warm-up
    registerAsset(document.fonts?.ready ?? Promise.resolve())
    registerAsset(
      new Promise<void>((res) => {
        const i = new Image()
        i.onload = i.onerror = () => res()
        i.src = '/noise.png'
      }),
    )
    if (isSceneWarmExpected()) registerAsset(Promise.race([sceneWarm, new Promise<void>((r) => setTimeout(r, 4500))]))

    let visited = false
    try {
      visited = sessionStorage.getItem(KEY) === '1'
    } catch {
      /* noop */
    }
    const reduced = useUI.getState().reducedMotion
    const el = root.current
    if (!el) return
    const finish = () => {
      try {
        sessionStorage.setItem(KEY, '1')
      } catch {
        /* noop */
      }
      useUI.getState().set({ preloaderDone: true })
      setMode('done')
    }

    if (visited || reduced) {
      setMode('return')
      const tw = gsap.to(el, { opacity: 0, duration: 0.4, ease: 'quart.out', delay: 0.05, onComplete: finish })
      return () => void tw.kill()
    }

    const q = gsap.utils.selector(el)
    const cross = q('[data-cross]')
    const square = q('[data-square]')[0] as SVGRectElement | undefined
    const ticks = q('[data-tick]')
    const reels = q('[data-reel]') as HTMLElement[]
    const chars = q('[data-char]')
    const frameG = q('[data-frame]')
    const sil = q('[data-sil]')
    const shadow = q('[data-shadow]')
    const belts = q('[data-belt]')
    const content = q('[data-content]')

    const len = SQ * 4
    gsap.set(square ?? [], { strokeDasharray: len, strokeDashoffset: len })

    const setReel = (reel: HTMLElement, v: number) => {
      const n = Math.round(v)
      reel.textContent = String(n).padStart(3, '0')
    }
    const r1 = { v: 0 }, r2 = { v: 0 }, r3 = { v: 0 }
    let real = 0
    const offProg = onAssetProgress((p) => (real = p))

    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
    // Beat 1 — crosshairs fly in from the edges
    tl.fromTo(
      cross,
      { x: (i: number) => [-1, 1, -1, 1][i]! * window.innerWidth * 0.5, y: (i: number) => [-1, -1, 1, 1][i]! * window.innerHeight * 0.5, opacity: 0 },
      { x: 0, y: 0, opacity: 1, duration: 0.35, stagger: 0.05 },
      0,
    )
    // Beat 2 — hairline square draws, tick marks appear like a rule
    tl.to(square ?? [], { strokeDashoffset: 0, duration: 0.65, ease: 'power2.inOut' }, 0.25)
    tl.fromTo(ticks, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, stagger: { each: 0.008, from: 'start' } }, 0.3)
    // Beat 3 — reels. 1–2 timed, 3 driven by real progress (capped until resolved)
    tl.to(r1, { v: 100, duration: 1.2, ease: 'power2.inOut', onUpdate: () => setReel(reels[0]!, r1.v) }, 0.4)
    tl.to(r2, { v: 100, duration: 1.55, ease: 'power3.inOut', onUpdate: () => setReel(reels[1]!, r2.v) }, 0.45)
    const reel3 = gsap.ticker.add(() => {
      const target = Math.min(real * 100, 99) // never 100 before assets resolve
      r3.v += (target - r3.v) * 0.12
      setReel(reels[2]!, r3.v)
    })
    // Beat 4 — tagline char-by-char
    tl.fromTo(
      chars,
      { yPercent: 110, opacity: 0, filter: 'blur(6px)' },
      { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8, stagger: 0.012 },
      1.2,
    )
    // Gate before Beat 5 — continue immediately if assets already resolved
    let loaded = false
    tl.addPause(2.1, () => {
      if (loaded) gsap.delayedCall(0, () => resume())
    })
    // Beat 5 — square collapses into the Armature silhouette; shadow blooms
    tl.to(frameG, { scale: 0.18, rotate: 90, duration: 0.35, ease: 'quint.inOut', transformOrigin: '50% 50%' }, 2.1)
    tl.to(content, { opacity: 0, duration: 0.25, ease: 'quart.out' }, 2.1)
    tl.fromTo(sil, { scale: 0.4, opacity: 0, rotate: -90 }, { scale: 1, opacity: 1, rotate: 0, duration: 0.45, ease: 'back.out(1.4)' }, 2.25)
    tl.fromTo(shadow, { scaleX: 0.2, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.4, ease: 'expo.out' }, 2.38)
    // Beat 6 — twelve paper belts lift off upward
    tl.to(sil, { opacity: 0, y: -20, duration: 0.3, ease: 'quart.in' }, 2.6)
    tl.to(shadow, { opacity: 0, duration: 0.3 }, 2.6)
    // elevation appears only as the sheets lift — static belts must read as one page
    tl.set(el, { attr: { 'data-lifting': '1' } }, 2.55)
    tl.to(belts, { scaleY: 0, duration: 0.6, ease: 'quint.inOut', stagger: 0.035, transformOrigin: '50% 0%' }, 2.6)
    tl.call(finish, [], 3.0) // fire PRELOADER_COMPLETE as belts clear the hero centre
    tl.set(el, { display: 'none' })

    let resumed = false
    function resume() {
      if (resumed) return
      resumed = true
      gsap.ticker.remove(reel3)
      setReel(reels[2]!, 100)
      tl.resume()
    }
    // Hard ceiling: 5s total, then force-complete.
    const hardStop = setTimeout(() => {
      loaded = true
      resume()
    }, 5000)
    allAssets(4800).then(() => {
      gsap.ticker.remove(reel3)
      // let reel 3 visibly arrive at 100 — only now that assets are real
      gsap.to(r3, {
        v: 100,
        duration: 0.25,
        onUpdate: () => setReel(reels[2]!, r3.v),
        onComplete: () => {
          loaded = true
          if (tl.paused()) resume()
        },
      })
    })

    return () => {
      clearTimeout(hardStop)
      gsap.ticker.remove(reel3)
      offProg()
      tl.kill()
    }
  }, [])

  if (mode === 'done') return null

  const tagline = brand.tagline
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = []
  const n = 10
  for (let i = 1; i < n; i++) {
    const t = (i / n) * SQ
    const L = i % 5 === 0 ? 9 : 5
    ticks.push({ x1: t, y1: 0, x2: t, y2: L }, { x1: t, y1: SQ, x2: t, y2: SQ - L }, { x1: 0, y1: t, x2: L, y2: t }, { x1: SQ, y1: t, x2: SQ - L, y2: t })
  }

  return (
    <div ref={root} className={s.root} data-mode={mode} aria-hidden="true">
      <div className={s.belts}>
        {Array.from({ length: BELTS }, (_, i) => (
          <div key={i} className={s.belt} data-belt="" />
        ))}
      </div>
      {mode === 'full' && (
        <div className={s.stage}>
          <div className={s.frameWrap} data-frame="">
            <svg className={s.square} viewBox={`-30 -30 ${SQ + 60} ${SQ + 60}`}>
              {/* crosshairs at the four corners */}
              {[
                [0, 0],
                [SQ, 0],
                [0, SQ],
                [SQ, SQ],
              ].map(([x, y], i) => (
                <g key={i} transform={`translate(${x} ${y})`}>
                  {/* inner group is animated — GSAP x/y would otherwise overwrite the translate */}
                  <g data-cross="">
                    <path d="M-16 0H16M0 -16V16" stroke="var(--ink)" strokeWidth="0.9" />
                    <circle r="5" fill="none" stroke="var(--ink)" strokeWidth="0.9" />
                  </g>
                </g>
              ))}
              <rect data-square="" x="0" y="0" width={SQ} height={SQ} fill="none" stroke="var(--ink)" strokeWidth="0.8" />
              {ticks.map((t, i) => (
                <line key={i} data-tick="" {...t} stroke="var(--ink)" strokeWidth="0.7" style={{ transformOrigin: `${t.x1}px ${t.y1}px`, transformBox: 'view-box' }} />
              ))}
            </svg>
          </div>
          <div className={s.content} data-content="">
            <div className={`${s.reels} label`}>
              <span>
                <i>X</i>
                <b data-reel="">000</b>
              </span>
              <span>
                <i>Y</i>
                <b data-reel="">000</b>
              </span>
              <span>
                <i>LOAD</i>
                <b data-reel="">000</b>
              </span>
            </div>
            <p className={s.tagline}>
              {Array.from(tagline).map((c, i) => (
                <span key={i} data-char="">
                  {c === ' ' ? ' ' : c}
                </span>
              ))}
            </p>
          </div>
          <div className={s.sil} data-sil="">
            <svg viewBox="-60 -60 120 120">
              <defs>
                <radialGradient id="pre-ball" cx="35%" cy="30%" r="75%">
                  <stop offset="0" stopColor="#FBF9F5" />
                  <stop offset="0.6" stopColor="#E3DED4" />
                  <stop offset="1" stopColor="#B9B3A8" />
                </radialGradient>
              </defs>
              <ellipse rx="50" ry="14" fill="none" stroke="#7d828b" strokeWidth="1.4" transform="rotate(-18)" />
              <circle r="30" fill="url(#pre-ball)" />
              <path d="M-30 0H30M0 -30V30M-21 -21 21 21M-21 21 21 -21" stroke="hsl(218 25% 20% / .22)" strokeWidth="0.8" />
              <ellipse rx="44" ry="10" fill="none" stroke="#9aa0a8" strokeWidth="1.2" transform="rotate(58)" />
            </svg>
          </div>
          <div className={s.shadow} data-shadow="" />
        </div>
      )}
    </div>
  )
}
