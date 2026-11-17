/**
 * Concurrent WebGL context cap (§5.5: max 2). Kept free of any three.js import
 * so components can acquire a slot without pulling three into the main bundle.
 */
export const MAX_CONTEXTS = 2
let live = 0
const waiters: (() => void)[] = []
// QA hook: inspect from devtools as __gl()
if (typeof window !== 'undefined') (window as unknown as { __gl: () => object }).__gl = () => ({ live, waiting: waiters.length })

/**
 * A scene that lives only while it's wanted. `want(true)` acquires a context
 * slot and builds the scene; `want(false)` disposes it and frees the slot, so
 * scenes further down the page can take it. Safe against toggling mid-load.
 */
export class SceneSlot<T extends { dispose(): void }> {
  scene: T | null = null
  private release: (() => void) | null = null
  private loading = false
  private wanted = false
  private dead = false
  constructor(private factory: () => Promise<T | null>, private onChange?: (scene: T | null) => void) {}

  async want(on: boolean) {
    if (this.dead) return
    this.wanted = on
    if (on && !this.scene && !this.loading) {
      this.loading = true
      const rel = await acquireContext()
      if (!this.wanted || this.dead) {
        rel()
        this.loading = false
        return
      }
      let s: T | null = null
      try {
        s = await this.factory()
      } catch (e) {
        console.warn('[SceneSlot] factory failed', e)
      }
      this.loading = false
      if (!s) return rel()
      if (!this.wanted || this.dead) {
        s.dispose()
        return rel()
      }
      this.scene = s
      this.release = rel
      this.onChange?.(s)
    } else if (!on && this.scene) {
      this.free()
    }
  }

  private free() {
    this.scene?.dispose()
    this.scene = null
    this.release?.()
    this.release = null
    this.onChange?.(null)
  }

  dispose() {
    this.dead = true
    this.wanted = false
    this.free()
  }
}

/** Acquire a context slot; resolves when one is free. Call the returned fn to release. */
export function acquireContext(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      live++
      let released = false
      resolve(() => {
        if (released) return
        released = true
        live--
        waiters.shift()?.()
      })
    }
    if (live < MAX_CONTEXTS) grant()
    else waiters.push(grant)
  })
}
