"use client"

import Image from "next/image"

export default function BrandWatermark() {
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] text-slate-500/90 backdrop-blur">
      <Image src="/brand-mark.svg" alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm" />
      <span>FarmFlow</span>
    </div>
  )
}
