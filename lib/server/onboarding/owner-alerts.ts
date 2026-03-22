import "server-only"

import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { logServerWarning } from "@/lib/server/safe-logging"

type SignupRequestedOwnerAlertInput = {
  signupRequestId: string
  name: string
  email: string
  estateName: string
  source?: string | null
  ipAddress?: string | null
}

type TenantCreatedOwnerAlertInput = {
  tenantId: string
  tenantName: string
  origin: "self-serve-signup" | "owner-console"
  actorName?: string | null
  actorEmail?: string | null
  username?: string | null
  createdBy?: string | null
  source?: string | null
}

const buildSignupRequestedAlertText = (input: SignupRequestedOwnerAlertInput) =>
  [
    "New FarmFlow Signup Request",
    `Signup Request ID: ${input.signupRequestId}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Estate: ${input.estateName}`,
    `Source: ${input.source || "signup-page"}`,
    `IP: ${input.ipAddress || "-"}`,
  ].join("\n")

const buildTenantCreatedAlertText = (input: TenantCreatedOwnerAlertInput) =>
  [
    "New FarmFlow Tenant Created",
    `Tenant ID: ${input.tenantId}`,
    `Tenant Name: ${input.tenantName}`,
    `Origin: ${input.origin}`,
    `Created By: ${input.createdBy || "-"}`,
    `Actor Name: ${input.actorName || "-"}`,
    `Actor Email: ${input.actorEmail || "-"}`,
    `Username: ${input.username || "-"}`,
    `Source: ${input.source || "-"}`,
  ].join("\n")

const logOwnerAlertFailure = async (input: {
  errorCode: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  logServerWarning("Owner alert email failed", {
    errorCode: input.errorCode,
    message: input.message,
    ...(input.metadata || {}),
  })

  await logAppErrorEvent({
    source: "owner-alert-email",
    endpoint: "/api/auth/signup",
    errorCode: input.errorCode,
    severity: "warning",
    message: input.message,
    metadata: input.metadata || null,
  })
}

export async function sendOwnerSignupRequestedAlert(input: SignupRequestedOwnerAlertInput) {
  const emailResult = await sendAgentAlertEmail({
    subject: `[FarmFlow] New signup request: ${input.estateName}`,
    text: buildSignupRequestedAlertText(input),
  })

  if (!emailResult.sent) {
    await logOwnerAlertFailure({
      errorCode: "signup_requested_email_failed",
      message: emailResult.reason || "Owner signup request alert failed",
      metadata: {
        signupRequestId: input.signupRequestId,
        email: input.email,
        estateName: input.estateName,
      },
    })
  }
}

export async function sendOwnerTenantCreatedAlert(input: TenantCreatedOwnerAlertInput) {
  const emailResult = await sendAgentAlertEmail({
    subject: `[FarmFlow] Tenant created: ${input.tenantName}`,
    text: buildTenantCreatedAlertText(input),
  })

  if (!emailResult.sent) {
    await logOwnerAlertFailure({
      errorCode: "tenant_created_email_failed",
      message: emailResult.reason || "Owner tenant created alert failed",
      metadata: {
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        origin: input.origin,
      },
    })
  }
}
