import type { Metadata, Viewport } from 'next'
import { Inter_Tight, Martian_Mono, Newsreader } from 'next/font/google'
import '@/styles/globals.css'
import { MotionProvider } from '@/components/providers/MotionProvider'
import { TransitionProvider } from '@/components/providers/TransitionProvider'
import { Header } from '@/components/chrome/Header'
import { Cursor } from '@/components/chrome/Cursor'
import { Preloader } from '@/components/chrome/Preloader'
import { Footer } from '@/components/chrome/Footer'
import { brand } from '@/lib/content'

// Variable grotesk with a true 100–900 axis. adjustFontFallback (default) emits
// size-adjust'd fallbacks so font swap causes no layout shift.
const sans = Inter_Tight({ subsets: ['latin'], variable: '--ff-sans', display: 'swap' })
const mono = Martian_Mono({ subsets: ['latin'], variable: '--ff-mono', display: 'swap', weight: 'variable' })
const serif = Newsreader({ subsets: ['latin'], variable: '--ff-serif', display: 'swap', style: ['normal', 'italic'], weight: ['200', '300'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://gbgtech.com'),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s — ${brand.name}` },
  description: `${brand.name} designs and engineers websites, software, apps, film and growth systems. ${brand.city}, ${brand.country}. Est. ${brand.founded}.`,
  openGraph: { type: 'website', siteName: brand.name, title: `${brand.name} — ${brand.tagline}` },
}

export const viewport: Viewport = {
  themeColor: '#F7F6F3',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const basePath = process.env.NODE_ENV === 'production' ? (process.env.BASE_PATH ?? '/new-tech') : ''

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
      style={{ ['--noise-url' as string]: `url('${basePath}/noise.png')` } as React.CSSProperties}
    >
      <head>
        <link rel="preload" href={`${basePath}/noise.png`} as="image" />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <MotionProvider>
          <TransitionProvider>
            <Header />
            <div id="page">
              <main id="main" tabIndex={-1}>
                {children}
              </main>
              <Footer />
            </div>
            <Cursor />
            <Preloader />
          </TransitionProvider>
        </MotionProvider>
        <div className="dither" aria-hidden="true" />
      </body>
    </html>
  )
}
