import "server-only"

import { buildVerificationLink } from "@/lib/server/onboarding/utils"

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

const resolveSender = () => String(process.env.AUTH_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || "").trim()

export async function sendSignupVerificationEmail(
  input: SignupVerificationEmailInput,
): Promise<SignupVerificationEmailResult> {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim()
  const from = resolveSender()
  if (!from) {
    return { sent: false, provider: "none", reason: "AUTH_EMAIL_FROM or ALERT_EMAIL_FROM not configured" }
  }
  if (!resendKey) {
    return { sent: false, provider: "none", reason: "RESEND_API_KEY not configured" }
  }

  const verificationLink = buildVerificationLink(input.token)
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
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject,
        text,
        html,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        sent: false,
        provider: "resend",
        reason: body || "Failed to send verification email",
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

