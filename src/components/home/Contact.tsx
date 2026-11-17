'use client'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { gsap } from '@/lib/gsap'
import { brand } from '@/lib/content'
import { useUI } from '@/lib/motion/store'
import { RollingText, Arrow } from '@/components/primitives/RollingText'
import { LineReveal } from '@/components/primitives/TextReveal'
import { audio } from '@/lib/audio/AudioManager'
import s from './Contact.module.css'

type Errors = Partial<Record<'name' | 'email' | 'message' | 'budget', string>>

const BUDGETS = ['Under ₹5L', '₹5L – ₹15L', '₹15L – ₹50L', '₹50L +', 'Not sure yet']

function validate(v: Record<string, string>): Errors {
  const e: Errors = {}
  if (!v.name?.trim()) e.name = 'Required — who should we reply to?'
  if (!v.email?.trim()) e.email = 'Required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) e.email = 'That address doesn’t look deliverable'
  if (!v.budget) e.budget = 'Pick the closest range'
  if ((v.message?.trim().length ?? 0) < 12) e.message = 'A sentence or two, please (12+ characters)'
  return e
}

function Field({ name, label, type = 'text', value, error, onChange, onBlur, textarea }: {
  name: string; label: string; type?: string; value: string; error?: string; textarea?: boolean
  onChange: (v: string) => void; onBlur: () => void
}) {
  const id = useId()
  const props = {
    id, name, value, placeholder: ' ',
    'aria-invalid': !!error,
    'aria-describedby': `${id}-err`,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onBlur,
    className: s.input,
  }
  return (
    <div className={s.field} data-error={error ? '1' : '0'}>
      <div className={s.well}>
        {textarea ? <textarea rows={4} {...props} /> : <input type={type} autoComplete={name === 'email' ? 'email' : name === 'name' ? 'name' : 'off'} {...props} />}
        <label htmlFor={id} className={s.float}>
          {label}
        </label>
      </div>
      {/* message slides down via grid-template-rows 0fr → 1fr */}
      <div className={s.err} id={`${id}-err`} aria-live="polite">
        <span className="label">{error ?? ''}</span>
      </div>
    </div>
  )
}

function Select({ value, error, onChange, onBlur }: { value: string; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const blurRef = useRef(onBlur)
  blurRef.current = onBlur

  useEffect(() => {
    const l = list.current
    if (!l) return
    if (open) {
      gsap.set(l, { display: 'block' })
      gsap.fromTo(l, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'quart.out' })
      gsap.fromTo(l.children, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.035 })
      const away = (e: PointerEvent) => {
        if (!root.current?.contains(e.target as Node)) {
          setOpen(false)
          blurRef.current()
        }
      }
      document.addEventListener('pointerdown', away)
      return () => document.removeEventListener('pointerdown', away)
    } else {
      gsap.to(l, { opacity: 0, duration: 0.15, onComplete: () => void gsap.set(l, { display: 'none' }) })
    }
  }, [open])

  const pick = (i: number) => {
    onChange(BUDGETS[i]!)
    setOpen(false)
    audio().tick()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHi((h) => Math.min(BUDGETS.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) pick(hi)
      else setOpen(true)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={s.field} data-error={error ? '1' : '0'} ref={root}>
      <div className={`${s.well} ${s.selectWell}`}>
        <button
          type="button"
          className={`${s.input} ${s.selectBtn}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-labelledby={`${id}-lab`}
          aria-activedescendant={open ? `${id}-o${hi}` : undefined}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onKey}
          data-filled={value ? '1' : '0'}
        >
          <span className={s.selectVal}>{value || ' '}</span>
          <span className={s.chev} data-open={open ? '1' : '0'} aria-hidden="true" />
        </button>
        <span id={`${id}-lab`} className={s.float} data-forced={value ? '1' : '0'}>
          Budget range
        </span>
        <ul ref={list} id={`${id}-list`} role="listbox" className={s.options} style={{ display: 'none' }} data-lenis-prevent>
          {BUDGETS.map((b, i) => (
            <li
              key={b}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={value === b}
              data-hi={hi === i ? '1' : '0'}
              onPointerEnter={() => setHi(i)}
              onClick={() => pick(i)}
              className={s.option}
            >
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={s.err} aria-live="polite">
        <span className="label">{error ?? ''}</span>
      </div>
    </div>
  )
}

export function Contact() {
  const [v, setV] = useState({ name: '', email: '', company: '', budget: '', message: '' })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const success = useRef<HTMLDivElement>(null)

  const set = (k: keyof typeof v) => (val: string) => {
    const next = { ...v, [k]: val }
    setV(next)
    if (touched[k]) setErrors(validate(next))
  }
  const blur = (k: string) => () => {
    setTouched((t) => ({ ...t, [k]: true }))
    setErrors(validate(v))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(v)
    setErrors(errs)
    setTouched({ name: true, email: true, budget: true, message: true })
    if (Object.keys(errs).length) {
      audio().click()
      const firstBad = panel.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      firstBad?.focus()
      return
    }
    setState('sending')
    const reduced = useUI.getState().reducedMotion
    const b = btn.current!
    const bar = b.querySelector('[data-progress]')
    // button → progress bar → checkmark → panel folds to success
    const tl = gsap.timeline()
    tl.to(b, { width: '100%', duration: reduced ? 0 : 0.6, ease: 'expo.inOut' })
      .to(b.querySelector('[data-label]'), { opacity: 0, duration: 0.2 }, 0)
      .fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: reduced ? 0 : 1.2, ease: 'power2.inOut' })
    // TODO(launch): POST to the real endpoint (Formspree/Resend/edge function).
    await Promise.all([tl, new Promise((r) => setTimeout(r, 400))])
    audio().seat(1)
    await gsap.fromTo(b.querySelector('[data-check]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: reduced ? 0 : 0.5, ease: 'expo.out' })
    await gsap.to(panel.current, { rotateX: reduced ? 0 : -78, opacity: 0, y: -30, transformOrigin: '50% 0%', duration: reduced ? 0.2 : 0.9, ease: 'quint.inOut', delay: 0.3 })
    setState('done')
  }

  useEffect(() => {
    if (state !== 'done' || !success.current) return
    gsap.fromTo(success.current.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08 })
    success.current.querySelector<HTMLElement>('h3')?.focus()
  }, [state])

  return (
    <section className={`${s.contact} section`} id="contact" aria-labelledby="contact-title">
      <div className={`wrap ${s.grid}`}>
        <div className={s.intro}>
          <div className={s.head}>
            <span className="label faint">(06)</span>
            <span className="label">Contact</span>
          </div>
          <LineReveal as="h2" className="h1">
            <span id="contact-title">Bring us a problem worth machining.</span>
          </LineReveal>
          <p className="lede">Tell us what you’re building. A senior engineer — not a sales rep — replies within one working day.</p>
          <div className={s.direct}>
            <a href={`mailto:${brand.email}`} className={s.directLink}>
              <span className="label faint">Email</span>
              <span className={s.directVal}>
                <RollingText>{brand.email}</RollingText>
                <Arrow />
              </span>
            </a>
            <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className={s.directLink}>
              <span className="label faint">Phone</span>
              <span className={s.directVal}>
                <RollingText>{brand.phone}</RollingText>
                <Arrow />
              </span>
            </a>
          </div>
        </div>

        <div className={s.cardWrap}>
          {state !== 'done' ? (
            <div ref={panel} className={s.card}>
              <form onSubmit={submit} noValidate className={s.form}>
                <div className={s.row2}>
                  <Field name="name" label="Your name" value={v.name} error={touched.name ? errors.name : undefined} onChange={set('name')} onBlur={blur('name')} />
                  <Field name="email" type="email" label="Work email" value={v.email} error={touched.email ? errors.email : undefined} onChange={set('email')} onBlur={blur('email')} />
                </div>
                <div className={s.row2}>
                  <Field name="company" label="Company (optional)" value={v.company} onChange={set('company')} onBlur={() => {}} />
                  <Select value={v.budget} error={touched.budget ? errors.budget : undefined} onChange={set('budget')} onBlur={blur('budget')} />
                </div>
                <Field name="message" label="What are we building?" textarea value={v.message} error={touched.message ? errors.message : undefined} onChange={set('message')} onBlur={blur('message')} />
                <div className={s.submitRow}>
                  <p className="label faint">No newsletters. No spam. Ever.</p>
                  <button ref={btn} type="submit" className={`${s.submit} press`} disabled={state === 'sending'} data-cursor="link">
                    <span data-label="" className={s.submitLabel}>
                      <RollingText>Send brief</RollingText>
                      <Arrow />
                    </span>
                    <span data-progress="" className={s.progress} aria-hidden="true" />
                    <svg className={s.check} viewBox="0 0 24 24" aria-hidden="true">
                      <path data-check="" d="M5 12.5 10 17 19 7.5" pathLength={1} />
                    </svg>
                    <span className="visually-hidden" aria-live="polite">
                      {state === 'sending' ? 'Sending' : ''}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div ref={success} className={s.success} role="status">
              <span className="label">Brief received — {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
              <h3 className="h2" tabIndex={-1}>
                Seated. We’ll be in touch within one working day.
              </h3>
              <p className="mid">Meanwhile, {v.name.split(' ')[0] || 'friend'}, the armature on the index page still disperses if you hold it.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
