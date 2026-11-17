/**
 * THE shared per-frame state. Computed once per gsap.ticker tick by
 * MotionProvider, read by every subsystem (WebGL, cursor, marquees, audio).
 *
 * Deliberately a mutable singleton rather than React state: per-frame values
 * must never trigger re-renders. Discrete state lives in the zustand store.
 */
export interface FrameState {
  time: number
  dt: number
  frame: number
  scroll: {
    y: number
    /** px per second, signed, smoothed */
    velocity: number
    /** 1 down, -1 up — last non-zero direction */
    direction: 1 | -1
    limit: number
    progress: number
  }
  pointer: {
    x: number
    y: number
    /** −1..1 viewport-normalised */
    nx: number
    ny: number
    /** smoothed copies */
    sx: number
    sy: number
    down: boolean
    /** last pointer movement time (s) */
    lastMove: number
    active: boolean
  }
  /** Interaction energy sources — combined with Math.max, never competing listeners */
  load: {
    scroll: number
    hover: number
    press: number
    idle: number
    value: number
  }
  fps: number
  viewport: { w: number; h: number; dpr: number }
}

export const frame: FrameState = {
  time: 0,
  dt: 1 / 60,
  frame: 0,
  scroll: { y: 0, velocity: 0, direction: 1, limit: 1, progress: 0 },
  pointer: { x: -100, y: -100, nx: 0, ny: 0, sx: -100, sy: -100, down: false, lastMove: 0, active: false },
  load: { scroll: 0, hover: 0, press: 0, idle: 0, value: 0 },
  fps: 60,
  viewport: { w: 1440, h: 900, dpr: 1 },
}

export type FrameSubscriber = (f: FrameState) => void

interface Sub {
  fn: FrameSubscriber
  priority: number
}
const subs: Sub[] = []

/**
 * Subscribe to the single global ticker. Lower priority runs first
 * (state producers < consumers < renderers). Returns an unsubscribe fn.
 */
export function onFrame(fn: FrameSubscriber, priority = 50): () => void {
  const s = { fn, priority }
  subs.push(s)
  subs.sort((a, b) => a.priority - b.priority)
  return () => {
    const i = subs.indexOf(s)
    if (i >= 0) subs.splice(i, 1)
  }
}

export function dispatchFrame() {
  // Copy guards against unsubscribe-during-iteration
  const list = subs.slice()
  for (let i = 0; i < list.length; i++) list[i]!.fn(frame)
}
