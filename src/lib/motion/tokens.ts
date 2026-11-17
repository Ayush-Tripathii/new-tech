/**
 * Motion tokens — the only durations, eases and staggers allowed in the build.
 * CSS mirrors these as custom properties in globals.css.
 */
export const DUR = {
  instant: 0.15,
  fast: 0.3,
  base: 0.6,
  slow: 0.9,
  cine: 1.4,
  epic: 2.2,
} as const

export const EASE = {
  outExpo: 'expo.out',
  outQuart: 'quart.out',
  inOutExpo: 'expo.inOut',
  seat: 'back.out(1.4)',
  mech: 'power4.inOut',
  /** cubic-bezier(0.83,0,0.17,1) — registered as a CustomEase-free approximation */
  inOutQuint: 'quint.inOut',
} as const

export const STAGGER = {
  chars: 0.012,
  words: 0.04,
  lines: 0.08,
  cards: 0.09,
  grid: 0.035,
} as const

/** Easing functions for per-frame math (outside GSAP). */
export const ease = {
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2),
  seat: (t: number) => {
    const c1 = 1.4
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Normalise v from [a,b] → [0,1], clamped. Used to derive windows from one progress. */
export const win = (v: number, a: number, b: number) => clamp((v - a) / (b - a))
/** Frame-rate independent lerp factor: k is the per-frame factor at 60fps. */
export const damp = (k: number, dt: number) => 1 - Math.pow(1 - k, dt * 60)
