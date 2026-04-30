import { NextResponse } from "next/server"
import crypto from "crypto"
import { resolveBotUser, loadTenantBotContext, loadPendingSession, upsertBotSession, clearBotSession } from "@/lib/server/bot/context"
import { parseMessage } from "@/lib/server/bot/parser"
import { buildPreview, executeIntents } from "@/lib/server/bot/executor"
import type { BotIntent } from "@/lib/server/bot/types"
import { sendWhatsAppAlert } from "@/lib/server/whatsapp-alerts"
import { isClaudeConfigured } from "@/lib/server/claude"

export const dynamic = "force-dynamic"

// Twilio HMAC-SHA1 signature validation
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort()
  const paramsStr = sortedKeys.map((k) => `${k}${params[k]}`).join("")
  const hmac = crypto
    .createHmac("sha1", authToken)
    .update(url + paramsStr)
    .digest("base64")
  const a = Buffer.from(hmac)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
}

// Parse Twilio's application/x-www-form-urlencoded body
async function parseTwilioBody(request: Request): Promise<Record<string, string>> {
  const text = await request.text()
  const params: Record<string, string> = {}
  for (const pair of text.split("&")) {
    const [k, v] = pair.split("=")
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "").replace(/\+/g, " ")
  }
  return params
}

const YES_PATTERNS = /^(yes|y|confirm|ok|okay|haan|ha|ho|seri|oo|✅|👍)$/i
const NO_PATTERNS = /^(no|n|cancel|nahi|nope|cancel|❌|👎)$/i

async function reply(to: string, text: string): Promise<void> {
  await sendWhatsAppAlert({ text, to: [to] })
}

export async function POST(request: Request) {
  try {
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim()
    const webhookUrl = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim()

    // Clone request to read body (body can only be read once)
    const cloned = request.clone()
    const params = await parseTwilioBody(cloned)

    // Validate Twilio signature in production
    if (authToken && webhookUrl) {
      const signature = request.headers.get("x-twilio-signature") ?? ""
      if (signature && !validateTwilioSignature(authToken, signature, webhookUrl, params)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
      }
    }

    const from: string = params["From"] ?? ""
    const body: string = (params["Body"] ?? "").trim()

    if (!from || !body) {
      return NextResponse.json({ received: true })
    }

    // Resolve the sender to a tenant user
    const botUser = await resolveBotUser(from)
    if (!botUser) {
      await reply(from,
        "❓ Your WhatsApp number isn't registered with FarmFlow.\n\nAsk your estate manager to add your number in *Settings → Account* on thefarmflow.in"
      )
      return NextResponse.json({ received: true })
    }

    if (!isClaudeConfigured()) {
      await reply(from, "⚠️ AI assistant is temporarily unavailable. Please log entries via the app.")
      return NextResponse.json({ received: true })
    }

    // Handle YES/NO confirmation responses
    if (YES_PATTERNS.test(body)) {
      const session = await loadPendingSession(from)
      if (!session) {
        await reply(from, "Nothing pending to confirm. Send a new entry to get started.")
        return NextResponse.json({ received: true })
      }

      await clearBotSession(from)
      const ctx = await loadTenantBotContext(botUser)
      const result = await executeIntents(session.pendingIntent as BotIntent[], botUser, ctx)
      await reply(from, result)
      return NextResponse.json({ received: true })
    }

    if (NO_PATTERNS.test(body)) {
      await clearBotSession(from)
      await reply(from, "Cancelled. Send a new entry whenever you're ready.")
      return NextResponse.json({ received: true })
    }

    // Parse the message into intents
    const ctx = await loadTenantBotContext(botUser)

    // Read-only queries (inventory check, today summary) skip the confirmation step
    const READ_ONLY_KEYWORDS = /\b(how much|stock|inventory|balance|today|summary|kitna|check)\b/i
    const isLikelyReadOnly = READ_ONLY_KEYWORDS.test(body)

    const intents = await parseMessage(body, ctx)
    const allReadOnly = intents.every(
      (i) => i.type === "query_inventory" || i.type === "query_today" || i.type === "unknown",
    )

    if (allReadOnly || isLikelyReadOnly) {
      const result = await executeIntents(intents, botUser, ctx)
      await reply(from, result)
      return NextResponse.json({ received: true })
    }

    // Mutation intents: store as pending and ask for confirmation
    await upsertBotSession(botUser, intents)
    const preview = buildPreview(intents, ctx)
    await reply(from, preview)

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error("WhatsApp webhook error:", err?.message ?? err)
    // Don't return an error status — Twilio retries on non-2xx, causing duplicate messages
    return NextResponse.json({ received: true })
  }
}
