import { Hero } from '@/components/home/Hero'
import { Manifesto } from '@/components/home/Manifesto'
import { KeyFacts } from '@/components/home/KeyFacts'
import { ServicesSequence } from '@/components/home/ServicesSequence'
import { WorkHelix } from '@/components/home/WorkHelix'
import { Testimonials } from '@/components/home/Testimonials'
import { Contact } from '@/components/home/Contact'

export default function Home() {
  return (
    <>
      <Hero />
      <Manifesto />
      <KeyFacts />
      <ServicesSequence />
      <WorkHelix />
      <Testimonials />
      <Contact />
    </>
  )
}
