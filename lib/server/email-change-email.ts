import "server-only"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_AUTH_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
import { fetchWithTimeout } from "@/lib/server/http"
import { getAuthEmailSenderConfigurationError, maskEmailAddress } from "@/lib/server/onboarding/utils"
import { buildEmailChangeLink } from "@/lib/server/email-change-utils"

export type EmailChangeEmailResult = {
  sent: boolean
  provider: string
  reason?: string
  statusCode?: number
}

const resolveSender = () =>
  String(process.env.AUTH_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_AUTH_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()
const resolvePreviewDir = () => String(process.env.AUTH_EMAIL_PREVIEW_DIR || "").trim()

const writePreviewEmail = async (kind: string, to: string, payload: Record<string, unknown>) => {
  const previewDir = resolvePreviewDir()
  if (!previewDir) return null

  const safeEmail = to.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "preview"
  await mkdir(previewDir, { recursive: true })
  const filePath = path.join(previewDir, `${Date.now()}-${safeEmail}-${kind}.json`)
  await writeFile(filePath, `${JSON.stringify({ type: kind, to, ...payload, generatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8")
  return filePath
}

const send = async (input: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<EmailChangeEmailResult> => {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = resolveSender()

  const senderConfigurationError = getAuthEmailSenderConfigurationError({ sender: from })
  if (senderConfigurationError) {
    return { sent: false, provider: "none", reason: senderConfigurationError }
  }
  if (!resendKey) {
    return { sent: false, provider: "none", reason: "RESEND_API_KEY not configured" }
  }

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        bcc: [EMAIL_BCC_MONITORING],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      timeoutMs: 10_000,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        sent: false,
        provider: "resend",
        reason: getAuthEmailSenderConfigurationError({ sender: from, providerMessage: body }) || body || "Failed to send email",
        statusCode: response.status,
      }
    }

    return { sent: true, provider: "resend", statusCode: response.status }
  } catch (error: any) {
    return { sent: false, provider: "resend", reason: String(error?.message || error) }
  }
}

/** Sent to the NEW address. Clicking the link is what proves the user controls it. */
export async function sendEmailChangeVerification(input: {
  newEmail: string
  username: string
  token: string
}): Promise<EmailChangeEmailResult> {
  const link = buildEmailChangeLink(input.token)

  const preview = await writePreviewEmail("email_change_verify", input.newEmail, {
    username: input.username,
    token: input.token,
    link,
  })
  if (preview) return { sent: true, provider: "preview", reason: preview }

  const text = [
    `Hi ${input.username || "there"},`,
    "",
    "Confirm this address to finish changing the email on your FarmFlow account.",
    "",
    link,
    "",
    "This link expires in 1 hour. Until you confirm, your existing email stays in place.",
  ].join("\n")

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #122018;">
      <p>Hi ${input.username || "there"},</p>
      <p>Confirm this address to finish changing the email on your FarmFlow account.</p>
      <p>
        <a href="${link}" style="display: inline-block; background: #17633f; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none;">
          Confirm email address
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${link}">${link}</a></p>
      <p style="color: #55615b;">This link expires in 1 hour. Until you confirm, your existing email stays in place.</p>
    </div>
  `

  return send({ to: input.newEmail, subject: "Confirm your new FarmFlow email address", text, html })
}

/**
 * Sent to the OLD address. This is the security half of the flow: if someone with a stolen
 * session moves the account's email, the real owner finds out at the address they still control,
 * rather than discovering it the next time a password reset silently goes elsewhere.
 *
 * The new address is masked — the old inbox does not need to be told a third party's full
 * address to know that something happened and to raise it.
 */
export async function sendEmailChangeNotice(input: {
  oldEmail: string
  newEmail: string
  username: string
}): Promise<EmailChangeEmailResult> {
  const masked = maskEmailAddress(input.newEmail)

  const preview = await writePreviewEmail("email_change_notice", input.oldEmail, {
    username: input.username,
    maskedNewEmail: masked,
  })
  if (preview) return { sent: true, provider: "preview", reason: preview }

  const text = [
    `Hi ${input.username || "there"},`,
    "",
    `Someone requested changing the email on your FarmFlow account to ${masked}.`,
    "",
    "If that was you, no action is needed — confirm using the link sent to the new address.",
    "",
    "If it was NOT you, your account may be compromised. Change your password immediately and contact support@thefarmflow.in.",
  ].join("\n")

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #122018;">
      <p>Hi ${input.username || "there"},</p>
      <p>Someone requested changing the email on your FarmFlow account to <strong>${masked}</strong>.</p>
      <p>If that was you, no action is needed — confirm using the link sent to the new address.</p>
      <p style="color: #8a2b2b;"><strong>If it was not you</strong>, your account may be compromised. Change your password immediately and contact support@thefarmflow.in.</p>
    </div>
  `

  return send({ to: input.oldEmail, subject: "Your FarmFlow email address was asked to change", text, html })
}
