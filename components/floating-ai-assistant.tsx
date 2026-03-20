"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Brain, Loader2, Minimize2, SendHorizontal, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { parseJsonResponse } from "@/components/inventory-system/utils"
import { useAuth } from "@/hooks/use-auth"
import type { AssistantChatMessage, AssistantWorkspaceHint } from "@/lib/ai-assistant"
import { cn } from "@/lib/utils"

const APP_PATH_PREFIXES = ["/dashboard", "/settings", "/welcome"]
const AVAILABLE_WORKSPACES = [
  "Dashboard",
  "Inventory",
  "Processing",
  "Dispatch",
  "Sales",
  "Accounts",
  "Settings",
  "AI Analysis",
]
const WORKSPACE_HINTS: AssistantWorkspaceHint[] = [
  { label: "Dashboard", detail: "Use Dashboard for the estate overview, alerts, and top-level revenue cards." },
  { label: "Inventory", detail: "Use Inventory for stock balances and the Transaction History button for movement records." },
  { label: "Processing", detail: "Use Processing for crop intake, ripe totals, and dry output by location." },
  { label: "Dispatch", detail: "Use Dispatch to record coffee sent out and later update KGs Received." },
  { label: "Sales", detail: "Use Sales for coffee sales and the Other Sales button inside that workspace when needed." },
  { label: "Accounts", detail: "Use Accounts for labor, expenses, and account activities." },
  { label: "Settings", detail: "Use Settings for locations, users, bag weight, and tenant defaults." },
]

const STARTER_PROMPTS = [
  "What should I check first in the estate data today?",
  "Why can dispatched KGs and sold KGs be different?",
  "Where do I update locations or account activities?",
]

const resolveWorkspaceLabel = (pathname: string) => {
  if (pathname.startsWith("/settings")) return "Settings"
  if (pathname.startsWith("/welcome")) return "Welcome Setup"
  return "Dashboard"
}

export default function FloatingAiAssistant() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, status } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<AssistantChatMessage[]>([])
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [hasResolvedVisibility, setHasResolvedVisibility] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const hasOwnerPreview = Boolean(searchParams.get("previewTenantId") && searchParams.get("previewRole"))
  const isAppPage = APP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [isOpen, isSending, messages])

  useEffect(() => {
    let cancelled = false

    const resolveVisibility = async () => {
      if (status !== "authenticated" || !user || !isAppPage) {
        if (!cancelled) {
          setIsEnabled(false)
          setHasResolvedVisibility(true)
        }
        return
      }

      if (user.role === "owner") {
        if (!cancelled) {
          setIsEnabled(hasOwnerPreview)
          setHasResolvedVisibility(true)
        }
        return
      }

      try {
        const response = await fetch("/api/tenant-modules", { cache: "no-store" })
        const data = await response.json().catch(() => null)
        if (cancelled) return
        setIsEnabled(Boolean(response.ok && data?.success && Array.isArray(data.modules) && data.modules.includes("ai-analysis")))
      } catch {
        if (!cancelled) {
          setIsEnabled(false)
        }
      } finally {
        if (!cancelled) {
          setHasResolvedVisibility(true)
        }
      }
    }

    void resolveVisibility()
    return () => {
      cancelled = true
    }
  }, [hasOwnerPreview, isAppPage, status, user])

  const submitPrompt = async (prompt: string) => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isSending) return

    const nextMessages = [...messages, { role: "user" as const, content: trimmedPrompt }]
    setMessages(nextMessages)
    setDraft("")
    setError("")
    setIsSending(true)

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          currentWorkspaceLabel: resolveWorkspaceLabel(pathname),
          availableWorkspaces: AVAILABLE_WORKSPACES,
          workspaceHints: WORKSPACE_HINTS,
        }),
      })

      const { json } = await parseJsonResponse(response)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "FarmFlow Assistant could not answer right now.")
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: String(json.answer || "I could not find a useful answer from the current tenant data."),
        },
      ])
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "FarmFlow Assistant could not answer right now."
      setError(message)
      setDraft(trimmedPrompt)
    } finally {
      setIsSending(false)
    }
  }

  const helperLabel = useMemo(() => resolveWorkspaceLabel(pathname), [pathname])

  if (!isAppPage || status !== "authenticated" || !user || !hasResolvedVisibility || !isEnabled) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <div className="w-[min(26rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_22px_70px_-30px_rgba(14,93,82,0.45)]">
          <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-[linear-gradient(135deg,#f5fbf8_0%,#ffffff_70%)] px-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Brain className="h-4 w-4 text-emerald-700" />
                FarmFlow Assistant
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Ask about tenant data or where to find things in {helperLabel}.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Minimize assistant"
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setIsOpen(false)}
              >
                <Minimize2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Close assistant"
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={() => {
                  setIsOpen(false)
                  setDraft("")
                  setError("")
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="max-h-[24rem] min-h-[16rem] space-y-3 overflow-y-auto bg-stone-50/70 px-4 py-4">
            {messages.length === 0 ? (
              <>
                <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-600">
                  Ask about discrepancies, stock, sales, or where something lives in the app.
                </div>
                <div className="flex flex-wrap gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void submitPrompt(prompt)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                    message.role === "user"
                      ? "ml-auto bg-emerald-700 text-white"
                      : "mr-auto border border-slate-200 bg-white text-slate-800",
                  )}
                >
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">
                    {message.role === "user" ? "You" : "Assistant"}
                  </div>
                  <div className="whitespace-pre-line leading-6">{message.content}</div>
                </div>
              ))
            )}
            {isSending ? (
              <div className="mr-auto flex max-w-[90%] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking through the current estate data...
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-4">
            {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void submitPrompt(draft)
                }
              }}
              rows={4}
              placeholder="Ask about your data or where to find something..."
              className="min-h-[7rem] resize-none"
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">Shift+Enter for a new line.</div>
              <Button
                onClick={() => void submitPrompt(draft)}
                disabled={isSending || !draft.trim()}
                className="bg-emerald-700 hover:bg-emerald-800"
              >
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizontal className="mr-2 h-4 w-4" />}
                Ask Assistant
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-14 items-center gap-3 rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(14,93,82,0.7)] transition-colors hover:bg-emerald-800"
      >
        <Brain className="h-4 w-4" />
        Ask FarmFlow
      </button>
    </div>
  )
}
