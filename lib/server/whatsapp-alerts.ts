import "server-only"

type WhatsAppAlertInput = {
  text: string
  to?: string[] | string | null
}

type WhatsAppRecipientResult = {
  to: string
  sent: boolean
  statusCode?: number
  reason?: string
  messageId?: string | null
}

export type WhatsAppAlertResult = {
  sent: boolean
  provider: string
  reason?: string
  recipients: WhatsAppRecipientResult[]
}

const splitRecipients = (value: string) =>
  String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)

const normalizeRecipient = (raw: string) => {
  const trimmed = String(raw || "").trim().replace(/\s+/g, "")
  if (!trimmed) return ""
  if (trimmed.startsWith("whatsapp:")) return trimmed
  if (trimmed.startsWith("+")) return `whatsapp:${trimmed}`
  return `whatsapp:+${trimmed}`
}

const resolveRecipients = (input?: string[] | string | null) => {
  if (Array.isArray(input)) {
    return input.map(normalizeRecipient).filter(Boolean)
  }
  if (typeof input === "string" && input.trim()) {
    return splitRecipients(input).map(normalizeRecipient).filter(Boolean)
  }

  const envTargets = process.env.ALERT_WHATSAPP_TO || process.env.WHATSAPP_ALERT_TO || ""
  return splitRecipients(envTargets).map(normalizeRecipient).filter(Boolean)
}

const toTwilioFrom = () => {
  const raw = String(process.env.TWILIO_WHATSAPP_FROM || "").trim().replace(/\s+/g, "")
  if (!raw) return ""
  if (raw.startsWith("whatsapp:")) return raw
  if (raw.startsWith("+")) return `whatsapp:${raw}`
  return `whatsapp:+${raw}`
}

const sendViaTwilio = async (input: {
  recipients: string[]
  text: string
}): Promise<WhatsAppAlertResult> => {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim()
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim()
  const from = toTwilioFrom()

  if (!accountSid) {
    return { sent: false, provider: "none", reason: "TWILIO_ACCOUNT_SID not configured", recipients: [] }
  }
  if (!authToken) {
    return { sent: false, provider: "none", reason: "TWILIO_AUTH_TOKEN not configured", recipients: [] }
  }
  if (!from) {
    return { sent: false, provider: "none", reason: "TWILIO_WHATSAPP_FROM not configured", recipients: [] }
  }
  if (!input.recipients.length) {
    return { sent: false, provider: "none", reason: "No WhatsApp recipients configured", recipients: [] }
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")
  const results: WhatsAppRecipientResult[] = []

  for (const recipient of input.recipients) {
    const body = new URLSearchParams({
      To: recipient,
      From: from,
      Body: input.text,
    })

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      })

      const responseText = await response.text()
      let payload: any = null
      try {
        payload = responseText ? JSON.parse(responseText) : null
      } catch {
        payload = null
      }

      if (!response.ok) {
        results.push({
          to: recipient,
          sent: false,
          statusCode: response.status,
          reason: String(payload?.message || payload?.error || responseText || "Failed to send WhatsApp"),
        })
        continue
      }

      results.push({
        to: recipient,
        sent: true,
        statusCode: response.status,
        messageId: payload?.sid ? String(payload.sid) : null,
      })
    } catch (error: any) {
      results.push({
        to: recipient,
        sent: false,
        reason: error?.message || "Request failed",
      })
    }
  }

  const successCount = results.filter((item) => item.sent).length
  return {
    sent: successCount > 0,
    provider: "twilio",
    reason: successCount > 0 ? undefined : "All WhatsApp deliveries failed",
    recipients: results,
  }
}

export async function sendWhatsAppAlert(input: WhatsAppAlertInput): Promise<WhatsAppAlertResult> {
  const provider = String(process.env.WHATSAPP_PROVIDER || "twilio").trim().toLowerCase() || "twilio"
  const recipients = resolveRecipients(input.to)
  const text = String(input.text || "").trim()

  if (!text) {
    return { sent: false, provider: "none", reason: "Message text is empty", recipients: [] }
  }

  if (provider !== "twilio") {
    return {
      sent: false,
      provider,
      reason: `Unsupported WHATSAPP_PROVIDER '${provider}'. Supported: twilio`,
      recipients: [],
    }
  }

  return sendViaTwilio({ recipients, text })
}
