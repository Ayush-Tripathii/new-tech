# GBGTech — gbgtech.com

Next.js 15 (App Router, static export) · GSAP 3 · raw Three.js · Lenis · Zustand · Web Audio.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export → ./out (deploy to Vercel or any static host)
npm run typecheck
npm run noise      # regenerates public/noise.png (the 128px dither tile)
```

## Architecture

- **One ticker, one scroll source.** `src/components/providers/MotionProvider.tsx` wires Lenis to
  `gsap.ticker` exactly once and writes scroll/pointer/load into the shared `frame` object
  (`src/lib/motion/frame.ts`). Everything per-frame subscribes with `onFrame()`, and nothing
  attaches its own scroll listener. Discrete UI state lives in `src/lib/motion/store.ts`.
- **Gate.** Entrance animations wait for `preloaderDone && transitionComplete` (`whenReady()`).
- **WebGL budget.** At most 2 concurrent contexts (`src/webgl/contexts.ts`). `SceneSlot` builds a
  scene when it nears the viewport and disposes it (freeing the slot) when it leaves. All scenes are
  dynamic-imported, so three.js is not in any route's initial bundle.
- **Quality ladder.** A rolling 60-frame FPS average steps quality down:
  DPR → shadow 1024 → no caustics → matte glass → static frame.
- **Tokens.** All colours, shadows, eases and durations are in `src/styles/globals.css` and
  `src/lib/motion/tokens.ts`.

## Placeholders to replace before launch

| What | Where |
| --- | --- |
| Proof points, clients, awards, testimonials, team | `src/lib/content.ts` |
| Project imagery (procedurally generated stills) | `src/lib/projectArt.ts` → swap for real photography |
| About portrait (analytic still life + exact depth map) | `src/lib/depthArt.ts` → real portrait + depth map |
| "Reel" card (procedural canvas loop) | `KeyFacts.tsx` → `<video playsInline muted loop>` |
| Contact form submission | `Contact.tsx` (`TODO(launch)`): no backend is wired yet |
| Email / phone / socials | `brand` in `src/lib/content.ts` |

QA hook: `__gl()` in the console reports live and queued WebGL contexts.
