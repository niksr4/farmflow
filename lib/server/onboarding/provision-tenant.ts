import "server-only"

import { randomBytes } from "crypto"

import { DEFAULT_TENANT_PLAN_ID, MODULES, clampRequestedModuleStatesToPlan } from "@/lib/modules"
import { logSecurityEvent } from "@/lib/server/security-events"
import { sql } from "@/lib/server/db"
import { persistTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { sendOwnerTenantCreatedAlert } from "@/lib/server/onboarding/owner-alerts"
import type { SignupRequestRecord, SignupVerificationLookup, SignupVerificationResult } from "@/lib/server/onboarding/types"
import {
  buildStarterLocationCode,
  buildStarterLocationName,
  buildUsernameAttempt,
  buildUsernameSeeds,
  getSignupVerificationStateError,
  hashSignupToken,
  normalizeOnboardingError,
  normalizeSignupEmail,
  SIGNUP_VERIFICATION_ALREADY_USED_MESSAGE,
  slugifyText,
} from "@/lib/server/onboarding/utils"
import { normalizeUsernameLookup } from "@/lib/usernames"

type TenantRow = {
  id: string
  name: string
}

type UserRow = {
  id: string
  username: string
  tenant_id: string
  email: string | null
}

const ownerContext = normalizeTenantContext(undefined, "owner")

const loadSignupVerification = async (tokenHash: string) =>
  (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT
        sr.id,
        sr.name,
        sr.email,
        sr.normalized_email,
        sr.estate_name,
        sr.country,
        sr.preferred_locale,
        sr.password_hash,
        sr.status,
        sr.source,
        sr.tenant_id,
        sr.user_id,
        sr.generated_username,
        sr.verification_sent_at,
        sr.created_at,
        sr.verified_at,
        sr.provisioned_at,
        sr.provisioning_error,
        sr.last_ip_address,
        sr.last_user_agent,
        st.id AS token_id,
        st.expires_at AS token_expires_at,
        st.consumed_at AS token_consumed_at
      FROM signup_tokens st
      JOIN signup_requests sr
        ON sr.id = st.signup_request_id
      WHERE st.token_hash = ${tokenHash}
        AND st.purpose = 'verify_email'
      ORDER BY st.created_at DESC
      LIMIT 1
    `,
  )) as SignupVerificationLookup[]

const markProvisioningError = async (signupRequestId: string, errorMessage: string) => {
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE signup_requests
      SET provisioning_error = ${errorMessage}
      WHERE id = ${signupRequestId}
    `,
  )
}

const consumeSignupVerificationToken = async (tokenId: string) => {
  const rows = await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE signup_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ${tokenId}
        AND consumed_at IS NULL
      RETURNING id
    `,
  )
  return rows.length > 0
}

const loadTenant = async (tenantId: string) =>
  (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT id, name
      FROM tenants
      WHERE id = ${tenantId}
      LIMIT 1
    `,
  )) as TenantRow[]

const ensureTenant = async (signupRequest: SignupRequestRecord) => {
  const existingTenantId = String(signupRequest.tenant_id || "").trim()
  if (existingTenantId) {
    const existingTenant = (await loadTenant(existingTenantId))[0]
    if (existingTenant) return existingTenant
  }

  const created = (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      INSERT INTO tenants (name)
      VALUES (${signupRequest.estate_name})
      RETURNING id, name
    `,
  )) as TenantRow[]

  const tenant = created[0]
  await persistTenantPlanId(sql, tenant.id, "owner", DEFAULT_TENANT_PLAN_ID)
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE signup_requests
      SET tenant_id = ${tenant.id}
      WHERE id = ${signupRequest.id}
    `,
  )
  return tenant
}

const ensureTenantModules = async (tenantId: string) => {
  const starterModules = clampRequestedModuleStatesToPlan(
    MODULES.map((moduleEntry) => ({
      id: moduleEntry.id,
      enabled: moduleEntry.defaultEnabled === true,
    })),
    DEFAULT_TENANT_PLAN_ID,
  )

  for (const moduleEntry of starterModules) {
    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        INSERT INTO tenant_modules (tenant_id, module, enabled)
        VALUES (${tenantId}, ${moduleEntry.id}, ${moduleEntry.enabled})
        ON CONFLICT (tenant_id, module) DO NOTHING
      `,
    )
  }
}

const ensureStarterLocation = async (tenantId: string, estateName: string) => {
  const existingRows = await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT id
      FROM locations
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `,
  )

  if (existingRows.length > 0) {
    return
  }

  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      INSERT INTO locations (tenant_id, name, code)
      VALUES (${tenantId}, ${buildStarterLocationName(estateName)}, ${buildStarterLocationCode()})
      ON CONFLICT (tenant_id, code) DO NOTHING
    `,
  )
}

const usernameExists = async (username: string) => {
  const rows = await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT id
      FROM users
      WHERE LOWER(BTRIM(username)) = ${normalizeUsernameLookup(username)}
      LIMIT 1
    `,
  )
  return rows.length > 0
}

const buildUniqueUsername = async (signupRequest: SignupRequestRecord) => {
  const seeds = buildUsernameSeeds({
    email: signupRequest.email,
    name: signupRequest.name,
    estateName: signupRequest.estate_name,
  })

  for (const seed of seeds) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = buildUsernameAttempt(seed, attempt)
      if (!(await usernameExists(candidate))) {
        return candidate
      }
    }
  }

  const estateSlug = slugifyText(signupRequest.estate_name) || "estate"
  return `${estateSlug.slice(0, 18)}-${randomBytes(3).toString("hex")}`
}

const loadUserById = async (userId: string) =>
  (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT id, username, tenant_id, email
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `,
  )) as UserRow[]

const loadUserByEmail = async (normalizedEmail: string) =>
  (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      SELECT id, username, tenant_id, email
      FROM users
      WHERE normalized_email = ${normalizedEmail}
      LIMIT 1
    `,
  )) as UserRow[]

const ensureUser = async (signupRequest: SignupRequestRecord, tenantId: string) => {
  const existingUserId = String(signupRequest.user_id || "").trim()
  if (existingUserId) {
    const existingUser = (await loadUserById(existingUserId))[0]
    if (existingUser) {
      await runTenantQuery(
        sql,
        ownerContext,
        sql`
          UPDATE users
          SET
            email = ${signupRequest.email},
            normalized_email = ${signupRequest.normalized_email},
            email_verified_at = CURRENT_TIMESTAMP,
            preferred_locale = ${signupRequest.preferred_locale || "en"},
            requires_guided_setup = TRUE,
            setup_completed_at = NULL
          WHERE id = ${existingUser.id}
        `,
      )
      return { ...existingUser, email: signupRequest.email }
    }
  }

  const existingUserByEmail = (await loadUserByEmail(normalizeSignupEmail(signupRequest.email)))[0] || null
  if (existingUserByEmail) {
    if (existingUserByEmail.tenant_id !== tenantId) {
      throw new Error("This email is already linked to another tenant")
    }

    await runTenantQuery(
      sql,
      ownerContext,
        sql`
          UPDATE users
          SET
            email = ${signupRequest.email},
            normalized_email = ${signupRequest.normalized_email},
            email_verified_at = CURRENT_TIMESTAMP,
            preferred_locale = ${signupRequest.preferred_locale || "en"},
            password_hash = ${signupRequest.password_hash},
            password_reset_required = FALSE,
            password_updated_at = CURRENT_TIMESTAMP,
            requires_guided_setup = TRUE,
            setup_completed_at = NULL
        WHERE id = ${existingUserByEmail.id}
      `,
    )

    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        UPDATE signup_requests
        SET
          user_id = ${existingUserByEmail.id},
          generated_username = ${existingUserByEmail.username},
          tenant_id = ${tenantId}
        WHERE id = ${signupRequest.id}
      `,
    )

    return { ...existingUserByEmail, email: signupRequest.email }
  }

  const username = signupRequest.generated_username || (await buildUniqueUsername(signupRequest))
  const createdUsers = (await runTenantQuery(
    sql,
    ownerContext,
    sql`
      INSERT INTO users (
        username,
        email,
        normalized_email,
        email_verified_at,
        preferred_locale,
        password_hash,
        password_reset_required,
        password_updated_at,
        requires_guided_setup,
        setup_completed_at,
        role,
        tenant_id
      )
      VALUES (
        ${username},
        ${signupRequest.email},
        ${signupRequest.normalized_email},
        CURRENT_TIMESTAMP,
        ${signupRequest.preferred_locale || "en"},
        ${signupRequest.password_hash},
        FALSE,
        CURRENT_TIMESTAMP,
        TRUE,
        NULL,
        'admin',
        ${tenantId}
      )
      RETURNING id, username, tenant_id, email
    `,
  )) as UserRow[]

  const createdUser = createdUsers[0]
  await runTenantQuery(
    sql,
    ownerContext,
    sql`
      UPDATE signup_requests
      SET
        user_id = ${createdUser.id},
        generated_username = ${createdUser.username},
        tenant_id = ${tenantId}
      WHERE id = ${signupRequest.id}
    `,
  )

  return createdUser
}

export async function verifySignupToken(rawToken: string): Promise<SignupVerificationResult> {
  const token = String(rawToken || "").trim()
  if (!token) {
    throw new Error("Verification token is required")
  }

  const tokenHash = hashSignupToken(token)
  const lookupRows = await loadSignupVerification(tokenHash).catch((error) => {
    throw normalizeOnboardingError(error)
  })
  const signupVerification = lookupRows[0]

  if (!signupVerification) {
    throw new Error("Verification link is invalid")
  }

  const stateError = getSignupVerificationStateError({
    status: signupVerification.status,
    tokenConsumedAt: signupVerification.token_consumed_at,
    tokenExpiresAt: signupVerification.token_expires_at,
    provisionedAt: signupVerification.provisioned_at,
  })
  if (stateError) {
    throw new Error(stateError)
  }

  try {
    const tokenConsumed = await consumeSignupVerificationToken(signupVerification.token_id)
    if (!tokenConsumed) {
      throw new Error(SIGNUP_VERIFICATION_ALREADY_USED_MESSAGE)
    }

    if (!signupVerification.verified_at) {
      await runTenantQuery(
        sql,
        ownerContext,
        sql`
          UPDATE signup_requests
          SET
            status = 'verified',
            verified_at = CURRENT_TIMESTAMP,
            provisioning_error = NULL
          WHERE id = ${signupVerification.id}
        `,
      )
      signupVerification.verified_at = new Date().toISOString()
      signupVerification.status = "verified"
    }

    const tenant = await ensureTenant(signupVerification)
    await ensureTenantModules(tenant.id)
    await ensureStarterLocation(tenant.id, signupVerification.estate_name)
    const user = await ensureUser(signupVerification, tenant.id)

    await runTenantQuery(
      sql,
      ownerContext,
      sql`
        UPDATE signup_requests
        SET
          status = 'provisioned',
          tenant_id = ${tenant.id},
          user_id = ${user.id},
          generated_username = ${user.username},
          provisioned_at = COALESCE(provisioned_at, CURRENT_TIMESTAMP),
          provisioning_error = NULL
        WHERE id = ${signupVerification.id}
      `,
    )

    await logSecurityEvent({
      tenantId: tenant.id,
      actorUserId: user.id,
      actorUsername: user.username,
      actorRole: "admin",
      eventType: "auth_signup_verified",
      severity: "info",
      source: "auth/verify-email",
      metadata: {
        signupRequestId: signupVerification.id,
      },
    })

    await sendOwnerTenantCreatedAlert({
      tenantId: tenant.id,
      tenantName: tenant.name,
      origin: "self-serve-signup",
      actorName: signupVerification.name,
      actorEmail: signupVerification.email,
      username: user.username,
      createdBy: user.username,
      source: signupVerification.source,
    })

    return {
      email: signupVerification.email,
      tenantId: tenant.id,
      tenantName: tenant.name,
      userId: user.id,
      username: user.username,
      loginIdentifier: signupVerification.email,
    }
  } catch (error) {
    const normalizedError = normalizeOnboardingError(error)
    await markProvisioningError(signupVerification.id, normalizedError.message).catch(() => undefined)
    throw normalizedError
  }
}
