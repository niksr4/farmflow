import "server-only"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { DEFAULT_ALERT_EMAIL_FROM, DEFAULT_AUTH_EMAIL_FROM, EMAIL_BCC_MONITORING } from "@/lib/email-addresses"
import { fetchWithTimeout } from "@/lib/server/http"
import {
  buildVerificationLink,
  getAuthEmailSenderConfigurationError,
} from "@/lib/server/onboarding/utils"

type SignupVerificationEmailInput = {
  email: string
  name: string
  estateName: string
  token: string
}

export type SignupVerificationEmailResult = {
  sent: boolean
  provider: string
  reason?: string
  statusCode?: number
}

const resolveSender = () =>
  String(process.env.AUTH_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || DEFAULT_AUTH_EMAIL_FROM || DEFAULT_ALERT_EMAIL_FROM).trim()
const resolvePreviewDir = () => String(process.env.AUTH_EMAIL_PREVIEW_DIR || "").trim()

const writePreviewEmail = async (input: SignupVerificationEmailInput, verificationLink: string) => {
  const previewDir = resolvePreviewDir()
  if (!previewDir) {
    return null
  }

  const safeEmail = input.email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "preview"
  const payload = {
    type: "signup_verification",
    email: input.email,
    name: input.name,
    estateName: input.estateName,
    token: input.token,
    verificationLink,
    generatedAt: new Date().toISOString(),
  }

  await mkdir(previewDir, { recursive: true })
  const filePath = path.join(previewDir, `${Date.now()}-${safeEmail}.json`)
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  return filePath
}

export async function sendSignupVerificationEmail(
  input: SignupVerificationEmailInput,
): Promise<SignupVerificationEmailResult> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = resolveSender()

  const verificationLink = buildVerificationLink(input.token)
  const previewPath = await writePreviewEmail(input, verificationLink)
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

  const subject = "Verify your FarmFlow email"
  const text = [
    `Hi ${input.name || "there"},`,
    "",
    `Verify your email to finish creating your FarmFlow workspace for ${input.estateName}.`,
    "",
    verificationLink,
    "",
    "This link expires in 24 hours.",
  ].join("\n")

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #122018;">
      <p>Hi ${input.name || "there"},</p>
      <p>Verify your email to finish creating your FarmFlow workspace for <strong>${input.estateName}</strong>.</p>
      <p>
        <a href="${verificationLink}" style="display: inline-block; background: #17633f; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none;">
          Verify Email
        </a>
      </p>
      <p>If the button does not work, use this link:</p>
      <p><a href="${verificationLink}">${verificationLink}</a></p>
      <p style="color: #55615b;">This link expires in 24 hours.</p>
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
        bcc: [EMAIL_BCC_MONITORING],
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
        reason: providerConfigurationError || body || "Failed to send verification email",
        statusCode: response.status,
      }
    }

    return { sent: true, provider: "resend", statusCode: response.status }
  } catch (error: any) {
    return {
      sent: false,
      provider: "resend",
      reason: error?.message || "Verification email request failed",
    }
  }
}
