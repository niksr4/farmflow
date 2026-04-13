import "server-only"

import * as Sentry from "@sentry/nextjs"

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+\b/gi
const BASIC_PATTERN = /\bBasic\s+[A-Za-z0-9+/=]+\b/gi
const SECRET_QUERY_PATTERN = /\b([a-z0-9_-]*(?:token|secret|password|api[_-]?key|authorization)[a-z0-9_-]*)=([^&\s]+)/gi
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|api[_-]?key|email|phone|file_data_base64|normalized_email|twilio_auth_token/i

const MAX_DEPTH = 4

export const redactText = (value: string) =>
  String(value || "")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(BASIC_PATTERN, "Basic [REDACTED]")
    .replace(SECRET_QUERY_PATTERN, "$1=[REDACTED]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")

export const redactForLogs = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value
  if (depth > MAX_DEPTH) return "[Truncated]"
  if (typeof value === "string") return redactText(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Error) {
    return serializeErrorForLogs(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForLogs(item, depth + 1))
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactForLogs(entryValue, depth + 1),
      ]),
    )
  }
  return String(value)
}

export const serializeErrorForLogs = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactText(error.message),
      stack: process.env.NODE_ENV === "production" ? undefined : redactText(error.stack || ""),
    }
  }
  return redactForLogs(error)
}

export const logServerWarning = (message: string, details?: unknown) => {
  if (details === undefined) {
    console.warn(message)
    return
  }
  console.warn(message, redactForLogs(details))
}

export const logServerError = (message: string, details?: unknown) => {
  if (details === undefined) {
    console.error(message)
  } else {
    console.error(message, redactForLogs(details))
  }
  // Forward to Sentry so server-side errors appear in the issues dashboard.
  // Wrap in try/catch so a Sentry failure never breaks the caller.
  try {
    const error = details instanceof Error ? details : new Error(message)
    Sentry.captureException(error, { extra: { message } })
  } catch {
    // non-fatal
  }
}

