import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { projects } from '@/lib/content'
import { CaseStudy } from '@/components/work/CaseStudy'

export const dynamicParams = false

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = projects.find((x) => x.slug === slug)
  return p ? { title: p.name, description: p.summary } : {}
}

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!projects.some((p) => p.slug === slug)) notFound()
  return <CaseStudy key={slug} slug={slug} />
}
