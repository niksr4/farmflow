import { NextResponse } from "next/server"
import { z } from "zod"
import { DEFAULT_SUPPORT_EMAIL, DEFAULT_SUPPORT_EMAIL_FROM } from "@/lib/email-addresses"
import { checkRateLimit, buildRateLimitHeaders, isRateLimitUnavailableError } from "@/lib/rate-limit"

const contactBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address").max(160, "Email is too long"),
  inquiryType: z.enum(["estate-trial", "partnership", "incubation", "general"]).optional().default("general"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message is too long"),
})

const INQUIRY_LABELS: Record<string, string> = {
  "estate-trial": "Estate trial / demo",
  partnership: "Partnership / integration",
  incubation: "Incubation / investor",
  general: "General enquiry",
}

const getClientIpAddress = (request: Request) =>
  (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0]?.trim() || "unknown"

export async function POST(request: Request) {
  const ipAddress = getClientIpAddress(request)
  const body = await request.json().catch(() => ({}))
  const parsed = contactBodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 },
    )
  }

  let headers: Record<string, string> = {}
  try {
    const rateLimit = await checkRateLimit("registerInterest", `contact:${ipAddress}:${parsed.data.email}`)
    headers = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again shortly." },
        { status: 429, headers },
      )
    }
  } catch (error) {
    if (isRateLimitUnavailableError(error)) {
      // Rate limit service unavailable — allow through
    } else {
      throw error
    }
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const to = String(process.env.ALERT_EMAIL_TO || process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim()
  const from = String(process.env.ALERT_EMAIL_FROM || DEFAULT_SUPPORT_EMAIL_FROM).trim()

  if (!resendKey || !to || !from) {
    // Email not configured — still acknowledge the submission gracefully
    return NextResponse.json({ success: true }, { headers })
  }

  const { name, email, message, inquiryType } = parsed.data
  const inquiryLabel = INQUIRY_LABELS[inquiryType] ?? "General enquiry"
  const subject = `[FarmFlow Contact] ${name} — ${inquiryLabel}`
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Inquiry: ${inquiryLabel}`,
    `IP: ${ipAddress}`,
    "",
    message,
  ].join("\n")

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #122018; max-width: 600px;">
      <div style="background: #052e16; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <p style="color: #6ee7b7; margin: 0; font-size: 13px; font-weight: 600; letter-spacing: 0.05em;">FARMFLOW CONTACT</p>
        <p style="color: #fff; margin: 4px 0 0; font-size: 18px; font-weight: 600;">${name}</p>
        <p style="color: #a7f3d0; margin: 2px 0 0; font-size: 13px;">${inquiryLabel}</p>
      </div>
      <table style="font-size: 14px; margin-bottom: 16px; border-collapse: collapse;">
        <tr><td style="color: #6b7280; padding: 3px 12px 3px 0; white-space: nowrap;">Reply to</td><td><a href="mailto:${email}" style="color: #059669;">${email}</a></td></tr>
        <tr><td style="color: #6b7280; padding: 3px 12px 3px 0; white-space: nowrap;">IP</td><td style="color: #374151;">${ipAddress}</td></tr>
      </table>
      <div style="background: #f9fafb; border-left: 3px solid #059669; border-radius: 4px; padding: 14px 16px; font-size: 14px; color: #111827; white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    </div>
  `

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html, reply_to: email }),
    })
  } catch {
    // Don't surface send failures to the user — submission is still acknowledged
  }

  return NextResponse.json({ success: true }, { headers })
}
