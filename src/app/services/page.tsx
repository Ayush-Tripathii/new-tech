import type { Metadata } from 'next'
import { ServicesPage } from '@/components/services/ServicesPage'

export const metadata: Metadata = {
  title: 'Services',
  description: 'Website design & development, software, applications, graphic design, video editing, digital and performance marketing.',
}

export default function Page() {
  return <ServicesPage />
}
