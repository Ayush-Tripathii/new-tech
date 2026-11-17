import type { Metadata } from 'next'
import { WorkIndex } from '@/components/work/WorkIndex'

export const metadata: Metadata = {
  title: 'Work',
  description: 'Selected platforms, products, apps, brands and growth systems engineered by GBGTech, 2020–2026.',
}

export default function WorkPage() {
  return <WorkIndex />
}
