'use client'
/**
 * Single registration point for GSAP + plugins. Import gsap from here only.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { Observer } from 'gsap/Observer'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { Flip } from 'gsap/Flip'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { useGSAP } from '@gsap/react'

let registered = false
if (typeof window !== 'undefined' && !registered) {
  gsap.registerPlugin(ScrollTrigger, SplitText, Observer, Draggable, InertiaPlugin, Flip, DrawSVGPlugin, useGSAP)
  gsap.config({ nullTargetWarn: false })
  ScrollTrigger.config({ ignoreMobileResize: true })
  registered = true
}

export { gsap, ScrollTrigger, SplitText, Observer, Draggable, InertiaPlugin, Flip, DrawSVGPlugin, useGSAP }
