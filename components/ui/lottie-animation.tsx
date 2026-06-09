"use client"

import dynamic from "next/dynamic"
import type { LottieComponentProps } from "lottie-react"

// Loaded client-side only — lottie-react accesses the DOM on mount
const Lottie = dynamic(() => import("lottie-react"), { ssr: false })

type Props = {
  animationData: object
  className?: string
  loop?: boolean
  autoplay?: boolean
  style?: React.CSSProperties
}

export default function LottieAnimation({
  animationData,
  className,
  loop = true,
  autoplay = true,
  style,
}: Props) {
  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoplay={autoplay}
      className={className}
      style={style}
    />
  )
}
