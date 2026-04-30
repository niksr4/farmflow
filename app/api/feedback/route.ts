import { NextResponse } from "next/server"
import { requireModuleAccess } from "@/lib/server/module-access"
import { checkRateLimit, buildRateLimitHeaders, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { DEFAULT_SUPPORT_EMAIL, DEFAULT_ALERT_EMAIL_FROM } from "@/lib/email-addresses"
import { fetchWithTimeout } from "@/lib/server/http"

export const dynamic = "force-dynamic"

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  question: "Question / Help",
  suggestion: "Feature Suggestion",
  other: "General Feedback",
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    const body = await request.json().catch(() => ({}))

    const type = String(body?.type || "other").trim()
    const message = String(body?.message || "").trim()
    const pageContext = String(body?.pageContext || "").trim()

    if (!message || message.length < 5) {
      return NextResponse.json({ success: false, error: "Message too short" }, { status: 400 })
    }
    if (message.length > 2000) {
      return NextResponse.json({ success: false, error: "Message too long" }, { status: 400 })
    }

    let headers: Record<string, string> = {}
    try {
      const rateLimit = await checkRateLimit("registerInterest", `feedback:${sessionUser.tenantId}:${sessionUser.username}`)
      headers = buildRateLimitHeaders(rateLimit)
      if (!rateLimit.success) {
        return NextResponse.json({ success: false, error: "Too many submissions. Please try again shortly." }, { status: 429, headers })
      }
    } catch (err) {
      if (!isRateLimitUnavailableError(err)) throw err
    }

    const resendKey = String(process.env.RESEND_API_KEY || "").trim()
    const to = String(process.env.ALERT_EMAIL_TO || process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim()
    const from = String(process.env.ALERT_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()

    if (resendKey && to && from) {
      const typeLabel = TYPE_LABELS[type] ?? "General Feedback"
      const html = `
        <h2 style="margin:0 0 16px;font-size:18px;color:#111">${typeLabel}</h2>
        <table style="font-size:14px;border-collapse:collapse;width:100%;margin-bottom:16px">
          <tr><td style="padding:6px 0;color:#666;width:140px">User</td><td style="padding:6px 0;font-weight:600">${sessionUser.username}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Tenant ID</td><td style="padding:6px 0;font-family:monospace;font-size:12px">${sessionUser.tenantId}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Role</td><td style="padding:6px 0">${sessionUser.role}</td></tr>
          ${pageContext ? `<tr><td style="padding:6px 0;color:#666">Current tab</td><td style="padding:6px 0">${pageContext}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#666">Submitted</td><td style="padding:6px 0">${new Date().toISOString()}</td></tr>
        </table>
        <div style="background:#f6f8fa;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;color:#222;white-space:pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      `

      await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `[FarmFlow Feedback] ${typeLabel} — ${sessionUser.username}`,
          html,
        }),
        timeoutMs: 8_000,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: "Failed to send feedback" }, { status: 500 })
  }
}
