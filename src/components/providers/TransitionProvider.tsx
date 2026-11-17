'use client'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { useUI } from '@/lib/motion/store'
import { getLenis } from './MotionProvider'
import { audio } from '@/lib/audio/AudioManager'
import { STAGGER } from '@/lib/motion/tokens'
import styles from './Transition.module.css'

const SHEETS = 12

const ROUTE_NAMES: Record<string, string> = {
  '/': 'Index',
  '/work': 'Work',
  '/services': 'Services',
  '/about': 'About',
}
const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
const routeName = (href: string) => {
  const p = norm(href.split('#')[0]!.split('?')[0]!)
  if (ROUTE_NAMES[p]) return ROUTE_NAMES[p]!
  if (p.startsWith('/work/')) return 'Case — ' + p.slice(6).replace(/-/g, ' ')
  return p.slice(1) || 'Index'
}

interface Ctx {
  navigate: (href: string) => void
}
const TransitionCtx = createContext<Ctx>({ navigate: () => {} })
export const useTransitionNav = () => useContext(TransitionCtx)

export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const sheetsRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const queued = useRef<string | null>(null)
  const waitPath = useRef<{ target: string; resolve: () => void } | null>(null)

  // Resolve HOLD once the new route has committed.
  useEffect(() => {
    const w = waitPath.current
    if (w && norm(pathname) === norm(w.target)) {
      waitPath.current = null
      w.resolve()
    }
    // Back/forward or first load: just refresh triggers after paint.
    if (!busy.current) requestAnimationFrame(() => ScrollTrigger.refresh())
  }, [pathname])

  const navigate = useCallback(
    async (href: string) => {
      const target = href.split('#')[0] || '/'
      if (norm(target) === norm(pathname)) {
        getLenis()?.scrollTo(0, { duration: 1.2 })
        return
      }
      if (busy.current) {
        queued.current = href // rapid switching: last request wins, no broken state
        return
      }
      busy.current = true
      const set = useUI.getState().set
      const reduced = useUI.getState().reducedMotion
      set({ transitionComplete: false, menuOpen: false })
      const lenis = getLenis()
      lenis?.stop()
      audio().sweep()

      const page = document.getElementById('page')
      const sheets = sheetsRef.current ? Array.from(sheetsRef.current.children) : []
      const label = labelRef.current

      // ---------------------------------------------------------------- OUT
      if (reduced) {
        await gsap.to(page, { opacity: 0, duration: 0.2 })
      } else {
        gsap.set(sheetsRef.current, { visibility: 'visible' })
        gsap.set(sheets, { scaleY: 0, transformOrigin: '50% 0%' })
        const out = gsap.timeline()
        out
          .to(page, { scale: 0.96, filter: 'blur(8px) brightness(1.08)', duration: 0.55, ease: 'quint.inOut' }, 0)
          .to(sheets, { scaleY: 1, duration: 0.42, ease: 'quint.inOut', stagger: 0.03 }, 0.0)
        await out
      }

      // --------------------------------------------------------------- HOLD
      if (label) {
        label.textContent = ''
        const name = routeName(href)
        for (const ch of name) {
          const s = document.createElement('span')
          s.textContent = ch === ' ' ? ' ' : ch
          label.appendChild(s)
        }
        gsap.fromTo(
          label.children,
          { yPercent: 110, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.3, stagger: STAGGER.chars, ease: 'expo.out' },
        )
      }
      const committed = new Promise<void>((resolve) => {
        waitPath.current = { target, resolve }
        setTimeout(resolve, 4000) // never strand the user behind the cover
      })
      router.push(href, { scroll: false })
      await Promise.all([committed, new Promise((r) => setTimeout(r, 200))])
      // Scroll restored to 0 under cover; outgoing WebGL already disposed by unmount.
      window.scrollTo(0, 0)
      lenis?.scrollTo(0, { immediate: true, force: true })
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      ScrollTrigger.refresh()

      // ----------------------------------------------------------------- IN
      if (reduced) {
        await gsap.to(page, { opacity: 1, duration: 0.2 })
        gsap.set(page, { clearProps: 'all' })
      } else {
        gsap.set(page, { scale: 1.04, filter: 'blur(6px)', opacity: 1 })
        gsap.set(sheets, { transformOrigin: '50% 0%' })
        if (label) gsap.to(label, { opacity: 0, duration: 0.2 })
        const inn = gsap.timeline()
        inn
          .to(sheets, { scaleY: 0, duration: 0.5, ease: 'quint.inOut', stagger: { each: 0.03, from: 'end' } }, 0)
          .to(page, { scale: 1, filter: 'blur(0px)', duration: 0.65, ease: 'expo.out' }, 0)
        await inn
        gsap.set(page, { clearProps: 'transform,filter' })
        gsap.set(sheetsRef.current, { visibility: 'hidden' })
        if (label) gsap.set(label, { opacity: 1, textContent: '' })
      }

      lenis?.start()
      busy.current = false
      // Headline reveals fire only now, after sheets clear.
      set({ transitionComplete: true })
      ScrollTrigger.refresh()

      const q = queued.current
      queued.current = null
      if (q && norm(q) !== norm(target)) navigate(q)
    },
    [pathname, router],
  )

  return (
    <TransitionCtx.Provider value={{ navigate }}>
      {children}
      <div ref={sheetsRef} className={styles.sheets} aria-hidden="true">
        {Array.from({ length: SHEETS }, (_, i) => (
          <div key={i} className={styles.sheet} />
        ))}
      </div>
      <div ref={labelRef} className={`${styles.label} label`} aria-live="polite" />
    </TransitionCtx.Provider>
  )
}

type TLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }

/** Internal link that routes through the transition shell. Modifier-clicks behave natively. */
export const TLink = forwardRef<HTMLAnchorElement, TLinkProps>(function TLink({ href, onClick, target, ...rest }, ref) {
  const { navigate } = useTransitionNav()
  const internal = href.startsWith('/') && !href.startsWith('//')
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || !internal || target === '_blank') return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (href.startsWith('/#') || href.includes('#')) {
      const [path, hash] = href.split('#')
      if (norm(path || '/') === norm(window.location.pathname)) {
        e.preventDefault()
        const el = hash ? document.getElementById(hash) : null
        if (el) getLenis()?.scrollTo(el, { offset: -40, duration: 1.4 })
        return
      }
    }
    e.preventDefault()
    navigate(href)
  }
  if (!internal) return <a ref={ref} href={href} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined} onClick={onClick} {...rest} />
  return <Link ref={ref} href={href} onClick={handle} target={target} {...rest} />
})
