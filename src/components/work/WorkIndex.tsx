'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap, Flip } from '@/lib/gsap'
import { projects, type Project } from '@/lib/content'
import { projectArtURL } from '@/lib/projectArt'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { damp } from '@/lib/motion/tokens'
import { audio } from '@/lib/audio/AudioManager'
import { TLink } from '@/components/providers/TransitionProvider'
import { RollingText, Arrow } from '@/components/primitives/RollingText'
import { SplitHeadline, FadeUp } from '@/components/primitives/TextReveal'
import s from './Work.module.css'

const FILTERS = ['All', 'Platform', 'Web', 'App', 'Product', 'Brand'] as const
type Filter = (typeof FILTERS)[number]

export function WorkIndex() {
  const [filter, setFilter] = useState<Filter>('All')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [hover, setHover] = useState<Project | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const preview = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const flipState = useRef<Flip.FlipState | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all(projects.map(async (p) => [p.slug, await projectArtURL(p, 900, 600)] as const)).then((r) => {
      if (alive) setUrls(Object.fromEntries(r))
    })
    return () => {
      alive = false
    }
  }, [])

  // FLIP reorder on filter change
  const choose = (f: Filter) => {
    if (f === filter || !list.current) return
    audio().tick()
    flipState.current = Flip.getState(list.current.querySelectorAll('[data-row]'))
    setFilter(f)
  }
  useLayoutEffect(() => {
    const st = flipState.current
    if (!st || !list.current) return
    flipState.current = null
    Flip.from(st, {
      duration: 0.6,
      ease: 'expo.out',
      absolute: true,
      stagger: 0.035,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.035 }),
      onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.3 }),
    })
  }, [filter])

  // cursor-following preview: springs to cursor, clip-path reveal, --elev-3
  useEffect(() => {
    const el = preview.current
    if (!el || useUI.getState().coarse) return
    let x = 0, y = 0, shown = false
    return onFrame((f) => {
      if (!shown && !hover) return
      const k = damp(0.12, f.dt)
      x += (f.pointer.x - x) * k
      y += (f.pointer.y - y) * k
      const vx = (f.pointer.x - x) * 0.04
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) rotate(${Math.max(-6, Math.min(6, vx)).toFixed(2)}deg)`
      shown = !!hover
    })
  }, [hover])

  useEffect(() => {
    const el = preview.current
    if (!el) return
    gsap.to(el.querySelector('[data-clip]'), {
      clipPath: hover ? 'inset(0% 0% 0% 0%)' : 'inset(50% 50% 50% 50%)',
      duration: hover ? 0.6 : 0.4,
      ease: hover ? 'expo.out' : 'quart.in',
    })
  }, [hover])

  // highlight bar tracks the active row
  const moveBar = (row: HTMLElement | null) => {
    const b = bar.current
    if (!b) return
    if (!row) {
      gsap.to(b, { opacity: 0, duration: 0.3 })
      return
    }
    gsap.to(b, { y: row.offsetTop, height: row.offsetHeight, opacity: 1, duration: 0.5, ease: 'quart.out' })
  }

  const shown = projects.filter((p) => filter === 'All' || p.discipline === filter)

  return (
    <>
      <section className={`${s.head} wrap`}>
        <span className="label">Index — {String(projects.length).padStart(2, '0')} projects</span>
        <SplitHeadline as="h1" className="display mega">
          Work.
        </SplitHeadline>
        <div className={s.chips} role="toolbar" aria-label="Filter projects">
          {FILTERS.map((f) => (
            <button key={f} className={`${s.chip} press`} aria-pressed={filter === f} onClick={() => choose(f)}>
              <RollingText>{f}</RollingText>
              <span className={s.count}>{f === 'All' ? projects.length : projects.filter((p) => p.discipline === f).length}</span>
            </button>
          ))}
        </div>
      </section>

      <FadeUp className={`wrap ${s.listWrap}`}>
        <div ref={bar} className={s.bar} aria-hidden="true" />
        <ul ref={list} className={s.list} onPointerLeave={() => (setHover(null), moveBar(null))}>
          {shown.map((p, i) => (
            <li key={p.slug} data-row="" data-flip-id={p.slug} className={s.rowItem}>
              <TLink
                href={`/work/${p.slug}`}
                className={s.row}
                data-cursor="media"
                data-cursor-label="OPEN"
                onPointerEnter={(e) => {
                  setHover(p)
                  moveBar(e.currentTarget.parentElement)
                  audio().tick()
                }}
                onFocus={(e) => moveBar(e.currentTarget.parentElement)}
              >
                <span className="label faint">{String(i + 1).padStart(2, '0')}</span>
                <span className={s.name}>
                  <RollingText>{p.name}</RollingText>
                </span>
                <span className={`${s.client} mid`}>{p.client}</span>
                <span className="label">{p.discipline}</span>
                <span className="label faint">{p.year}</span>
                <Arrow className={s.rowArrow} />
              </TLink>
            </li>
          ))}
        </ul>
      </FadeUp>

      <div ref={preview} className={s.preview} aria-hidden="true">
        <div data-clip="" className={s.previewClip}>
          {projects.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            urls[p.slug] ? <img key={p.slug} src={urls[p.slug]} alt="" style={{ opacity: hover?.slug === p.slug ? 1 : 0 }} /> : null
          ))}
        </div>
      </div>
    </>
  )
}
