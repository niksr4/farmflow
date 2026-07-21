import "server-only"

import { createHash, randomBytes } from "crypto"

// Called from a cron-triggered digest agent (no per-request tenant context) and from a public,
// unauthenticated feedback link (token is the only auth — the tenant isn't known until the
// token is looked up), so this uses the RLS-bypassing owner connection rather than app_runtime.
import { adminSql as sql } from "@/lib/server/db"
import { resolvePublicAppUrl } from "@/lib/server/onboarding/utils"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"

export type DigestFeedbackRating = "up" | "down"

export type DigestFeedbackLinks = { up: string; down: string }

const generateDigestFeedbackToken = () => randomBytes(32).toString("hex")

const hashDigestFeedbackToken = (token: string) =>
  createHash("sha256").update(`farmflow-digest-feedback:${String(token || "").trim()}`).digest("hex")

/**
 * Issues a fresh feedback token for this tenant's digest week and returns
 * thumbs up/down links to embed in the email. Replaces any prior token for
 * the same week. Returns null if the database is unavailable — digest
 * sending should never fail because of this.
 */
export async function createDigestFeedbackLinks(tenantId: string, weekStart: string): Promise<DigestFeedbackLinks | null> {
  if (!sql) return null
  try {
    const token = generateDigestFeedbackToken()
    const tokenHash = hashDigestFeedbackToken(token)

    await sql.query(
      `INSERT INTO digest_feedback (tenant_id, week_start, token_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, week_start) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         rating = NULL,
         rated_at = NULL`,
      [tenantId, weekStart, tokenHash],
    )

    const baseUrl = resolvePublicAppUrl()
    return {
      up: `${baseUrl}/api/digest/feedback?token=${token}&rating=up`,
      down: `${baseUrl}/api/digest/feedback?token=${token}&rating=down`,
    }
  } catch (error) {
    logServerWarning("Failed to create digest feedback links", error)
    return null
  }
}

/** Records a thumbs up/down for the digest the token was issued for. Returns false if the token is unknown or expired. */
export async function recordDigestFeedback(token: string, rating: DigestFeedbackRating): Promise<boolean> {
  if (!sql) return false
  try {
    const tokenHash = hashDigestFeedbackToken(token)
    const result = await sql.query(
      `UPDATE digest_feedback SET rating = $1, rated_at = now() WHERE token_hash = $2 RETURNING id`,
      [rating, tokenHash],
    )
    const rows = Array.isArray(result) ? result : (result as any)?.rows ?? []
    return rows.length > 0
  } catch (error) {
    logServerError("Failed to record digest feedback", error)
    return false
  }
}
