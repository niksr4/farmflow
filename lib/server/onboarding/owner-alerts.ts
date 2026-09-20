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
  endpoint: string
  metadata?: Record<string, unknown>
}) => {
  logServerWarning("Owner alert email failed", {
    errorCode: input.errorCode,
    message: input.message,
    ...(input.metadata || {}),
  })

  await logAppErrorEvent({
    source: "owner-alert-email",
    endpoint: input.endpoint,
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
      endpoint: "/api/auth/signup",
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
    /**
     * The endpoint this alert failed from depends on how the tenant was created. Hardcoding
     * "/api/auth/signup" made every owner-console-created tenant's failure look like a
     * signup-flow failure.
     *
     * ⚠ AND THE SELF-SERVE BRANCH WAS STILL WRONG after that fix. A tenant is not provisioned at
     * signup: POST /api/auth/signup only creates or refreshes a pending request. Provisioning --
     * and therefore this alert -- happens when the emailed token is redeemed, in
     * verifySignupToken, which app/api/auth/verify-email/route.ts is the only caller of. So the
     * normal path's failures were filed against a route that had already returned successfully
     * minutes or hours earlier.
     *
     * That matters beyond tidiness: `endpoint` feeds monitoring and error fingerprints, so
     * searching /api/auth/verify-email for provisioning failures returned nothing while
     * /api/auth/signup accumulated failures that never happened there. Raised by Greptile on
     * PR #22.
     */
    await logOwnerAlertFailure({
      errorCode: "tenant_created_email_failed",
      message: emailResult.reason || "Owner tenant created alert failed",
      endpoint: input.origin === "owner-console" ? "/api/admin/tenants" : "/api/auth/verify-email",
      metadata: {
        tenantId: input.tenantId,
        tenantName: input.tenantName,
        origin: input.origin,
      },
    })
  }
}
