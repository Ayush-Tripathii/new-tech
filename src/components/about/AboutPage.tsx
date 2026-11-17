'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap, Draggable } from '@/lib/gsap'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { brand, projects, team } from '@/lib/content'
import { drawProjectArt, dominantColor } from '@/lib/projectArt'
import { acquireContext } from '@/webgl/contexts'
import { hasWebGL, idle, maxDPR } from '@/lib/env'
import { damp } from '@/lib/motion/tokens'
import { audio } from '@/lib/audio/AudioManager'
import { SplitHeadline, LineReveal } from '@/components/primitives/TextReveal'
import { Odometer } from '@/components/primitives/Odometer'
import type { DepthPortrait } from '@/webgl/depth/DepthPortrait'
import s from './About.module.css'

const STRIPS = 8
const REVEAL_EVENT = 'about:hero-revealed'

/* --------------------------------------------------------------------------
   Depth portrait + paper curtain strips
   -------------------------------------------------------------------------- */
function Portrait() {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const strips = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState(false)

  // depth shader
  useEffect(() => {
    const c = cv.current
    if (!c || !hasWebGL()) return
    let dp: DepthPortrait | null = null
    let release: (() => void) | null = null
    let off: (() => void) | null = null
    let cancelled = false
    const cancelIdle = idle(async () => {
      const { drawDepthStill } = await import('@/lib/depthArt')
      const { image, depth } = drawDepthStill(800, 1000)
      release = await acquireContext()
      if (cancelled) return release()
      const { DepthPortrait } = await import('@/webgl/depth/DepthPortrait')
      if (cancelled) return release()
      dp = DepthPortrait.create(c, image, depth, Math.min(maxDPR(), 1.5))
      if (!dp) return
      const d = dp
      let mx = 0, my = 0, lastX = 9, lastY = 9
      const reduced = useUI.getState().reducedMotion
      d.render(0, 0)
      if (reduced) return
      off = onFrame((f) => {
        const r = c.getBoundingClientRect()
        if (r.bottom < 0 || r.top > f.viewport.h) return
        const tx = Math.max(-1, Math.min(1, ((f.pointer.x - r.left) / r.width) * 2 - 1))
        const ty = Math.max(-1, Math.min(1, ((f.pointer.y - r.top) / r.height) * 2 - 1))
        mx += (tx - mx) * damp(0.08, f.dt)
        my += (ty - my) * damp(0.08, f.dt)
        if (Math.abs(mx - lastX) + Math.abs(my - lastY) < 0.0005) return // on demand
        lastX = mx
        lastY = my
        d.render(mx, my)
      })
    })
    const ro = new ResizeObserver(() => {
      dp?.resize()
      dp?.render(0, 0)
    })
    ro.observe(c)
    return () => {
      cancelled = true
      cancelIdle()
      off?.()
      ro.disconnect()
      dp?.dispose()
      release?.()
    }
  }, [])

  // Gate: strips wake only after the hero headline reveal completes —
  // never two attention-demanding animations at once.
  useEffect(() => {
    const on = () => setArmed(true)
    window.addEventListener(REVEAL_EVENT, on)
    return () => window.removeEventListener(REVEAL_EVENT, on)
  }, [])

  // per-strip spring physics (stiffness 0.08, damping 0.86)
  useEffect(() => {
    if (!armed) return
    const host = strips.current
    const w = wrap.current
    if (!host || !w) return
    const els = Array.from(host.children) as HTMLElement[]
    const reduced = useUI.getState().reducedMotion
    const H = () => w.clientHeight
    const st = els.map(() => ({ y: 0, v: 0, target: 0, drag: false, grabY: 0, startY: 0, peeled: false }))
    // intro: a synchronized ripple of lifts teaches the interaction
    els.forEach((_, i) => {
      gsap.delayedCall(0.15 + i * 0.07, () => {
        st[i]!.v -= 14
        audio().paper(i)
      })
    })
    if (reduced) {
      els.forEach((e) => (e.style.transform = 'translateY(-101%)'))
      return
    }
    const down = (i: number) => (e: PointerEvent) => {
      const s0 = st[i]!
      s0.drag = true
      s0.grabY = e.clientY
      s0.startY = s0.y
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      audio().paper(i)
    }
    const move = (i: number) => (e: PointerEvent) => {
      const s0 = st[i]!
      if (!s0.drag) return
      s0.target = Math.min(0, s0.startY + (e.clientY - s0.grabY))
    }
    const up = (i: number) => () => {
      const s0 = st[i]!
      if (!s0.drag) return
      s0.drag = false
      const h = H()
      s0.peeled = s0.target < -h * 0.35
      s0.target = s0.peeled ? -h * 1.02 : 0
      audio().paper(i + 3)
    }
    const handlers = els.map((el, i) => {
      const d = down(i), m = move(i), u = up(i)
      el.addEventListener('pointerdown', d)
      el.addEventListener('pointermove', m)
      el.addEventListener('pointerup', u)
      el.addEventListener('pointercancel', u)
      return () => {
        el.removeEventListener('pointerdown', d)
        el.removeEventListener('pointermove', m)
        el.removeEventListener('pointerup', u)
        el.removeEventListener('pointercancel', u)
      }
    })
    let acc = 0
    const off = onFrame((f) => {
      const h = H()
      // fixed 60Hz substeps — explicit springs go unstable on long frames
      acc = Math.min(acc + f.dt, 0.1)
      let steps = 0
      while (acc >= 1 / 60) {
        acc -= 1 / 60
        steps++
      }
      for (let i = 0; i < els.length; i++) {
        const s0 = st[i]!
        for (let n = 0; n < steps; n++) {
          // v = v·damping + (target − y)·stiffness
          s0.v = s0.v * 0.86 + (s0.target - s0.y) * 0.08
          s0.y += s0.v
        }
        const lift = Math.min(1, -s0.y / (h * 0.5))
        const el = els[i]!
        el.style.transform = `translate3d(0,${s0.y.toFixed(1)}px,0) rotateX(${(lift * 8).toFixed(2)}deg)`
        // shadow deepens as the sheet lifts — the physicality IS the shadow
        el.style.setProperty('--lift', lift.toFixed(3))
      }
    })
    return () => {
      off()
      handlers.forEach((h) => h())
    }
  }, [armed])

  return (
    <div ref={wrap} className={s.portrait} data-cursor="drag" data-cursor-label="PEEL">
      <canvas ref={cv} className={s.portraitCanvas} role="img" aria-label="Studio still life: ceramic spheres and a chrome ring on a plinth" />
      <div ref={strips} className={s.strips} aria-hidden="true">
        {Array.from({ length: STRIPS }, (_, i) => (
          <div key={i} className={s.strip}>
            <span className="label faint">{String(i + 1).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
      <p className={`${s.peelHint} label faint`} aria-hidden="true">
        Drag the sheets up
      </p>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Draggable team cards with inertia
   -------------------------------------------------------------------------- */
function Team() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || useUI.getState().reducedMotion) return
    const cards = el.querySelectorAll<HTMLElement>('[data-team]')
    const ds = Draggable.create(cards, {
      bounds: el,
      inertia: true,
      edgeResistance: 0.75,
      zIndexBoost: true,
      onPress() {
        gsap.to(this.target, { scale: 1.04, boxShadow: 'var(--elev-3)', duration: 0.3, ease: 'quart.out' })
        audio().tick()
      },
      onRelease() {
        gsap.to(this.target, { scale: 1, boxShadow: 'var(--elev-2)', duration: 0.6, ease: 'back.out(1.4)' })
      },
    })
    return () => ds.forEach((d) => d.kill())
  }, [])
  return (
    <div ref={root} className={s.team}>
      {team.map((m, i) => (
        <div key={m.name} data-team="" className={s.teamCard} data-cursor="drag" data-cursor-label="DRAG" style={{ rotate: `${(i % 3) - 1}deg` }}>
          <div className={s.avatar} aria-hidden="true">
            {m.init}
          </div>
          <p className={s.teamName}>{m.name}</p>
          <p className="label faint">{m.role}</p>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Culture scatter wall — collision-safe random placement + dominant colour
   -------------------------------------------------------------------------- */
interface Placed { x: number; y: number; w: number; h: number; src: string; tint: string; label: string }

function placeRects(W: number, H: number, sizes: { w: number; h: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = []
  const gap = 16
  const hits = (r: { x: number; y: number; w: number; h: number }) =>
    out.some((o) => r.x < o.x + o.w + gap && r.x + r.w + gap > o.x && r.y < o.y + o.h + gap && r.y + r.h + gap > o.y)
  sizes.forEach((sz, i) => {
    let placed = false
    // rejection sampling — max 40 attempts
    for (let a = 0; a < 40 && !placed; a++) {
      const r = { x: Math.random() * Math.max(1, W - sz.w), y: Math.random() * Math.max(1, H - sz.h), ...sz }
      if (!hits(r)) {
        out.push(r)
        placed = true
      }
    }
    if (!placed) {
      // grid fallback
      const cols = Math.max(1, Math.floor(W / (sz.w + gap)))
      out.push({ x: (i % cols) * (sz.w + gap), y: Math.floor(i / cols) * (sz.h + gap), ...sz })
    }
  })
  return out
}

function ScatterWall() {
  const root = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Placed[]>([])
  const [tint, setTint] = useState('transparent')

  useEffect(() => {
    const el = root.current
    if (!el) return
    let alive = true
    const cancel = idle(() => {
      const W = el.clientWidth
      const H = el.clientHeight
      const scale = W < 700 ? 0.55 : 1
      const sizes = projects.map((_, i) => {
        const w = Math.round((180 + ((i * 53) % 140)) * scale)
        return { w, h: Math.round(w * (i % 3 === 0 ? 1.25 : 0.72)) }
      })
      const pos = placeRects(W, H, sizes)
      const res: Placed[] = projects.map((p, i) => {
        const c = drawProjectArt({ ...p, slug: p.slug + '-wall' }, sizes[i]!.w * 2, sizes[i]!.h * 2)
        const [r, g, b] = dominantColor(c)
        return { ...pos[i]!, ...sizes[i]!, src: c.toDataURL('image/jpeg', 0.85), tint: `rgb(${r} ${g} ${b})`, label: p.name }
      })
      if (alive) setItems(res)
    })
    return () => {
      alive = false
      cancel()
    }
  }, [])

  useEffect(() => {
    if (!items.length || !root.current || useUI.getState().reducedMotion) return
    gsap.fromTo(root.current.querySelectorAll('[data-shot]'), { opacity: 0, scale: 0.9, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.035 })
  }, [items])

  return (
    <div className={s.wallWrap} style={{ ['--wall-tint' as string]: tint }}>
      <div className={s.wallTint} aria-hidden="true" />
      <div ref={root} className={s.wall} onPointerLeave={() => setTint('transparent')}>
        {items.map((it, i) => (
          <figure
            key={i}
            data-shot=""
            className={s.shot}
            style={{ left: it.x, top: it.y, width: it.w, height: it.h, rotate: `${((i * 37) % 7) - 3}deg` }}
            onPointerEnter={() => setTint(it.tint)}
            data-cursor="media"
            data-cursor-label="STUDIO"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.src} alt={`Studio moment — ${it.label}`} />
          </figure>
        ))}
      </div>
    </div>
  )
}

export function AboutPage() {
  return (
    <>
      <section className={`${s.hero} wrap`}>
        <div className={s.heroCopy}>
          <span className="label">About — est. {brand.founded}, {brand.city}</span>
          <SplitHeadline as="h1" className={`display ${s.title}`} doneEvent={REVEAL_EVENT}>
            Built in
            <br />
            Bhopal.
            <br />
            <span className="serif">Shipped</span> everywhere.
          </SplitHeadline>
        </div>
        <Portrait />
      </section>

      <section className="section wrap">
        <div className={s.story}>
          <span className="label">Story</span>
          <LineReveal as="p" className={s.storyText}>
            GBGTech started in 2020 as three engineers and a designer who were tired of beautiful things that broke and robust things nobody wanted to use. Six years later we are a studio of designers, engineers, editors and growth strategists — still in Bhopal, still allergic to hand-offs, still measuring everything.
          </LineReveal>
          <div className={s.nums}>
            <div>
              <Odometer value="140+" className={s.num} />
              <span className="label faint">Products shipped</span>
            </div>
            <div>
              <Odometer value="032" className={s.num} />
              <span className="label faint">People in the studio</span>
            </div>
            <div>
              <Odometer value="018" className={s.num} />
              <span className="label faint">Countries served</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section wrap">
        <span className="label">The team — drag them around</span>
        <Team />
      </section>

      <section className="section wrap">
        <span className="label">Culture</span>
        <LineReveal as="h2" className={`h1 ${s.cultureTitle}`}>
          Precision is a habit, not a phase.
        </LineReveal>
        <ScatterWall />
      </section>
    </>
  )
}
