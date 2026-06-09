"use client"

import React from "react"
import { cn } from "@/lib/utils"

type Props = {
  content: string
  className?: string
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Matches **bold**, *italic*, `code` — in that precedence order
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const raw = match[0]
    if (raw.startsWith("**")) {
      parts.push(<strong key={match.index} className="font-semibold">{raw.slice(2, -2)}</strong>)
    } else if (raw.startsWith("`")) {
      parts.push(
        <code key={match.index} className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-700 dark:bg-white/10 dark:text-stone-300">
          {raw.slice(1, -1)}
        </code>
      )
    } else {
      parts.push(<em key={match.index}>{raw.slice(1, -1)}</em>)
    }
    last = match.index + raw.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function SimpleMarkdown({ content, className }: Props) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let bulletItems: React.ReactNode[] = []
  let numberedItems: React.ReactNode[] = []
  let paraLines: string[] = []

  const flushBullets = () => {
    if (bulletItems.length === 0) return
    elements.push(
      <ul key={elements.length} className="my-1 ml-4 list-disc space-y-0.5">
        {bulletItems}
      </ul>
    )
    bulletItems = []
  }

  const flushNumbered = () => {
    if (numberedItems.length === 0) return
    elements.push(
      <ol key={elements.length} className="my-1 ml-4 list-decimal space-y-0.5">
        {numberedItems}
      </ol>
    )
    numberedItems = []
  }

  const flushPara = () => {
    if (paraLines.length === 0) return
    elements.push(
      <p key={elements.length} className="leading-relaxed">
        {parseInline(paraLines.join(" "))}
      </p>
    )
    paraLines = []
  }

  for (const line of lines) {
    const t = line.trim()

    if (t.startsWith("### ")) {
      flushBullets(); flushNumbered(); flushPara()
      elements.push(<h3 key={elements.length} className="mt-2 mb-0.5 font-semibold">{parseInline(t.slice(4))}</h3>)
    } else if (t.startsWith("## ")) {
      flushBullets(); flushNumbered(); flushPara()
      elements.push(<h2 key={elements.length} className="mt-3 mb-1 text-base font-bold">{parseInline(t.slice(3))}</h2>)
    } else if (t.startsWith("# ")) {
      flushBullets(); flushNumbered(); flushPara()
      elements.push(<h1 key={elements.length} className="mt-3 mb-1 text-lg font-bold">{parseInline(t.slice(2))}</h1>)
    } else if (/^[-*•]\s+/.test(t)) {
      flushNumbered(); flushPara()
      bulletItems.push(
        <li key={bulletItems.length} className="leading-relaxed">
          {parseInline(t.replace(/^[-*•]\s+/, ""))}
        </li>
      )
    } else if (/^\d+\.\s/.test(t)) {
      flushBullets(); flushPara()
      numberedItems.push(
        <li key={numberedItems.length} className="leading-relaxed">
          {parseInline(t.replace(/^\d+\.\s+/, ""))}
        </li>
      )
    } else if (t === "") {
      flushBullets(); flushNumbered(); flushPara()
    } else {
      flushBullets(); flushNumbered()
      paraLines.push(t)
    }
  }

  flushBullets(); flushNumbered(); flushPara()

  return <div className={cn("space-y-1 text-sm", className)}>{elements}</div>
}
