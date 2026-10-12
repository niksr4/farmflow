import "server-only"

import { hashPassword } from "@/lib/passwords"
import { logSecurityEvent } from "@/lib/server/security-events"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { sendSignupVerificationEmail } from "@/lib/server/onboarding/email"
import type { SignupRequestRecord, SignupRequestResult } from "@/lib/server/onboarding/types"
import {
  generateSignupToken,
  hashSignupToken,
  isMissingRelation,
  maskEmailAddress,
  normalizeLocale,
  normalizeOnboardingError,
  normalizeSignupEmail,
} from "@/lib/server/onboarding/utils"

const ownerContext = normalizeTenantContext(undefined, "owner")
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const hasUserEmailSchema = (error: unknown) => {
  const message = String((error as Error)?.message || error || "")
  return (
    message.includes('column "email"') ||
    message.includes('column "normalized_email"') ||
    message.includes('column "email_verified_at"') ||
    message.includes('column "preferred_locale"')
  )
}

type CreateSignupRequestInput = {
  name: string
  email: string
  password: string
  estateName: string
  country?: string | null
  preferredLocale?: string | null
  source?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

type ResendSignupVerificationInput = {
  email: string
  ipAddress?: string | null
  userAgent?: string | null
}

type ExistingUserRow = {
  id: string
  tenant_id: string
}

const sanitizeText = (value: string | null | undefined, maxLength: number) => {
  const trimmed = String(value || "").trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

const normalizeSignupSchemaError = (error: unknown) => {
  if (isMissingRelation(error, "signup_requests") || isMissingRelation(error, "signup_tokens") || hasUserEmailSchema(error)) {
    return normalizeOnboardingError(error)
  }
  return error
}

const findExistingUserByEmail = async (normalizedEmail: string) => {
  try {
    const rows = (await runTenantQuery(
      sql,
      ownerContext,
      sql`
        SELECT id, tenant_id
        FROM users
        WHERE normalized_email = ${normalizedEmail}
        LIMIT 1
      `,
    )) as ExistingUserRow[]
    return rows
  } catch (error) {
    throw normalizeSignupSchemaError(error)
  }
}

const findSignupRequestByEmail = async (normalizedEmail: string) => {
  try {
    return (await runTenantQuery(
      sql,
      ownerContext,
      sql`
        SELECT
          id,
          name,
          email,
          normalized_email,
          estate_name,
          country,
          preferred_locale,
          password_hash,
          status,
          source,
          tenant_id,
          user_id,
          generated_username,
          verification_sent_at,
          created_at,
          verified_at,
          provisioned_at,
          provisioning_error,
          last_ip_address,
          last_user_agent
        FROM signup_requests
        WHERE normalized_email = ${normalizedEmail}
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )) as SignupRequestRecord[]
  } catch (error) {
    throw normalizeSignupSchemaError(error)
  }
}

const issueVerificationToken = async (signupRequestId: string) => {
  const token = generateSignupToken()
  const tokenHash = hashSignupToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  try {
    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        DELETE FROM signup_tokens
        WHERE signup_request_id = ${signupRequestId}
          AND purpose = 'verify_email'
          AND consumed_at IS NULL
      `,
    )

    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        INSERT INTO signup_tokens (signup_request_id, token_hash, purpose, expires_at)
        VALUES (${signupRequestId}, ${tokenHash}, 'verify_email', ${expiresAt})
      `,
    )
  } catch (error) {
    throw normalizeSignupSchemaError(error)
  }

  return { token, expiresAt }
}

const markVerificationSent = async (signupRequestId: string) => {
  try {
    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        UPDATE signup_requests
        SET verification_sent_at = CURRENT_TIMESTAMP
        WHERE id = ${signupRequestId}
      `,
    )
  } catch (error) {
    throw normalizeSignupSchemaError(error)
  }
}

export async function createOrRefreshSignupRequest(input: CreateSignupRequestInput): Promise<SignupRequestResult> {
  const email = normalizeSignupEmail(input.email)
  const name = String(input.name || "").trim()
  const estateName = String(input.estateName || "").trim()
  const country = sanitizeText(input.country, 120)
  const source = sanitizeText(input.source, 60)
  const ipAddress = sanitizeText(input.ipAddress, 120)
  const userAgent = sanitizeText(input.userAgent, 400)
  const preferredLocale = normalizeLocale(input.preferredLocale, "en")
  const passwordHash = hashPassword(input.password)

  const existingUsers = await findExistingUserByEmail(email)
  if (existingUsers.length > 0) {
    throw new Error("An account already exists for this email")
  }

  const existingSignup = (await findSignupRequestByEmail(email))[0] || null
  if (existingSignup?.status === "provisioned" && existingSignup?.user_id) {
    throw new Error("An account already exists for this email")
  }

  const nextStatus = existingSignup?.status === "verified" ? "verified" : "pending"
  const nextVerifiedAt = existingSignup?.status === "verified" ? existingSignup.verified_at : null

  /**
   * ⚠ ACCOUNT TAKEOVER. THE CREDENTIAL ON AN EXISTING REQUEST IS NOT THE CALLER'S TO REPLACE.
   *
   * /api/auth/signup is unauthenticated -- it is a public page and only rate-limits on IP+email.
   * This UPDATE used to write `password_hash = ${passwordHash}` over whatever was already there,
   * and then re-send the verification link to the address on the row. So:
   *
   *   1. Someone genuinely signs up and has not clicked their link yet.
   *   2. A stranger who knows their email POSTs the signup form with their OWN password.
   *   3. The stored hash becomes the stranger's, and the victim is re-sent "verify your signup".
   *   4. The victim clicks, expecting their own signup. provision-tenant.ts creates the admin
   *      user with the hash on the row -- the stranger's -- and the stranger can log in.
   *
   * The victim sees a signup they really did start, completes it, and ends up with an estate
   * somebody else holds the password to. Nothing errors at any step.
   *
   * Five rows on production are in the vulnerable state right now (3 pending, 2 verified, none
   * provisioned), and /signup is a live public URL, so every future signup would be too.
   *
   * THE CREDENTIAL IS THEREFORE WRITTEN ONCE, AT CREATE, AND NEVER REWRITTEN BY A LATER CALLER.
   * A fresh signup for an email that already has an unprovisioned request re-sends the link for
   * the request that exists; it cannot change what that link will produce. Someone who has
   * genuinely forgotten the password they first chose still gets in, through password reset after
   * provisioning, which proves control of the mailbox -- which is exactly the proof this path
   * cannot demand and must not assume.
   *
   * The same reasoning covers `name` and `estate_name`: they are what the eventual tenant is
   * called, so letting a stranger rewrite them is defacement rather than takeover, but it is the
   * same unproven caller writing the same unverified row.
   */
  const keepExistingCredential = Boolean(existingSignup)
  const passwordHashToStore = keepExistingCredential ? existingSignup!.password_hash : passwordHash

  let signupRequest: SignupRequestRecord | null = null

  try {
    const rows = existingSignup
      ? ((await runTenantQuery(
          sql,
          ownerContext,
          sql`
            UPDATE signup_requests
            SET
              -- name and estate_name are deliberately NOT updated from this caller: see the note
              -- above. They describe the tenant the link will create, and the caller has not
              -- proven they own this mailbox.
              email = ${email},
              normalized_email = ${email},
              country = ${country},
              preferred_locale = ${preferredLocale},
              password_hash = ${passwordHashToStore},
              status = ${nextStatus},
              source = ${source},
              verified_at = ${nextVerifiedAt},
              provisioning_error = NULL,
              last_ip_address = ${ipAddress},
              last_user_agent = ${userAgent}
            WHERE id = ${existingSignup.id}
            RETURNING
              id,
              name,
              email,
              normalized_email,
              estate_name,
              country,
              preferred_locale,
              password_hash,
              status,
              source,
              tenant_id,
              user_id,
              generated_username,
              verification_sent_at,
              created_at,
              verified_at,
              provisioned_at,
              provisioning_error,
              last_ip_address,
              last_user_agent
          `,
        )) as SignupRequestRecord[])
      : ((await runTenantQuery(
          sql,
          ownerContext,
          sql`
            INSERT INTO signup_requests (
              name,
              email,
              normalized_email,
              estate_name,
              country,
              preferred_locale,
              password_hash,
              status,
              source,
              last_ip_address,
              last_user_agent
            )
            VALUES (
              ${name},
              ${email},
              ${email},
              ${estateName},
              ${country},
              ${preferredLocale},
              ${passwordHash},
              'pending',
              ${source},
              ${ipAddress},
              ${userAgent}
            )
            RETURNING
              id,
              name,
              email,
              normalized_email,
              estate_name,
              country,
              preferred_locale,
              password_hash,
              status,
              source,
              tenant_id,
              user_id,
              generated_username,
              verification_sent_at,
              created_at,
              verified_at,
              provisioned_at,
              provisioning_error,
              last_ip_address,
              last_user_agent
          `,
        )) as SignupRequestRecord[])

    signupRequest = rows[0] || null
  } catch (error) {
    throw normalizeSignupSchemaError(error)
  }

  if (!signupRequest) {
    throw new Error("Unable to create signup request")
  }

  await logSecurityEvent({
    eventType: "auth_signup_requested",
    severity: "info",
    source: "auth/signup",
    ipAddress,
    userAgent,
    metadata: {
      signupRequestId: signupRequest.id,
      emailDomain: email.split("@")[1] || "",
      estateName,
      source: source || "signup-page",
      /**
       * A second signup for an address that already has an unprovisioned request is the shape of
       * the takeover attempt above, and it is also just somebody signing up twice -- the two are
       * indistinguishable from here, which is the whole reason the credential is now left alone.
       *
       * Recorded rather than blocked. There is no honest way to refuse it: saying "that email
       * already has a signup" to an unauthenticated caller confirms the address is in the funnel,
       * and refusing silently would break the legitimate person who lost their first email. So
       * the request is served as before and the attempt leaves a trail instead.
       */
      refreshedExistingRequest: Boolean(existingSignup),
      credentialRetained: keepExistingCredential,
    },
  })

  const issuedToken = await issueVerificationToken(signupRequest.id)
  const emailResult = await sendSignupVerificationEmail({
    email: signupRequest.email,
    name: signupRequest.name,
    estateName: signupRequest.estate_name,
    token: issuedToken.token,
  })

  if (!emailResult.sent) {
    throw new Error(emailResult.reason || "Unable to send verification email right now")
  }

  await markVerificationSent(signupRequest.id)

  return {
    signupRequestId: signupRequest.id,
    email,
    maskedEmail: maskEmailAddress(email),
    verificationSent: true,
  }
}

export async function resendSignupVerification(input: ResendSignupVerificationInput): Promise<SignupRequestResult> {
  const email = normalizeSignupEmail(input.email)
  const ipAddress = sanitizeText(input.ipAddress, 120)
  const userAgent = sanitizeText(input.userAgent, 400)
  const signupRequest = (await findSignupRequestByEmail(email))[0] || null

  if (!signupRequest || signupRequest.status === "cancelled" || signupRequest.status === "expired") {
    throw new Error("No pending signup found for this email")
  }
  if (signupRequest.status === "provisioned" && signupRequest.user_id) {
    throw new Error("This account is already verified. Sign in instead.")
  }

  const issuedToken = await issueVerificationToken(signupRequest.id)
  const emailResult = await sendSignupVerificationEmail({
    email: signupRequest.email,
    name: signupRequest.name,
    estateName: signupRequest.estate_name,
    token: issuedToken.token,
  })

  if (!emailResult.sent) {
    throw new Error(emailResult.reason || "Unable to send verification email right now")
  }

  await markVerificationSent(signupRequest.id)

  await logSecurityEvent({
    eventType: "auth_signup_verification_resent",
    severity: "info",
    source: "auth/resend-verification",
    ipAddress,
    userAgent,
    metadata: {
      signupRequestId: signupRequest.id,
      emailDomain: email.split("@")[1] || "",
    },
  })

  return {
    signupRequestId: signupRequest.id,
    email: signupRequest.email,
    maskedEmail: maskEmailAddress(signupRequest.email),
    verificationSent: true,
  }
}
