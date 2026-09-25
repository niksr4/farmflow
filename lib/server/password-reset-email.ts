import "server-only"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_AUTH_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
import { escapeHtml } from "@/lib/html-escape"
import { fetchWithTimeout } from "@/lib/server/http"
import { getAuthEmailSenderConfigurationError } from "@/lib/server/onboarding/utils"
import { buildPasswordResetLink } from "@/lib/server/password-reset-utils"

type PasswordResetEmailInput = {
  email: string
  username: string
  token: string
}

export type PasswordResetEmailResult = {
  sent: boolean
  provider: string
  reason?: string
  statusCode?: number
}

const resolveSender = () =>
  String(process.env.AUTH_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_AUTH_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()
const resolvePreviewDir = () => String(process.env.AUTH_EMAIL_PREVIEW_DIR || "").trim()

const writePreviewEmail = async (input: PasswordResetEmailInput, resetLink: string) => {
  const previewDir = resolvePreviewDir()
  if (!previewDir) {
    return null
  }

  const safeEmail = input.email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "preview"
  const payload = {
    type: "password_reset",
    email: input.email,
    username: input.username,
    token: input.token,
    resetLink,
    generatedAt: new Date().toISOString(),
  }

  await mkdir(previewDir, { recursive: true })
  const filePath = path.join(previewDir, `${Date.now()}-${safeEmail}-reset.json`)
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  return filePath
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<PasswordResetEmailResult> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = resolveSender()

  const resetLink = buildPasswordResetLink(input.token)
  const previewPath = await writePreviewEmail(input, resetLink)
  if (previewPath) {
    return { sent: true, provider: "preview", reason: previewPath }
  }

  const senderConfigurationError = getAuthEmailSenderConfigurationError({ sender: from })
  if (senderConfigurationError) {
    return { sent: false, provider: "none", reason: senderConfigurationError }
  }
  if (!resendKey) {
    return { sent: false, provider: "none", reason: "RESEND_API_KEY not configured" }
  }

  const subject = "Reset your FarmFlow password"
  const text = [
    `Hi ${input.username || "there"},`,
    "",
    "We received a request to reset your FarmFlow password.",
    "",
    resetLink,
    "",
    "This link expires in 1 hour. If you didn't request this, you can ignore this email — your password will stay unchanged.",
  ].join("\n")

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #122018;">
      <p>Hi ${escapeHtml(input.username || "there")},</p>
      <p>We received a request to reset your FarmFlow password.</p>
      <p>
        <a href="${resetLink}" style="display: inline-block; background: #17633f; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p style="color: #55615b;">This link expires in 1 hour. If you didn't request this, you can ignore this email — your password will stay unchanged.</p>
    </div>
  `

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        /**
         * NO BCC ON THIS ONE. Every other email in the app copies EMAIL_BCC_MONITORING, because
         * bodies are not persisted anywhere and that copy is the only archive of what was actually
         * sent. A password reset is the exception: the link IS an account-takeover credential, and
         * BCCing it parked a working one in a shared support mailbox for its full hour, for every
         * reset ever sent. Anyone with access to that inbox could take over any account without
         * needing the user's password or mailbox.
         *
         * The monitoring record is kept by the separate notification below, which says a reset was
         * sent and to whom, and carries no link. That preserves what the BCC was for -- evidence
         * the mail went out -- without shipping the credential.
         *
         * Raised by the QA scanner 2026-09-25 as consistent-with-convention rather than a new bug,
         * which is exactly why it had survived: it looked like every other send in the file.
         */
        subject,
        text,
        html,
      }),
      timeoutMs: 10_000,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      const providerConfigurationError = getAuthEmailSenderConfigurationError({
        sender: from,
        providerMessage: body,
      })
      return {
        sent: false,
        provider: "resend",
        reason: providerConfigurationError || body || "Failed to send password reset email",
        statusCode: response.status,
      }
    }

    /**
     * The monitoring record, with no link in it. Deliberately fire-and-forget: the user's reset
     * email has already been accepted by Resend at this point, and failing the whole call because
     * an internal notification bounced would turn a successful reset into a reported failure.
     */
    void fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [EMAIL_BCC_MONITORING],
        subject: `[monitoring] Password reset link sent to ${input.username || input.email}`,
        text: [
          `A password reset link was sent to ${input.email} (username: ${input.username || "unknown"}).`,
          "",
          "The link itself is deliberately not included here — it is a working account-takeover",
          "credential for one hour, and this mailbox is not where one should sit.",
        ].join("\n"),
      }),
      timeoutMs: 10_000,
    }).catch(() => {
      // Monitoring must never be able to fail a password reset.
    })

    return { sent: true, provider: "resend", statusCode: response.status }
  } catch (error: any) {
    return {
      sent: false,
      provider: "resend",
      reason: error?.message || "Password reset email request failed",
    }
  }
}
