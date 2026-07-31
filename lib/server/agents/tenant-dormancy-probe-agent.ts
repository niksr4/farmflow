import "server-only"

import { DEFAULT_AUTH_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
// This agent runs from cron across every tenant, not inside a per-request handler, so it uses
// the RLS-bypassing owner connection rather than app_runtime, which requires a per-request
// app.tenant_id session context this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { fetchTenantActivitySignals, evaluateProbeDormancy } from "@/lib/server/agents/tenant-dormancy"

// Dormancy probe — sent to a tenant's admin when NOBODY in that tenant has
// logged in for DORMANCY_PROBE_THRESHOLD_DAYS. Login (not transaction volume) is
// the signal: a quiet week of data entry can just mean off-season, but if
// no one from the estate has even opened the app, that's worth checking in on.
//
// Sent once per "dormancy episode" — if the tenant logs in again and later
// goes quiet a second time, that's a new episode and gets a new probe.
// tenant_smoke signs in as the tenant's REAL admin account (there's no
// tenantsmoke_* username on the login itself, only on the throwaway user it
// creates/deletes), so its logins are excluded via security_events.source =
// 'tenant-smoke-agent' (set in lib/auth.ts), not by username pattern alone.
//
// The dormancy signal itself now lives in lib/server/agents/tenant-dormancy.ts so the
// weekly digest reads the same state and stands down for tenants this agent is probing.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thefarmflow.in"

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

type DormantCandidate = {
  tenantId: string
  tenantName: string
  recipientEmail: string
  recipientName: string
  daysSinceLastLogin: number
  lastLoginAt: Date | null
}

async function fetchDormantCandidates(): Promise<DormantCandidate[]> {
  if (!sql) return []

  // Activity/episode state comes from the shared module; this query only resolves who to
  // write to. Note the recipient here is the tenant's admin, which is deliberately narrower
  // than the digest's owner-or-admin lookup — a re-engagement nudge goes to the estate's
  // own admin, not to an owner account that may sit above several tenants.
  const [signals, recipientResult] = await Promise.all([
    fetchTenantActivitySignals(),
    sql.query(`
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        COALESCE(
          NULLIF(BTRIM(recipient.digest_email), ''),
          CASE WHEN recipient.email_verified_at IS NOT NULL THEN NULLIF(BTRIM(recipient.email), '') END
        ) AS recipient_email,
        COALESCE(recipient.username, recipient.email) AS recipient_name
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT u.username, u.email, u.digest_email, u.email_verified_at
        FROM users u
        WHERE u.tenant_id = t.id
          AND u.role = 'admin'
          AND COALESCE(
            NULLIF(BTRIM(u.digest_email), ''),
            CASE WHEN u.email_verified_at IS NOT NULL THEN NULLIF(BTRIM(u.email), '') END
          ) IS NOT NULL
        ORDER BY u.created_at ASC
        LIMIT 1
      ) recipient ON TRUE
      WHERE t.parent_tenant_id IS NULL
    `),
  ])

  const candidates: DormantCandidate[] = []

  for (const row of toRows<any>(recipientResult)) {
    const recipientEmail = row.recipient_email ? String(row.recipient_email) : null
    if (!recipientEmail) continue // no verified admin email to notify — skip

    const signal = signals.get(String(row.tenant_id))
    if (!signal) continue

    const { dormant, daysSinceLastLogin, alreadyProbedThisEpisode } = evaluateProbeDormancy(signal)
    if (!dormant) continue
    if (alreadyProbedThisEpisode) continue

    candidates.push({
      tenantId: signal.tenantId,
      tenantName: String(row.tenant_name || "your estate"),
      recipientEmail,
      recipientName: String(row.recipient_name || "there"),
      daysSinceLastLogin,
      lastLoginAt: signal.lastLoginAt,
    })
  }

  return candidates
}

async function markProbeSent(tenantId: string, lastLoginAt: Date | null): Promise<void> {
  if (!sql) return
  await sql.query(
    `INSERT INTO tenant_dormancy_probes (tenant_id, last_probe_sent_at, last_known_activity_at)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (tenant_id) DO UPDATE
       SET last_probe_sent_at = NOW(), last_known_activity_at = $2`,
    [tenantId, lastLoginAt],
  )
}

function buildProbeEmail(candidate: DormantCandidate): { subject: string; html: string; text: string } {
  const firstName = candidate.recipientName.split(" ")[0] || "there"
  const loginUrl = APP_URL
  const subject = `Haven't seen you in a few days — ${candidate.tenantName}`

  const text = [
    `Hi ${firstName},`,
    ``,
    `Nobody's logged into FarmFlow for ${candidate.tenantName} in about ${candidate.daysSinceLastLogin} days.`,
    ``,
    `No pressure if it's been a quiet stretch on the estate — just checking in case something's blocking you, or you need a hand with anything.`,
    ``,
    `Log in here: ${loginUrl}`,
    ``,
    `If anything isn't working the way you'd expect, just reply to this email.`,
    ``,
    `— The FarmFlow team`,
  ].join("\n")

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#f9fafb;">FarmFlow</p>
          <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Estate management for coffee &amp; pepper growers</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="margin:0 0 16px;font-size:15px;color:#111827;">Hi ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
            Nobody's logged into FarmFlow for <strong>${candidate.tenantName}</strong> in about ${candidate.daysSinceLastLogin} days.
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
            No pressure if it's been a quiet stretch on the estate — just checking in case something's blocking you, or you need a hand with anything.
          </p>

          <p style="margin:0 0 32px;text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#17633f;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
              Open my workspace
            </a>
          </p>

          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
            If anything isn't working the way you'd expect, just reply to this email.
          </p>
        </td></tr>

        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You're receiving this because you're an admin on this FarmFlow estate.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

export async function runTenantDormancyProbeAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
}): Promise<{
  candidates: number
  probesSent: number
  dryRun: boolean
}> {
  const dryRun = Boolean(input?.dryRun)

  let candidates: DormantCandidate[] = []
  try {
    candidates = await fetchDormantCandidates()
  } catch (error) {
    logServerError("tenant-dormancy-probe: failed to fetch candidates", error)
    return { candidates: 0, probesSent: 0, dryRun }
  }

  if (candidates.length === 0) {
    return { candidates: 0, probesSent: 0, dryRun }
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = String(process.env.AUTH_EMAIL_FROM || DEFAULT_AUTH_EMAIL_FROM).trim()

  let probesSent = 0

  for (const candidate of candidates) {
    const { subject, html, text } = buildProbeEmail(candidate)

    if (dryRun) {
      probesSent++
      continue
    }

    if (!resendKey || !from) {
      logServerWarning("tenant-dormancy-probe: email not configured, skipping", { tenantId: candidate.tenantId })
      continue
    }

    try {
      const response = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [candidate.recipientEmail],
          bcc: [EMAIL_BCC_MONITORING],
          subject,
          text,
          html,
        }),
        timeoutMs: 10_000,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        logServerWarning("tenant-dormancy-probe: email send failed", {
          status: response.status,
          body,
          tenantId: candidate.tenantId,
        })
        continue
      }
      await markProbeSent(candidate.tenantId, candidate.lastLoginAt)
      probesSent++
    } catch (error) {
      logServerError("tenant-dormancy-probe: send error", error)
    }
  }

  return { candidates: candidates.length, probesSent, dryRun }
}
