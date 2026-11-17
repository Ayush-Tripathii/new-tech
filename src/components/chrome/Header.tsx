'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { gsap } from '@/lib/gsap'
import { brand, nav } from '@/lib/content'
import { useUI } from '@/lib/motion/store'
import { onFrame } from '@/lib/motion/frame'
import { getLenis } from '@/components/providers/MotionProvider'
import { TLink } from '@/components/providers/TransitionProvider'
import { RollingText, Arrow } from '@/components/primitives/RollingText'
import { audio } from '@/lib/audio/AudioManager'
import s from './Header.module.css'

function AudioToggle() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const a = audio()
    setOn(a.on)
    useUI.getState().set({ audioOn: a.on })
    return a.subscribe((v) => {
      setOn(v)
      useUI.getState().set({ audioOn: v })
    })
  }, [])
  return (
    <button
      className={`${s.audio} press`}
      onClick={() => audio().toggle()}
      aria-pressed={on}
      aria-label={on ? 'Mute sound' : 'Enable sound'}
      data-cursor="link"
      data-on={on ? '1' : '0'}
    >
      <span className={s.eq} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="label">
        <RollingText>{on ? 'Sound on' : 'Sound off'}</RollingText>
      </span>
    </button>
  )
}

export function Header() {
  const menuOpen = useUI((st) => st.menuOpen)
  const inverted = useUI((st) => st.inverted)
  const pathname = usePathname()
  const btn = useRef<HTMLButtonElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(false)

  // hide on scroll down, show on up — read from the shared frame state
  useEffect(() => {
    let state = false
    return onFrame((f) => {
      const next = f.scroll.y > 120 && f.scroll.direction === 1 && Math.abs(f.scroll.velocity) > 40
      const show = f.scroll.y <= 120 || (f.scroll.direction === -1 && Math.abs(f.scroll.velocity) > 40)
      if (next && !state) {
        state = true
        setHidden(true)
      } else if (show && state) {
        state = false
        setHidden(false)
      }
    })
  }, [])

  // Menu overlay — circular clip-path from the hamburger's exact coords
  useEffect(() => {
    const ov = overlay.current
    const b = btn.current
    if (!ov || !b) return
    const r = b.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const radius = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) + 40
    const items = ov.querySelectorAll('[data-menu-item]')
    const lenis = getLenis()
    const reduced = useUI.getState().reducedMotion
    if (menuOpen) {
      lenis?.stop()
      gsap.set(ov, { visibility: 'visible' })
      const tl = gsap.timeline()
      tl.fromTo(
        ov,
        { clipPath: `circle(0px at ${cx}px ${cy}px)` },
        { clipPath: `circle(${radius}px at ${cx}px ${cy}px)`, duration: reduced ? 0.01 : 0.8, ease: 'quint.inOut' },
      ).fromTo(items, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, reduced ? 0 : 0.35)
      // focus trap
      const focusables = () => Array.from(ov.querySelectorAll<HTMLElement>('a, button')).filter((x) => !x.hasAttribute('disabled'))
      setTimeout(() => focusables()[0]?.focus(), 400)
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') useUI.getState().set({ menuOpen: false })
        if (e.key !== 'Tab') return
        const f = [b, ...focusables()]
        const i = f.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey && i <= 0) {
          e.preventDefault()
          f[f.length - 1]?.focus()
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault()
          f[0]?.focus()
        }
      }
      document.addEventListener('keydown', onKey)
      return () => {
        tl.kill()
        document.removeEventListener('keydown', onKey)
      }
    } else if (ov.style.visibility === 'visible') {
      const tl = gsap.to(ov, {
        clipPath: `circle(0px at ${cx}px ${cy}px)`,
        duration: reduced ? 0.01 : 0.6,
        ease: 'quint.inOut',
        onComplete: () => {
          gsap.set(ov, { visibility: 'hidden' })
          if (useUI.getState().transitionComplete) lenis?.start()
        },
      })
      return () => void tl.kill()
    }
  }, [menuOpen])

  useEffect(() => {
    useUI.getState().set({ menuOpen: false })
  }, [pathname])

  const toggle = () => {
    audio().click()
    useUI.getState().set({ menuOpen: !menuOpen })
  }

  return (
    <>
      <header className={s.header} data-hidden={hidden && !menuOpen ? '1' : '0'} data-inverted={inverted && !menuOpen ? '1' : '0'}>
        <div className={s.inner}>
          <TLink href="/" className={s.logo} aria-label={`${brand.name} — home`}>
            <svg viewBox="0 0 28 28" className={s.mark} aria-hidden="true">
              <circle cx="14" cy="14" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <ellipse cx="14" cy="14" rx="13" ry="4.2" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(-24 14 14)" />
              <circle cx="14" cy="14" r="2.2" fill="currentColor" />
            </svg>
            <span className={s.word}>
              GBG<span>Tech</span>
            </span>
          </TLink>
          <nav className={s.nav} aria-label="Primary">
            {nav.map((n) => (
              <TLink key={n.href} href={n.href} className={s.link} aria-current={pathname.startsWith(n.href) && n.href !== '/#contact' ? 'page' : undefined}>
                <RollingText>{n.label}</RollingText>
              </TLink>
            ))}
          </nav>
          <div className={s.right}>
            <AudioToggle />
            <button ref={btn} className={`${s.menuBtn} press`} onClick={toggle} aria-expanded={menuOpen} aria-controls="menu-overlay" data-cursor="link">
              <span className="label">
                <RollingText>{menuOpen ? 'Close' : 'Menu'}</RollingText>
              </span>
              <span className={s.burger} data-open={menuOpen ? '1' : '0'} aria-hidden="true">
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div ref={overlay} id="menu-overlay" className={s.overlay} role="dialog" aria-modal="true" aria-label="Menu" data-lenis-prevent aria-hidden={!menuOpen}>
        <div className={`${s.overlayInner} wrap`}>
          <ul className={s.menuList}>
            {[{ label: 'Index', href: '/' }, ...nav].map((n, i) => (
              <li key={n.href} className="line-mask">
                <TLink href={n.href} className={s.menuLink} data-menu-item="" tabIndex={menuOpen ? 0 : -1}>
                  <span className="label faint">{String(i).padStart(2, '0')}</span>
                  <RollingText>{n.label}</RollingText>
                </TLink>
              </li>
            ))}
          </ul>
          <div className={s.menuFoot}>
            <div data-menu-item="">
              <p className="label faint">Studio</p>
              <p>
                {brand.city}, {brand.country}
              </p>
            </div>
            <div data-menu-item="">
              <p className="label faint">New business</p>
              <a href={`mailto:${brand.email}`} className={s.mail} tabIndex={menuOpen ? 0 : -1}>
                <RollingText>{brand.email}</RollingText>
                <Arrow />
              </a>
            </div>
            <div data-menu-item="" className={s.socials}>
              {brand.socials.map((so) => (
                <a key={so.label} href={so.href} target="_blank" rel="noopener noreferrer" tabIndex={menuOpen ? 0 : -1}>
                  <RollingText>{so.label}</RollingText>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
