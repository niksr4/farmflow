import "server-only"

const INTERNAL_PATTERNS =
  /sql|query|column|relation|constraint|connect|econnrefused|prisma|neon|postgres|pg_|syntax error|parse error|invalid input syntax|operator does not exist|function.*does not exist/i

/**
 * Returns a safe, user-facing error message.
 * Blocks DB internals, stack traces, and overly long strings from reaching the browser.
 */
export function sanitizeRouteError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || "")
  if (!message || message.length > 200 || INTERNAL_PATTERNS.test(message)) {
    return fallback
  }
  return message
}
