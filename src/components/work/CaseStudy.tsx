'use client'
import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { onFrame } from '@/lib/motion/frame'
import { useUI } from '@/lib/motion/store'
import { projects, type Project } from '@/lib/content'
import { projectArtURL } from '@/lib/projectArt'
import { TLink } from '@/components/providers/TransitionProvider'
import { SplitHeadline, LineReveal } from '@/components/primitives/TextReveal'
import { Odometer } from '@/components/primitives/Odometer'
import { Arrow, RollingText } from '@/components/primitives/RollingText'
import { ProjectImage } from './ProjectImage'
import s from './Case.module.css'

export function CaseStudy({ slug }: { slug: string }) {
  const p = projects.find((x) => x.slug === slug)!
  const idx = projects.indexOf(p)
  const next = projects[(idx + 1) % projects.length]!
  const hero = useRef<HTMLDivElement>(null)
  const media = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLElement>(null)

  // preload the next project's image (peel panel)
  useEffect(() => {
    void projectArtURL(next, 1600, 1000)
  }, [next])

  useEffect(() => {
    const reduced = useUI.getState().reducedMotion
    if (reduced) return
    const triggers: ScrollTrigger[] = []
    // pinned hero: scale scrubbed 1 → 0.86 with radius opening up
    const h = hero.current!
    const img = h.querySelector('[data-hero-img]')
    triggers.push(
      ScrollTrigger.create({
        trigger: h,
        start: 'top top',
        end: '+=80%',
        pin: true,
        pinSpacing: true,
        scrub: 1,
        animation: gsap.fromTo(img, { scale: 1, borderRadius: 0 }, { scale: 0.86, borderRadius: 14, ease: 'none' }),
      }),
    )
    // next project panel peels up over the footer
    const n = nextRef.current!
    triggers.push(
      ScrollTrigger.create({
        trigger: n,
        start: 'top bottom',
        end: 'top 30%',
        scrub: 1,
        animation: gsap.fromTo(n, { yPercent: 18, rotateX: 6 }, { yPercent: 0, rotateX: 0, ease: 'none' }),
      }),
    )
    // full-bleed media at differential rates 0.85 / 1.0 / 1.15
    const layers = Array.from(media.current!.querySelectorAll<HTMLElement>('[data-rate]'))
    const off = onFrame((f) => {
      const vh = f.viewport.h
      for (const el of layers) {
        const r = el.parentElement!.getBoundingClientRect()
        if (r.bottom < -100 || r.top > vh + 100) continue
        const rate = Number(el.dataset.rate)
        const centre = r.top + r.height / 2 - vh / 2
        // clamp to the 1.24× overscan so an edge is never exposed
        const max = r.height * 0.11
        const shift = Math.max(-max, Math.min(max, centre * (1 - rate)))
        el.style.transform = `translate3d(0,${shift.toFixed(1)}px,0)`
      }
    })
    return () => {
      off()
      triggers.forEach((t) => t.kill())
    }
  }, [slug])

  return (
    <article className={s.case}>
      <header className={`${s.intro} wrap`}>
        <TLink href="/work" className={`${s.back} label`}>
          <span aria-hidden="true">←</span> <RollingText>All work</RollingText>
        </TLink>
        <SplitHeadline as="h1" className={`display ${s.title}`}>
          {p.name}
        </SplitHeadline>
        <LineReveal className={`lede ${s.summary}`}>{p.summary}</LineReveal>
      </header>

      <div ref={hero} className={s.hero}>
        <div data-hero-img="" className={s.heroImg}>
          <ProjectImage project={p} w={2000} h={1200} alt={`${p.name} — key visual`} className={s.heroInner} />
        </div>
      </div>

      <div className={`${s.body} wrap`}>
        <aside className={s.rail} aria-label="Project details">
          <dl>
            <div>
              <dt className="label faint">Client</dt>
              <dd>{p.client}</dd>
            </div>
            <div>
              <dt className="label faint">Discipline</dt>
              <dd>{p.discipline}</dd>
            </div>
            <div>
              <dt className="label faint">Year</dt>
              <dd>{p.year}</dd>
            </div>
            <div>
              <dt className="label faint">Outcome</dt>
              <dd>{p.outcome}</dd>
            </div>
          </dl>
        </aside>
        <div className={s.content}>
          <h2 className="h2">The brief</h2>
          <LineReveal className="mid">
            {p.client} came to us with a system that worked on paper and nowhere else. The constraint was not ambition — it was tolerance: every interaction had to hold under real load, on real devices, for real people at the end of a long day.
          </LineReveal>
          <div className={s.metrics}>
            {p.metrics.map((m) => (
              <div key={m.label} className={s.metric}>
                <Odometer value={m.value} className={s.metricVal} />
                <span className="label faint">{m.label}</span>
              </div>
            ))}
          </div>
          <h2 className="h2">The approach</h2>
          <LineReveal className="mid">
            We calibrated for two weeks before drawing anything: interviews, telemetry, a teardown of the existing stack. Then design and engineering ran as one loop, shipping weekly to a staging build the client team could open on their phones — so every decision was made against the real thing, never a mock-up of it.
          </LineReveal>
        </div>
      </div>

      <div ref={media} className={s.media}>
        {[0.85, 1.0, 1.15].map((rate, i) => (
          <figure key={rate} className={`${s.fig} ${s[`fig${i}`]}`}>
            <div data-rate={rate} className={s.figInner}>
              <ProjectImage project={{ ...p, slug: `${p.slug}-${i}` }} w={1600} h={i === 1 ? 1000 : 1200} alt={`${p.name} — detail ${i + 1}`} />
            </div>
          </figure>
        ))}
      </div>

      {p.quote && (
        <blockquote className={`${s.pull} wrap`}>
          <p className="serif">“{p.quote.text}”</p>
          <footer className="label faint">— {p.quote.by}</footer>
        </blockquote>
      )}

      <section ref={nextRef} className={s.next} aria-label="Next project">
        <TLink href={`/work/${next.slug}`} className={`${s.nextLink} wrap`} data-cursor="media" data-cursor-label="NEXT">
          <span className="label faint">Next project</span>
          <span className={s.nextName}>
            <RollingText>{next.name}</RollingText>
            <Arrow />
          </span>
          <ProjectImage project={next} w={1600} h={1000} alt="" className={s.nextImg} />
        </TLink>
      </section>
    </article>
  )
}

export type { Project }
