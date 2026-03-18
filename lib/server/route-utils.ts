import "server-only"

import { NextResponse } from "next/server"

const DEFAULT_ADMIN_FORBIDDEN_MESSAGES = ["Admin role required", "Unauthorized"]
const DEFAULT_OWNER_ADMIN_FORBIDDEN_MESSAGES = ["Admin role required", "Owner role required", "Unauthorized"]
const DATABASE_NOT_CONFIGURED_MESSAGE = "Database not configured"

type ErrorResponseOptions = {
  forbiddenMessages?: string[]
  statusByMessage?: Record<string, number>
  defaultStatus?: number
}

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  const maybeMessage =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message || "") : ""
  return maybeMessage || fallback
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
