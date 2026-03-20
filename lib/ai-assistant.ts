export type AssistantChatRole = "user" | "assistant"

export type AssistantChatMessage = {
  role: AssistantChatRole
  content: string
}

export type AssistantWorkspaceHint = {
  label: string
  detail: string
}

export type AssistantWorkspaceContext = {
  currentWorkspaceLabel?: string | null
  availableWorkspaces?: string[]
  workspaceHints?: AssistantWorkspaceHint[]
}

const MESSAGE_CONTENT_LIMIT = 2_000

export function sanitizeAssistantMessages(input: unknown, maxMessages = 10): AssistantChatMessage[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((message): message is { role?: unknown; content?: unknown } => Boolean(message) && typeof message === "object")
    .map((message) => {
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null
      const content = typeof message.content === "string" ? message.content.trim() : ""
      if (!role || !content) {
        return null
      }
      return {
        role,
        content: content.slice(0, MESSAGE_CONTENT_LIMIT),
      } satisfies AssistantChatMessage
    })
    .filter((message): message is AssistantChatMessage => Boolean(message))
    .slice(-maxMessages)
}

export function buildAssistantWorkspaceContextSummary(context: AssistantWorkspaceContext): string {
  const sections: string[] = []

  const currentWorkspaceLabel = context.currentWorkspaceLabel?.trim()
  if (currentWorkspaceLabel) {
    sections.push(`Current workspace: ${currentWorkspaceLabel}`)
  }

  const availableWorkspaces = (context.availableWorkspaces || []).map((workspace) => workspace.trim()).filter(Boolean)
  if (availableWorkspaces.length > 0) {
    sections.push(`Available workspaces in this session: ${availableWorkspaces.join(", ")}`)
  }

  const workspaceHints = (context.workspaceHints || [])
    .map((hint) => ({
      label: hint.label.trim(),
      detail: hint.detail.trim(),
    }))
    .filter((hint) => hint.label && hint.detail)

  if (workspaceHints.length > 0) {
    sections.push(
      "Navigation guidance:\n" +
        workspaceHints.map((hint) => `- ${hint.label}: ${hint.detail}`).join("\n"),
    )
  }

  return sections.join("\n")
}
