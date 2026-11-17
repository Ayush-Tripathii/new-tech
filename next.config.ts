import type { NextConfig } from 'next'

/**
 * Static export for GitHub Pages: every route is pre-rendered to /out.
 * basePath and assetPrefix are set to '/new-tech' in production (or from BASE_PATH env var)
 * so assets and routes resolve properly on https://<username>.github.io/new-tech/
 */
const isProd = process.env.NODE_ENV === 'production'
const basePath = process.env.BASE_PATH !== undefined 
  ? process.env.BASE_PATH 
  : (isProd ? '/new-tech' : '')

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  basePath: basePath ? basePath : undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  experimental: {
    optimizePackageImports: ['gsap', 'three'],
  },
}

export default nextConfig

