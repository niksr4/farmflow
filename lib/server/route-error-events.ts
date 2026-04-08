import "server-only"

import { logAppErrorEvent } from "@/lib/server/error-events"

type RouteMutationFailureInput = {
  tenantId?: string | null
  source: string
  endpoint: string
  action: string
  error: unknown
  metadata?: Record<string, unknown>
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message
  }
  return String(error || "Unknown error")
}

const getErrorCode = (error: unknown) => {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code
    return code == null ? null : String(code)
  }
  return null
}

const getErrorName = (error: unknown) => {
  if (error instanceof Error && error.name) return error.name
  if (typeof error === "object" && error && "name" in error) {
    const name = (error as { name?: unknown }).name
    return name == null ? null : String(name)
  }
  return null
}

export async function logRouteMutationFailure(input: RouteMutationFailureInput) {
  const message = getErrorMessage(input.error)
  const errorCode = getErrorCode(input.error)
  const errorName = getErrorName(input.error)
  try {
    await logAppErrorEvent({
      tenantId: input.tenantId || null,
      source: input.source,
      endpoint: input.endpoint,
      errorCode: `${input.action}_failed`,
      severity: "error",
      message,
      metadata: {
        action: input.action,
        errorCode,
        errorName,
        ...input.metadata,
      },
    })
  } catch (loggingError) {
    console.error("Failed to persist route mutation failure", loggingError)
  }
}
