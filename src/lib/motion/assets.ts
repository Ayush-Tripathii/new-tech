/**
 * Asset registry — real load progress for the preloader's third reel.
 * Anything critical to the first frame registers a promise here.
 */
type Listener = (p: number) => void

const pending = new Set<Promise<unknown>>()
let total = 0
let done = 0
const listeners = new Set<Listener>()

const emit = () => {
  const p = total === 0 ? 0 : done / total
  listeners.forEach((l) => l(p))
}

export function registerAsset<T>(p: Promise<T>): Promise<T> {
  total++
  pending.add(p)
  emit()
  const fin = () => {
    if (!pending.has(p)) return
    pending.delete(p)
    done++
    emit()
  }
  p.then(fin, fin)
  return p
}

export function onAssetProgress(l: Listener): () => void {
  listeners.add(l)
  l(total === 0 ? 0 : done / total)
  return () => listeners.delete(l)
}

/** Resolves when every registered asset has settled (or `max` ms elapse). */
export function allAssets(max = 5000): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, max)
    const check = () => {
      if (pending.size === 0 && total > 0) {
        clearTimeout(t)
        resolve()
        return true
      }
      return false
    }
    if (check()) return
    const l: Listener = () => {
      if (check()) listeners.delete(l)
    }
    listeners.add(l)
  })
}

/**
 * Scene warm-up handshake: the hero registers its shader compile here so the
 * preloader never lifts onto an empty canvas.
 */
let warmExpected = false
/** A scene on this route will call markSceneWarm(); preloader should wait for it. */
export const expectSceneWarm = () => void (warmExpected = true)
export const isSceneWarmExpected = () => warmExpected
let resolveWarm: (() => void) | null = null
export const sceneWarm = new Promise<void>((r) => (resolveWarm = r))
export const markSceneWarm = () => resolveWarm?.()
