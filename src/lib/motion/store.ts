'use client'
import { create } from 'zustand'

export type CursorMode = 'default' | 'link' | 'drag' | 'media' | 'hold' | 'hidden'

/**
 * Quality ladder (§5.5). Only ever steps DOWN during a session.
 * 0 full · 1 reduced DPR · 2 shadow 1024 · 3 no caustics · 4 no refraction · 5 static poster
 */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5

interface UIState {
  /** Preloader finished (or skipped for return visitors) */
  preloaderDone: boolean
  /** Page transition IN phase complete — gates every entrance animation */
  transitionComplete: boolean
  menuOpen: boolean
  cursor: CursorMode
  cursorLabel: string
  /** A section has inverted the palette (services sequence) */
  inverted: boolean
  audioOn: boolean
  quality: Quality
  reducedMotion: boolean
  coarse: boolean
  webgl: boolean
  set: (p: Partial<Omit<UIState, 'set' | 'degrade'>>) => void
  degrade: () => void
}

export const useUI = create<UIState>((set, get) => ({
  preloaderDone: false,
  transitionComplete: true,
  menuOpen: false,
  cursor: 'default',
  cursorLabel: '',
  inverted: false,
  audioOn: false,
  quality: 0,
  reducedMotion: false,
  coarse: false,
  webgl: true,
  set: (p) => set(p),
  degrade: () => {
    const q = get().quality
    if (q < 5) set({ quality: (q + 1) as Quality })
  },
}))

/** True once nothing is blocking entrance animations. */
export const useReady = () => useUI((s) => s.preloaderDone && s.transitionComplete)

/** Non-React read */
export const ui = () => useUI.getState()

/**
 * Resolve when the page is ready for entrance animations. Lets imperative code
 * (GSAP timelines in effects) wait on the gate without subscribing manually.
 */
export function whenReady(): Promise<void> {
  const s = useUI.getState()
  if (s.preloaderDone && s.transitionComplete) return Promise.resolve()
  return new Promise((resolve) => {
    const unsub = useUI.subscribe((st) => {
      if (st.preloaderDone && st.transitionComplete) {
        unsub()
        resolve()
      }
    })
  })
}
