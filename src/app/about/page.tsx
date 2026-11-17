import type { Metadata } from 'next'
import { AboutPage } from '@/components/about/AboutPage'

export const metadata: Metadata = {
  title: 'About',
  description: 'GBGTech is a digital engineering studio in Bhopal, India — designers, engineers, editors and growth strategists since 2020.',
}

export default function Page() {
  return <AboutPage />
}
