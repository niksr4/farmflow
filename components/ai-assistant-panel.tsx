"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Brain, Loader2, SendHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { parseJsonResponse } from "@/components/inventory-system/utils"
import type { AssistantChatMessage, AssistantWorkspaceHint } from "@/lib/ai-assistant"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import { cn } from "@/lib/utils"

type AiAssistantPanelProps = {
  inventory: InventoryItem[]
  transactions: Transaction[]
  currentWorkspaceLabel: string
  availableWorkspaces: string[]
  workspaceHints: AssistantWorkspaceHint[]
  fiscalYearLabel: string
}

const STARTER_PROMPTS = [
  "What should I look at first in my estate data today?",
  "Why can dispatched KGs and sold KGs be different?",
  "Which workspace should I use to update locations or account activities?",
]

export default function AiAssistantPanel({
  inventory,
  transactions,
  currentWorkspaceLabel,
  availableWorkspaces,
  workspaceHints,
  fiscalYearLabel,
}: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState("")
  const messagesRef = useRef<HTMLDivElement | null>(null)

  const visibleWorkspaces = useMemo(() => availableWorkspaces.filter(Boolean).slice(0, 8), [availableWorkspaces])

  useEffect(() => {
    const container = messagesRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, isSending])

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
          inventory,
          transactions: transactions.slice(0, 75),
          currentWorkspaceLabel,
          availableWorkspaces,
          workspaceHints,
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

  return (
    <Card className="border-border/70 bg-white/90">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-emerald-700" />
              FarmFlow Assistant
            </CardTitle>
            <CardDescription>
              Ask about tenant data, exceptions, or where to find actions in the app. Answers stay grounded to the current estate and visible workspaces.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-800">
              {fiscalYearLabel}
            </Badge>
            {visibleWorkspaces.map((workspace) => (
              <Badge key={workspace} variant="outline" className="bg-white">
                {workspace}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          ref={messagesRef}
          className="max-h-[26rem] min-h-[18rem] space-y-3 overflow-y-auto rounded-2xl border border-border/60 bg-stone-50/70 p-4"
        >
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 text-sm text-muted-foreground">
                Start with a question about this estate&apos;s data, or ask where something lives in FarmFlow. The assistant knows you are currently in <span className="font-medium text-foreground">{currentWorkspaceLabel}</span>.
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void submitPrompt(prompt)}
                    className="rounded-full border border-border bg-white px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
                className={cn(
                  "max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                  message.role === "user"
                    ? "ml-auto bg-emerald-700 text-white"
                    : "mr-auto border border-border/60 bg-white text-foreground",
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
            <div className="mr-auto flex max-w-[92%] items-center gap-2 rounded-2xl border border-border/60 bg-white px-4 py-3 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking through the current estate data...
            </div>
          ) : null}
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <div className="space-y-3 rounded-2xl border border-border/60 bg-white p-3">
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
            placeholder="Ask about a discrepancy, a trend, or where something lives in FarmFlow..."
            className="min-h-[7.5rem] resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Shift+Enter for a new line. The assistant uses the current tenant data and visible workspace labels.
            </div>
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
      </CardContent>
    </Card>
  )
}
