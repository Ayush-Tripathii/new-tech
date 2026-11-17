'use client'
import { useEffect, useRef, useState } from 'react'
import { onFrame } from '@/lib/motion/frame'
import { useUI, type CursorMode } from '@/lib/motion/store'
import { damp } from '@/lib/motion/tokens'
import s from './Cursor.module.css'

/**
 * §6.5 Custom cursor. One GPU-transformed dot (lerp 0.18) + trailing ring
 * (lerp 0.09). Modes come from the nearest [data-cursor] ancestor via one
 * delegated pointerover listener. Over-dark is resolved from the element under
 * the pointer every 4th frame — this catches sections that become dark
 * dynamically (the services inversion), entering AND leaving.
 * Disabled entirely on (pointer: coarse).
 */
export function Cursor() {
  const [enabled, setEnabled] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    setEnabled(true)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const r = root.current!
    const d = dot.current!
    const g = ring.current!
    const l = label.current!
    document.documentElement.classList.add('has-cursor')

    let mode: CursorMode = 'default'
    let forced: CursorMode | null = null
    const setMode = (m: CursorMode, text = '') => {
      if (m === mode && l.textContent === text) return
      mode = m
      r.dataset.mode = m
      l.textContent = text
    }
    const resolve = (target: EventTarget | null) => {
      if (forced) return setMode(forced, forced === 'hold' ? 'HOLD' : '')
      const el = target instanceof Element ? target : null
      if (!el) return setMode('default')
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return setMode('hidden')
      const c = el.closest<HTMLElement>('[data-cursor]')
      if (c) return setMode((c.dataset.cursor as CursorMode) ?? 'link', c.dataset.cursorLabel ?? '')
      if (el.closest('a, button, [role="button"], label, summary')) return setMode('link')
      setMode('default')
    }
    const onOver = (e: PointerEvent) => resolve(e.target)
    document.addEventListener('pointerover', onOver, { passive: true })

    // External control (hold-to-disperse forces 'hold')
    const unsub = useUI.subscribe((st, prev) => {
      if (st.cursor !== prev.cursor) {
        forced = st.cursor === 'default' ? null : st.cursor
        if (forced) setMode(forced, st.cursorLabel)
        else resolve(document.elementFromPoint(lastX, lastY))
      }
    })

    let dx = -100, dy = -100, rx = -100, ry = -100
    let lastX = -100, lastY = -100
    let dark = false
    let shown = false
    const reduced = useUI.getState().reducedMotion

    const off = onFrame((f) => {
      const p = f.pointer
      if (!p.active) {
        if (shown) {
          r.style.opacity = '0'
          shown = false
        }
        return
      }
      if (!shown) {
        r.style.opacity = '1'
        shown = true
        dx = rx = p.x
        dy = ry = p.y
      }
      lastX = p.x
      lastY = p.y
      const kd = reduced ? 1 : damp(0.18, f.dt)
      const kr = reduced ? 1 : damp(0.09, f.dt)
      dx += (p.x - dx) * kd
      dy += (p.y - dy) * kd
      rx += (p.x - rx) * kr
      ry += (p.y - ry) * kr
      d.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`
      g.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`
      if (mode === 'hold') g.style.setProperty('--p', f.load.press.toFixed(3))

      if (f.frame % 4 === 0) {
        const under = document.elementFromPoint(p.x, p.y)
        const isDark = !!under?.closest('[data-theme="dark"]')
        if (isDark !== dark) {
          dark = isDark
          r.dataset.dark = dark ? '1' : '0'
        }
      }
    }, 90)

    return () => {
      off()
      unsub()
      document.removeEventListener('pointerover', onOver)
      document.documentElement.classList.remove('has-cursor')
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div ref={root} className={s.root} data-mode="default" data-dark="0" aria-hidden="true">
      <div ref={ring} className={s.ring}>
        <div className={s.ringInner}>
          <span className={s.fill} />
          <span ref={label} className={`${s.label} label`} />
          <span className={s.glyph}>↔</span>
        </div>
      </div>
      <div ref={dot} className={s.dot}>
        <div className={s.dotInner} />
      </div>
    </div>
  )
}
