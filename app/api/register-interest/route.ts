import { NextResponse } from "next/server"
import { logSecurityEvent } from "@/lib/server/security-events"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sanitize = (value: unknown, limit: number) => String(value || "").trim().slice(0, limit)
const NOTIFICATION_WEBHOOK_URL =
  process.env.REGISTER_INTEREST_SLACK_WEBHOOK_URL || process.env.SUPPORT_SLACK_WEBHOOK_URL || ""

const buildSlackPayload = (payload: {
  source: string
  name: string
  email: string
  organization: string
  estateSize: string
  region: string
  notes: string
  ipAddress: string | null
}) => {
  const lines = [
    `*New Request Access Submission*`,
    `*Source:* ${payload.source || "unknown"}`,
    `*Name:* ${payload.name}`,
    `*Email:* ${payload.email}`,
    `*Estate / Organization:* ${payload.organization || "-"}`,
    `*Estate Size / Segment:* ${payload.estateSize || "-"}`,
    `*Region:* ${payload.region || "-"}`,
    `*IP:* ${payload.ipAddress || "-"}`,
  ]

  if (payload.notes) {
    lines.push(`*Notes:* ${payload.notes}`)
  }

  return {
    text: `New request access submission from ${payload.name} (${payload.email})`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
      },
    ],
  }
}

const buildEmailBody = (payload: {
  source: string
  name: string
  email: string
  organization: string
  estateSize: string
  region: string
  notes: string
  ipAddress: string | null
}) =>
  [
    "New Request Access Submission",
    `Source: ${payload.source || "unknown"}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Estate / Organization: ${payload.organization || "-"}`,
    `Estate Size / Segment: ${payload.estateSize || "-"}`,
    `Region: ${payload.region || "-"}`,
    `IP: ${payload.ipAddress || "-"}`,
    `Notes: ${payload.notes || "-"}`,
  ].join("\n")

const notifySlack = async (payload: {
  source: string
  name: string
  email: string
  organization: string
  estateSize: string
  region: string
  notes: string
  ipAddress: string | null
}) => {
  if (!NOTIFICATION_WEBHOOK_URL) return false
  if (!NOTIFICATION_WEBHOOK_URL.startsWith("https://")) {
    throw new Error("Register-interest webhook must use https")
  }

  const response = await fetchWithTimeout(NOTIFICATION_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSlackPayload(payload)),
    timeoutMs: 5_000,
  })

  return response.ok
}

export async function POST(request: Request) {
  try {
    const requestHeaders = request.headers
    const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null
    const userAgent = requestHeaders.get("user-agent") || null
    try {
      const rateLimit = await checkRateLimit("registerInterest", `register-interest:${String(ipAddress || "unknown")}`)
      const rateHeaders = buildRateLimitHeaders(rateLimit)
      if (!rateLimit.success) {
        return NextResponse.json(
          { success: false, error: "Too many submissions. Please wait and try again." },
          { status: 429, headers: rateHeaders },
        )
      }
    } catch (rateLimitError) {
      logServerWarning("Register interest rate-limit check failed", rateLimitError)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }
    const name = sanitize(body?.name, 120)
    const email = sanitize(body?.email, 160).toLowerCase()
    const estate = sanitize(body?.estate, 180)
    const organization = sanitize(body?.organization, 180) || estate
    const estateSize = sanitize(body?.estateSize, 120)
    const region = sanitize(body?.region, 120)
    const notes = sanitize(body?.notes, 1200)
    const source = sanitize(body?.source, 80) || "landing-page"

    if (!name || !email) {
      return NextResponse.json({ success: false, error: "Name and email are required" }, { status: 400 })
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 })
    }

    await logSecurityEvent({
      eventType: "landing_register_interest",
      severity: "info",
      source,
      ipAddress,
      userAgent,
      metadata: {
        name,
        email,
        organization,
        estateSize,
        region,
        notes,
        source,
      },
    })

    let notified = false
    let emailed = false
    try {
      notified = await notifySlack({
        source,
        name,
        email,
        organization,
        estateSize,
        region,
        notes,
        ipAddress,
      })
    } catch (notificationError) {
      logServerWarning("Register interest Slack notify failed", notificationError)
      await logAppErrorEvent({
        source: "register-interest",
        endpoint: "/api/register-interest",
        errorCode: "slack_notify_failed",
        severity: "warning",
        message: "Register interest Slack notification failed",
        metadata: {
          source,
          reason: String((notificationError as Error)?.message || notificationError),
        },
      })
    }

    const emailResult = await sendAgentAlertEmail({
      subject: `[FarmFlow] New Request Access: ${name}`,
      text: buildEmailBody({
        source,
        name,
        email,
        organization,
        estateSize,
        region,
        notes,
        ipAddress,
      }),
    })
    emailed = emailResult.sent
    if (!emailed) {
      await logAppErrorEvent({
        source: "register-interest",
        endpoint: "/api/register-interest",
        errorCode: "email_notify_failed",
        severity: "warning",
        message: emailResult.reason || "Register interest email notification failed",
      })
    }

    return NextResponse.json({ success: true, notified, emailed })
  } catch (error: any) {
    logServerError("Register interest error", error)
    await logAppErrorEvent({
      source: "register-interest",
      endpoint: "/api/register-interest",
      errorCode: "request_failed",
      severity: "error",
      message: error?.message || "Failed to register interest",
    })
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to register interest" },
      { status: 500 },
    )
  }
}
