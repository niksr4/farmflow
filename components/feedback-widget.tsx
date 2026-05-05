"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageCircle, X, Bug, HelpCircle, Lightbulb, MessageSquare, CheckCircle2, BookOpen, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { DEFAULT_SUPPORT_EMAIL } from "@/lib/email-addresses"

type FeedbackType = "bug" | "question" | "suggestion" | "other"

const TYPES: Array<{ value: FeedbackType; label: string; icon: React.ElementType; color: string }> = [
  { value: "bug",        label: "Found a bug",       icon: Bug,          color: "text-rose-600 bg-rose-50 border-rose-200" },
  { value: "question",   label: "Need help",          icon: HelpCircle,   color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "suggestion", label: "Suggestion",         icon: Lightbulb,    color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "other",      label: "Other",              icon: MessageSquare, color: "text-neutral-600 bg-neutral-50 border-neutral-200" },
]

type Props = { currentTab?: string }

export default function FeedbackWidget({ currentTab }: Props) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>("question")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const reset = useCallback(() => {
    setMessage("")
    setType("question")
    setDone(false)
    setError("")
  }, [])

  const handleOpen = useCallback(() => {
    reset()
    setOpen(true)
  }, [reset])

  // Allow other parts of the app to open this widget via a custom event
  useEffect(() => {
    const handler = () => handleOpen()
    window.addEventListener("farmflow:open-feedback", handler)
    return () => window.removeEventListener("farmflow:open-feedback", handler)
  }, [handleOpen])

  const handleSubmit = async () => {
    if (!message.trim() || message.trim().length < 5 || submitting) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), pageContext: currentTab }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send")
      setDone(true)
    } catch (e: any) {
      setError(e.message || `Something went wrong. Email us directly at ${DEFAULT_SUPPORT_EMAIL}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed bottom-[136px] left-4 z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] animate-in fade-in slide-in-from-bottom-2 duration-200 sm:bottom-[88px] sm:left-24">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-800">Help &amp; Feedback</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            /* Success state */
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800">Got it — thank you!</p>
                <p className="mt-1 text-xs text-neutral-500">We'll look into it and reply if needed.</p>
              </div>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => { reset(); setOpen(false) }}>
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {/* Type picker */}
              <div className="grid grid-cols-2 gap-1.5">
                {TYPES.map(({ value, label, icon: Icon, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors",
                      type === value ? color : "border-black/8 bg-neutral-50 text-neutral-600 hover:bg-neutral-100",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Message */}
              <Textarea
                placeholder={
                  type === "bug"
                    ? "Describe what happened and what you expected…"
                    : type === "question"
                      ? "What do you need help with?"
                      : type === "suggestion"
                        ? "What would make FarmFlow more useful for you?"
                        : "Tell us what's on your mind…"
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />

              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </p>
              )}

              <Button
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                size="sm"
                disabled={!message.trim() || message.trim().length < 5 || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Sending…" : "Send feedback"}
              </Button>

              {/* Help links */}
              <div className="border-t border-black/5 pt-3 space-y-2">
                <Link
                  href="/manuals"
                  target="_blank"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5 text-neutral-400" />
                  Open training manuals
                </Link>
                <a
                  href={`mailto:${DEFAULT_SUPPORT_EMAIL}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-neutral-400" />
                  {DEFAULT_SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating trigger — desktop: right of 76px sidebar, aligned with AI assistant baseline.
          Mobile: elevated above the 60px bottom nav bar on the left. */}
      <div className="fixed bottom-[72px] left-4 z-50 sm:bottom-6 sm:left-24">
        <button
          type="button"
          onClick={open ? () => setOpen(false) : handleOpen}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_8px_24px_-8px_rgba(0,0,0,0.2)] transition-all",
            open
              ? "border-neutral-300 bg-neutral-100 text-neutral-600"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700",
          )}
          aria-label="Help and feedback"
        >
          {open ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        </button>
      </div>
    </>
  )
}
