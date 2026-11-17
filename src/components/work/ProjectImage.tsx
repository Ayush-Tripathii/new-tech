'use client'
import { useEffect, useState } from 'react'
import type { Project } from '@/lib/content'
import { projectArtURL } from '@/lib/projectArt'

/** <img> backed by the procedural project art (swap for real photography). */
export function ProjectImage({ project, w = 1600, h = 1000, alt, className }: { project: Project; w?: number; h?: number; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    projectArtURL(project, w, h).then((u) => alive && setSrc(u))
    return () => {
      alive = false
    }
  }, [project, w, h])
  return (
    <div className={className} style={{ aspectRatio: `${w} / ${h}`, background: project.tone }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={alt} width={w} height={h} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </div>
  )
}
