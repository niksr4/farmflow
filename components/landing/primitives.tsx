"use client"

/**
 * Small presentational pieces the landing page composes. They live here so the page file stays
 * a readable outline of the sections rather than a wall of markup.
 *
 * Every animated piece checks `useReducedMotion` and settles on its final state instead of a
 * blank one. A visitor who has asked their OS for less motion should get a finished page, not
 * an empty one, which is what happens when a reveal animation is simply skipped.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion"
import { ChevronDown } from "lucide-react"

const MotionSpan = motion.span as any
const MotionDiv = motion.div as any

/* ── Reveal on scroll ─────────────────────────────────────────────────────── */

export function useReveal() {
  const prefersReducedMotion = useReducedMotion()
  return (delay = 0) =>
    prefersReducedMotion
      ? { initial: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 22 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.15 },
          transition: { duration: 0.55, delay, ease: "easeOut" as const },
        }
}

/* ── Count-up number ──────────────────────────────────────────────────────── */

export function CountUpNumber({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.6,
}: {
  target: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null) as React.RefObject<Element>
  const isInView = useInView(ref, { once: true, margin: "-60px" })
  const prefersReducedMotion = useReducedMotion()
  const motionVal = useMotionValue(prefersReducedMotion ? target : 0)
  const spring = useSpring(motionVal, { duration: duration * 1000, bounce: 0 })
  const display = useTransform(spring, (v) =>
    `${prefix}${decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-IN")}${suffix}`,
  )

  useEffect(() => {
    if (isInView || prefersReducedMotion) motionVal.set(target)
  }, [isInView, motionVal, prefersReducedMotion, target])

  return <MotionSpan ref={ref}>{display}</MotionSpan>
}

/* ── Section heading ──────────────────────────────────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "center",
  className = "",
}: {
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  align?: "center" | "left"
  className?: string
}) {
  const centered = align === "center"
  const rule = <span aria-hidden className="h-px w-6 shrink-0 bg-emerald-400/50" />
  return (
    <div className={`${centered ? "mx-auto max-w-2xl text-center" : "max-w-xl"} ${className}`}>
      <p
        className={`flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400/90 ${
          centered ? "justify-center" : ""
        }`}
      >
        {rule}
        {eyebrow}
        {centered ? rule : null}
      </p>
      <h2 className="mt-4 text-balance font-display text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[2.75rem]">
        {title}
      </h2>
      {lede ? <p className="mt-4 text-[15px] leading-7 text-stone-400">{lede}</p> : null}
    </div>
  )
}

/* ── Photograph frame ─────────────────────────────────────────────────────── */

/**
 * Photographs on a near-black page need a scrim or they read as bright rectangles punched out
 * of the layout. The gradient below is doing that job, not decoration.
 */
export function PhotoFrame({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
  objectPosition = "object-center",
  scrim = "from-[#07110f] via-[#07110f]/25 to-transparent",
  children,
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  className?: string
  /** Tailwind object-position utility. These are tall crops of wide photographs, so the
   *  default centre crop throws away the part of the frame worth looking at. */
  objectPosition?: string
  scrim?: string
  children?: ReactNode
}) {
  return (
    <div className={`relative overflow-hidden bg-[#0a1512] ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${objectPosition} saturate-[0.92] transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]`}
      />
      <div aria-hidden className={`absolute inset-0 bg-gradient-to-t ${scrim}`} />
      {children}
    </div>
  )
}

/* ── Frequently asked question ────────────────────────────────────────────── */

/**
 * Native `details` rather than a JS accordion: it opens with no hydration, is keyboard and
 * screen reader correct for free, and survives the page being read with JS switched off.
 */
export function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="faq-item group border-b border-white/[0.07] last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[15px] font-medium text-stone-200 transition-colors hover:text-white">
        {question}
        <ChevronDown
          aria-hidden
          className="faq-chevron h-4 w-4 shrink-0 text-stone-500 transition-transform duration-300"
        />
      </summary>
      <p className="faq-answer pb-6 pr-10 text-[14px] leading-7 text-stone-400">{answer}</p>
    </details>
  )
}

/* ── Sticky call to action for small screens ──────────────────────────────── */

/**
 * On a phone the hero CTA scrolls away within a swipe and the next one is eight sections down.
 * This brings it back once the hero has gone, and retires it again as the closing CTA comes
 * into view, so the bar is never sitting on top of the very button it duplicates.
 *
 * Two sentinels rather than a scroll handler: the browser does the geometry off the main
 * thread, and the only React work is the two state flips at the boundaries.
 */
export function StickyMobileCta({
  startRef,
  endRef,
  children,
}: {
  startRef: React.RefObject<HTMLElement | null>
  endRef: React.RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const [pastHero, setPastHero] = useState(false)
  const [atClosing, setAtClosing] = useState(false)
  const visible = pastHero && !atClosing

  useEffect(() => {
    const start = startRef.current
    const end = endRef.current
    if (!start || !end) return

    const startObserver = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    )
    const endObserver = new IntersectionObserver(([entry]) => setAtClosing(entry.isIntersecting), {
      threshold: 0,
    })

    startObserver.observe(start)
    endObserver.observe(end)
    return () => {
      startObserver.disconnect()
      endObserver.disconnect()
    }
  }, [startRef, endRef])

  return (
    <MotionDiv
      initial={false}
      animate={{ y: visible ? 0 : 96, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#081411]/92 px-4 py-3 backdrop-blur-xl lg:hidden"
      style={{ pointerEvents: visible ? "auto" : "none" }}
      aria-hidden={!visible}
      // aria-hidden and pointer-events:none both stop short of keyboard focus: the CTA button
      // inside `children` stays in tab order even while slid off-screen and invisible, so a
      // keyboard user tabbing through the page can land on a control they can't see. `inert`
      // (React 19, this repo's version) removes it from the tab order and blocks all
      // interaction whenever the bar is hidden, matching what aria-hidden already implies.
      inert={!visible}
    >
      {children}
    </MotionDiv>
  )
}
