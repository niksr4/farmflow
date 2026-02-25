import "server-only"

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
  const toRecipients = splitRecipients(process.env.ALERT_EMAIL_TO || "")
  const from = String(process.env.ALERT_EMAIL_FROM || "").trim()
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
    const response = await fetch("https://api.resend.com/emails", {
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
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.warn("Agent alert email send failed:", response.status, body)
      return {
        sent: false,
        provider: "resend",
        reason: body || "Failed to send alert email",
        statusCode: response.status,
      }
    }

    return { sent: true, provider: "resend", statusCode: response.status }
  } catch (error: any) {
    console.warn("Agent alert email request failed:", error)
    return {
      sent: false,
      provider: "resend",
      reason: error?.message || "Request failed",
    }
  }
}
