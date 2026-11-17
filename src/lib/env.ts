/** Environment probes. All safe to call on the server (return conservative defaults). */

export const isBrowser = typeof window !== 'undefined'

export const prefersReducedMotion = () =>
  isBrowser && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const isCoarse = () => isBrowser && window.matchMedia('(pointer: coarse)').matches

export const isMobile = () => isBrowser && window.matchMedia('(max-width: 768px)').matches

let webglProbe: boolean | null = null
/** Context-creation probe (§14) — creates and immediately loses a throwaway context. */
export function hasWebGL(): boolean {
  if (!isBrowser) return false
  if (webglProbe !== null) return webglProbe
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    webglProbe = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglProbe = false
  }
  return webglProbe
}

/** requestIdleCallback with setTimeout fallback (Safari). */
export function idle(fn: () => void, timeout = 1200): () => void {
  if (!isBrowser) return () => {}
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, 32)
  return () => window.clearTimeout(id)
}

export const maxDPR = () => (isBrowser ? Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2) : 1)
