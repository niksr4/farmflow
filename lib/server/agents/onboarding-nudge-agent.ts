import "server-only"

import { DEFAULT_AUTH_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
// This agent runs from cron across every tenant, not inside a per-request handler, so it uses
// the RLS-bypassing owner connection rather than app_runtime, which requires a per-request
// app.tenant_id session context this code never has.
import { adminSql as sql } from "@/lib/server/db"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"

// Nudge 1 — sent 3 days after provisioning if setup is still incomplete
// Nudge 2 — sent 7 days after nudge 1 if setup is still incomplete
// Cap at 2 nudges total to avoid spam

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thefarmflow.in"

type NudgeCandidate = {
  signupRequestId: string
  email: string
  name: string
  estateName: string
  tenantId: string
  nudgeNumber: 1 | 2
}

async function fetchNudgeCandidates(): Promise<NudgeCandidate[]> {
  if (!sql) return []
  try {
    const result = await sql.query(`
      SELECT
        sr.id            AS signup_request_id,
        sr.email,
        sr.name,
        sr.estate_name,
        sr.tenant_id,
        sr.nudge_sent_at,
        sr.nudge_2_sent_at
      FROM signup_requests sr
      WHERE sr.status = 'provisioned'
        AND EXISTS (
          SELECT 1 FROM users u
          WHERE u.tenant_id = sr.tenant_id
            AND u.role = 'admin'
            AND u.setup_completed_at IS NULL
            AND u.requires_guided_setup = TRUE
        )
        AND sr.provisioned_at >= NOW() - INTERVAL '60 days'
        AND sr.email IS NOT NULL
        AND (
          -- Nudge 1: not yet sent, provisioned 3+ days ago
          (sr.nudge_sent_at IS NULL AND sr.provisioned_at <= NOW() - INTERVAL '3 days')
          OR
          -- Nudge 2: nudge 1 sent 7+ days ago, nudge 2 not yet sent
          (sr.nudge_sent_at IS NOT NULL AND sr.nudge_2_sent_at IS NULL
            AND sr.nudge_sent_at <= NOW() - INTERVAL '7 days')
        )
    `)
    const rows: any[] = Array.isArray(result) ? result : (result as any)?.rows ?? []
    return rows.map((r) => ({
      signupRequestId: String(r.signup_request_id),
      email: String(r.email),
      name: String(r.name || ""),
      estateName: String(r.estate_name || "your estate"),
      tenantId: String(r.tenant_id),
      nudgeNumber: r.nudge_sent_at ? 2 : 1,
    }))
  } catch (error) {
    logServerError("onboarding-nudge: failed to fetch candidates", error)
    return []
  }
}

async function markNudgeSent(signupRequestId: string, nudgeNumber: 1 | 2): Promise<void> {
  if (!sql) return
  if (nudgeNumber === 1) {
    await sql.query(`UPDATE signup_requests SET nudge_sent_at = NOW() WHERE id = $1`, [signupRequestId])
  } else {
    await sql.query(`UPDATE signup_requests SET nudge_2_sent_at = NOW() WHERE id = $1`, [signupRequestId])
  }
}

function buildNudge1Email(candidate: NudgeCandidate): { subject: string; html: string; text: string } {
  const firstName = candidate.name.split(" ")[0] || "there"
  const loginUrl = APP_URL

  const subject = `Your FarmFlow workspace is ready — here's how to get started`

  const text = [
    `Hi ${firstName},`,
    ``,
    `You set up your FarmFlow workspace for ${candidate.estateName} a few days ago — great to have you on board.`,
    ``,
    `We noticed you haven't started recording yet. That's fine — here's the quickest way in:`,
    ``,
    `1. Log your first expense (fertiliser, wages, or equipment)`,
    `2. Record a picking entry if the season is active`,
    `3. Or just complete your estate profile in the guided setup`,
    ``,
    `Any one of these takes less than a minute and gives you a starting point to build from.`,
    ``,
    `Log in here: ${loginUrl}`,
    ``,
    `If you have any questions or need a hand, reply to this email.`,
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
            You set up your FarmFlow workspace for <strong>${candidate.estateName}</strong> a few days ago — great to have you on board.
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
            We noticed you haven't started recording yet. Here's the quickest way in — pick whichever fits today:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            ${[
              ["Log an expense", "Fertiliser, wages, equipment — takes 30 seconds"],
              ["Record picking", "Cherry weight and plot — if the season is running"],
              ["Complete estate setup", "Finish the guided setup to unlock all features"],
            ].map(([title, desc]) => `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;width:20px;">
                <span style="display:inline-block;width:8px;height:8px;background:#17633f;border-radius:50%;margin-top:5px;"></span>
              </td>
              <td style="padding:10px 0 10px 12px;border-bottom:1px solid #f3f4f6;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${title}</p>
                <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${desc}</p>
              </td>
            </tr>`).join("")}
          </table>

          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Any one of these takes less than a minute and gives you a starting point to build on.
          </p>

          <p style="margin:0 0 32px;text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#17633f;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
              Open my workspace
            </a>
          </p>

          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
            Have questions or need a hand? Just reply to this email.
          </p>
        </td></tr>

        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You're receiving this because you signed up for FarmFlow.
            If you didn't create this account, you can ignore this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

function buildNudge2Email(candidate: NudgeCandidate): { subject: string; html: string; text: string } {
  const firstName = candidate.name.split(" ")[0] || "there"
  const loginUrl = APP_URL

  const subject = `Still here if you need a hand — ${candidate.estateName}`

  const text = [
    `Hi ${firstName},`,
    ``,
    `Just checking in — your FarmFlow workspace for ${candidate.estateName} is still set up and ready to go.`,
    ``,
    `We know getting started with new software can feel like one more thing on a long list. If anything felt unclear or you weren't sure where to begin, reply to this email and I'll help you get sorted.`,
    ``,
    `If you'd like to jump straight in:`,
    ``,
    `${loginUrl}`,
    ``,
    `No pressure either way — but if you do give it a go and something isn't working the way you'd expect, just let us know.`,
    ``,
    `— Nikhil, FarmFlow`,
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
            Just checking in — your FarmFlow workspace for <strong>${candidate.estateName}</strong> is still set up and ready to go.
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
            We know getting started with new software can feel like one more thing on a long list.
            If anything felt unclear or you weren't sure where to begin, just reply to this email and I'll help you get sorted.
          </p>

          <p style="margin:0 0 32px;text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#17633f;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
              Open my workspace
            </a>
          </p>

          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
            No pressure either way — but if you do give it a go and something isn't working the way you'd expect, just let us know.
          </p>
        </td></tr>

        <tr><td style="background:#f3f4f6;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You're receiving this because you signed up for FarmFlow.
            If you didn't create this account, you can ignore this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

export async function runOnboardingNudgeAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
}): Promise<{
  candidates: number
  nudgesSent: number
  nudge1Sent: number
  nudge2Sent: number
  dryRun: boolean
}> {
  const dryRun = Boolean(input?.dryRun)
  const candidates = await fetchNudgeCandidates()

  if (candidates.length === 0) {
    return { candidates: 0, nudgesSent: 0, nudge1Sent: 0, nudge2Sent: 0, dryRun }
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = String(process.env.AUTH_EMAIL_FROM || DEFAULT_AUTH_EMAIL_FROM).trim()

  let nudgesSent = 0
  let nudge1Sent = 0
  let nudge2Sent = 0

  for (const candidate of candidates) {
    const { subject, html, text } =
      candidate.nudgeNumber === 1
        ? buildNudge1Email(candidate)
        : buildNudge2Email(candidate)

    if (!dryRun) {
      if (!resendKey || !from) {
        logServerWarning("onboarding-nudge: email not configured, skipping", { candidate: candidate.email })
        continue
      }
      try {
        const response = await fetchWithTimeout("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: [candidate.email], bcc: [EMAIL_BCC_MONITORING], subject, text, html }),
          timeoutMs: 10_000,
        })
        if (!response.ok) {
          const body = await response.text().catch(() => "")
          logServerWarning("onboarding-nudge: email send failed", { status: response.status, body, email: candidate.email, nudgeNumber: candidate.nudgeNumber })
          continue
        }
        await markNudgeSent(candidate.signupRequestId, candidate.nudgeNumber)
        nudgesSent++
        if (candidate.nudgeNumber === 1) nudge1Sent++
        else nudge2Sent++
      } catch (error) {
        logServerError("onboarding-nudge: send error", error)
      }
    } else {
      nudgesSent++
      if (candidate.nudgeNumber === 1) nudge1Sent++
      else nudge2Sent++
    }
  }

  return { candidates: candidates.length, nudgesSent, nudge1Sent, nudge2Sent, dryRun }
}
