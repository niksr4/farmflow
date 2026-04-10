import "server-only"

import { NextResponse } from "next/server"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

const DEFAULT_ADMIN_FORBIDDEN_MESSAGES = ["Admin role required", "Unauthorized"]
const DEFAULT_OWNER_ADMIN_FORBIDDEN_MESSAGES = ["Admin role required", "Owner role required", "Unauthorized"]
const DATABASE_NOT_CONFIGURED_MESSAGE = "Database not configured"

// Messages that are safe to pass through to the client as-is (role/auth errors,
// not DB internals). sanitizeRouteError would block these since they're short
// known strings, but we list them explicitly to be defensive.
const PASSTHROUGH_MESSAGES = new Set([
  ...DEFAULT_ADMIN_FORBIDDEN_MESSAGES,
  ...DEFAULT_OWNER_ADMIN_FORBIDDEN_MESSAGES,
  DATABASE_NOT_CONFIGURED_MESSAGE,
])

type ErrorResponseOptions = {
  forbiddenMessages?: string[]
  statusByMessage?: Record<string, number>
  defaultStatus?: number
}

export const getErrorMessage = (error: unknown, fallback: string) => {
  const raw =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : ""
  const message = raw || fallback
  if (PASSTHROUGH_MESSAGES.has(message)) return message
  return sanitizeRouteError(error, fallback)
}

export const buildErrorResponse = (
  error: unknown,
  fallback: string,
  options: ErrorResponseOptions = {},
) => {
  const message = getErrorMessage(error, fallback)
  const status =
    options.statusByMessage?.[message] ??
    (options.forbiddenMessages?.includes(message) ? 403 : options.defaultStatus ?? 500)

  return NextResponse.json({ success: false, error: message }, { status })
}

export const buildAdminErrorResponse = (
  error: unknown,
  fallback: string,
  options: Omit<ErrorResponseOptions, "forbiddenMessages"> & { ownerRequired?: boolean } = {},
) =>
  buildErrorResponse(error, fallback, {
    ...options,
    forbiddenMessages: options.ownerRequired ? DEFAULT_OWNER_ADMIN_FORBIDDEN_MESSAGES : DEFAULT_ADMIN_FORBIDDEN_MESSAGES,
  })

export const databaseNotConfiguredResponse = () =>
  NextResponse.json({ success: false, error: DATABASE_NOT_CONFIGURED_MESSAGE }, { status: 500 })
