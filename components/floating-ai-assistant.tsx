"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowRight, Brain, Loader2, Minimize2, SendHorizontal, Sparkles, X } from "lucide-react"

import AssistantResponseCards from "@/components/assistant-response-cards"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { parseJsonResponse } from "@/components/inventory-system/utils"
import { useAuth } from "@/hooks/use-auth"
import {
  buildAssistantWorkspaceContextFromModules,
  sanitizeAssistantActionLinks,
  sanitizeAssistantSearchResults,
  type AssistantChatMessage,
  type AssistantWorkspaceHint,
} from "@/lib/ai-assistant"
import { ASSISTANT_PROMPT_EVENT, type AssistantPromptEventDetail } from "@/lib/assistant-events"
import { appendOwnerPreviewContext, normalizeOwnerPreviewContext } from "@/lib/owner-preview"
import { cn } from "@/lib/utils"

const APP_PATH_PREFIXES = ["/dashboard", "/settings", "/welcome"]

const STARTER_PROMPTS = [
  "What should I check first in the estate data today?",
  "Why can dispatched KGs and sold KGs be different?",
  "Where do I update locations or account activities?",
  "Find fertilizer stock or expense records for me.",
]

const DASHBOARD_TAB_LABELS: Record<string, string> = {
  home: "Dashboard",
  launcher: "Dashboard",
  inventory: "Inventory",
  transactions: "Inventory",
  accounts: "Accounts",
  processing: "Pulping",
  pepper: "Pulping",
  dispatch: "Dispatch",
  sales: "Sales",
  "other-sales": "Sales",
  receivables: "Receivables",
  rainfall: "Rainfall",
  weather: "Rainfall",
  season: "Season",
  journal: "Journal",
  "ai-analysis": "AI Analysis",
  "balance-sheet": "Balance Sheet",
  documents: "Documents",
}

const normalizeModuleIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry
      }
      if (entry && typeof entry === "object") {
        const source = entry as { id?: unknown; enabled?: unknown }
        if (source.enabled === false) {
          return ""
        }
        return typeof source.id === "string" ? source.id : ""
      }
      return ""
    })
    .map((moduleId) => String(moduleId || "").trim())
    .filter(Boolean)
}

const resolveWorkspaceLabel = (pathname: string, searchParams: { get: (key: string) => string | null }) => {
  if (pathname.startsWith("/settings")) return "Settings"
  if (pathname.startsWith("/welcome")) return "Welcome Setup"
  if (pathname.startsWith("/dashboard")) {
    const tab = String(searchParams.get("tab") || "").trim().toLowerCase()
    return DASHBOARD_TAB_LABELS[tab] || "Dashboard"
  }
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
  const [availableWorkspaces, setAvailableWorkspaces] = useState<string[]>([])
  const [workspaceHints, setWorkspaceHints] = useState<AssistantWorkspaceHint[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const previewTenantId = (searchParams.get("previewTenantId") || "").trim()
  const previewRole = (searchParams.get("previewRole") || "").trim().toLowerCase()
  const previewTenantName = (searchParams.get("previewTenantName") || "").trim()
  const ownerPreviewContext = useMemo(
    () =>
      normalizeOwnerPreviewContext({
        previewTenantId,
        previewRole,
        previewTenantName,
      }),
    [previewRole, previewTenantId, previewTenantName],
  )
  const hasOwnerPreview = Boolean(ownerPreviewContext)
  const isAppPage = APP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const effectiveAssistantRole = ownerPreviewContext?.previewRole || user?.role || ""
  const helperLabel = useMemo(() => resolveWorkspaceLabel(pathname, searchParams), [pathname, searchParams])
  const visibleWorkspaces = useMemo(() => availableWorkspaces.filter(Boolean).slice(0, 6), [availableWorkspaces])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [isOpen, isSending, messages])

  useEffect(() => {
    if (!isEnabled) return

    const handleAssistantPromptEvent = (rawEvent: Event) => {
      const detail = (rawEvent as CustomEvent<AssistantPromptEventDetail>).detail || {}
      const nextPrompt = String(detail.prompt || "").trim()

      setIsOpen(true)
      setError("")
      if (nextPrompt) {
        setDraft(nextPrompt)
      }
    }

    window.addEventListener(ASSISTANT_PROMPT_EVENT, handleAssistantPromptEvent as EventListener)
    return () => {
      window.removeEventListener(ASSISTANT_PROMPT_EVENT, handleAssistantPromptEvent as EventListener)
    }
  }, [isEnabled])

  useEffect(() => {
    let cancelled = false

    const resolveVisibility = async () => {
      if (status !== "authenticated" || !user || !isAppPage) {
        if (!cancelled) {
          setIsEnabled(false)
          setAvailableWorkspaces([])
          setWorkspaceHints([])
          setHasResolvedVisibility(true)
        }
        return
      }

      const isOwnerPreview = user.role === "owner" && Boolean(ownerPreviewContext)
      if (user.role === "owner" && !isOwnerPreview) {
        if (!cancelled) {
          setIsEnabled(false)
          setAvailableWorkspaces([])
          setWorkspaceHints([])
          setHasResolvedVisibility(true)
        }
        return
      }

      try {
        const response = await fetch(
          isOwnerPreview && ownerPreviewContext
            ? `/api/admin/tenant-modules?tenantId=${encodeURIComponent(ownerPreviewContext.previewTenantId)}`
            : "/api/tenant-modules",
          { cache: "no-store" },
        )
        const data = await response.json().catch(() => null)
        if (cancelled) return
        const modules = normalizeModuleIds(data?.modules)
        const assistantContext = buildAssistantWorkspaceContextFromModules(modules, effectiveAssistantRole)
        setAvailableWorkspaces(assistantContext.availableWorkspaces)
        setWorkspaceHints(assistantContext.workspaceHints)
        setIsEnabled(Boolean(response.ok && data?.success && (modules.includes("ai-analysis") || modules.includes("accounts"))))
      } catch {
        if (!cancelled) {
          setIsEnabled(false)
          setAvailableWorkspaces([])
          setWorkspaceHints([])
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
  }, [effectiveAssistantRole, isAppPage, ownerPreviewContext, status, user])

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
          currentWorkspaceLabel: helperLabel,
          availableWorkspaces,
          workspaceHints,
          previewRole: ownerPreviewContext?.previewRole,
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
          actions: sanitizeAssistantActionLinks(json.actions),
          results: sanitizeAssistantSearchResults(json.results),
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
  const resolveAssistantHref = (href: string) => appendOwnerPreviewContext(href, ownerPreviewContext)

  if (!isAppPage || status !== "authenticated" || !user || !hasResolvedVisibility || !isEnabled) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <div className="w-[min(26rem,calc(100vw-1rem))] overflow-hidden rounded-[30px] border border-emerald-100 bg-[linear-gradient(180deg,#f7fdf9_0%,#ffffff_58%)] shadow-[0_22px_70px_-30px_rgba(14,93,82,0.45)]">
          <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-[linear-gradient(135deg,#f5fbf8_0%,#ffffff_70%)] px-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Brain className="h-4 w-4 text-emerald-700" />
                FarmFlow Assistant
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Ask about tenant data or where to find things in {helperLabel}.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white px-3 py-1 text-emerald-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Grounded in tenant data
                </span>
              </div>
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

          <div
            ref={scrollRef}
            className="max-h-[24rem] min-h-[16rem] space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(236,253,245,0.5)_0%,rgba(250,250,249,0.75)_50%,rgba(255,255,255,0.95)_100%)] px-4 py-4"
          >
            {messages.length === 0 ? (
              <>
                <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    Start with a focused question
                  </div>
                  <p className="mt-2 leading-6">Ask about discrepancies, stock, sales, or where something lives in the app.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="outline"
                      onClick={() => void submitPrompt(prompt)}
                      className="h-auto w-full justify-start rounded-2xl border-emerald-100 bg-white px-3 py-3 text-left text-sm text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span className="min-w-0 break-words leading-5">{prompt}</span>
                      </span>
                    </Button>
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
                  {message.role === "assistant" ? (
                    <AssistantResponseCards
                      actions={message.actions}
                      results={message.results}
                      resolveHref={resolveAssistantHref}
                      className="mt-3"
                    />
                  ) : null}
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

          <div className="border-t border-emerald-100 bg-white px-4 py-4">
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
        className="flex h-14 items-center gap-3 rounded-full border border-emerald-200 bg-white px-5 text-sm font-semibold text-emerald-900 shadow-[0_18px_40px_-20px_rgba(14,93,82,0.35)] transition-colors hover:border-emerald-300 hover:bg-emerald-50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
          <Brain className="h-4 w-4" />
        </span>
        Ask FarmFlow
      </button>
    </div>
  )
}
