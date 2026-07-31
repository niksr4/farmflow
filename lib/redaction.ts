/**
 * Pure redaction helpers, shared by server logging and by the Sentry `beforeSend` hooks.
 *
 * These live outside lib/server/safe-logging.ts deliberately: that module imports
 * @sentry/nextjs, and the Sentry config files cannot import it back without a module-init
 * cycle. They are also framework-free (no "server-only") so the browser SDK can scrub with
 * exactly the same rules the server uses — previously the client sent error text to Sentry
 * completely unredacted while the server was careful about it.
 */

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+\b/gi
const BASIC_PATTERN = /\bBasic\s+[A-Za-z0-9+/=]+\b/gi
const SECRET_QUERY_PATTERN =
  /\b([a-z0-9_-]*(?:token|secret|password|api[_-]?key|authorization)[a-z0-9_-]*)=([^&\s]+)/gi

export const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|api[_-]?key|email|phone|file_data_base64|normalized_email|twilio_auth_token/i

export const MAX_REDACTION_DEPTH = 4

export const redactText = (value: string) =>
  String(value || "")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(BASIC_PATTERN, "Basic [REDACTED]")
    .replace(SECRET_QUERY_PATTERN, "$1=[REDACTED]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")

export const redactValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value
  if (depth > MAX_REDACTION_DEPTH) return "[Truncated]"
  if (typeof value === "string") return redactText(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Error) return serializeError(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(entryValue, depth + 1),
      ]),
    )
  }
  return String(value)
}

export const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactText(error.message),
      stack: process.env.NODE_ENV === "production" ? undefined : redactText(error.stack || ""),
    }
  }
  return redactValue(error)
}
