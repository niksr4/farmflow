import "server-only"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_SUPPORT_EMAIL } from "@/lib/email-addresses"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerWarning } from "@/lib/server/safe-logging"

type AlertEmailInput = {
  subject: string
  text: string
  html?: string
}

type AlertEmailResult = {
  sent: boolean
  provider: string
  reason?: string
  statusCode?: number
}

const splitRecipients = (value: string) =>
  String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)

export async function sendAgentAlertEmail(input: AlertEmailInput): Promise<AlertEmailResult> {
  const toRecipients = splitRecipients(process.env.ALERT_EMAIL_TO || process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL)
  const from = String(process.env.ALERT_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()

  if (!toRecipients.length) {
    return { sent: false, provider: "none", reason: "ALERT_EMAIL_TO not configured" }
  }
  if (!from) {
    return { sent: false, provider: "none", reason: "ALERT_EMAIL_FROM not configured" }
  }
  if (!resendKey) {
    return { sent: false, provider: "none", reason: "RESEND_API_KEY not configured" }
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
        to: toRecipients,
        subject: input.subject,
        text: input.text,
        html: input.html || undefined,
      }),
      timeoutMs: 10_000,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      logServerWarning("Agent alert email send failed", { status: response.status, body })
      return {
        sent: false,
        provider: "resend",
        reason: body || "Failed to send alert email",
        statusCode: response.status,
      }
    }

    return { sent: true, provider: "resend", statusCode: response.status }
  } catch (error: any) {
    logServerWarning("Agent alert email request failed", error)
    return {
      sent: false,
      provider: "resend",
      reason: error?.message || "Request failed",
    }
  }
}
