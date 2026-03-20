import { loadEnvConfig } from "@next/env"
import { neon } from "@neondatabase/serverless"

loadEnvConfig(process.cwd())

const databaseUrl = String(process.env.DATABASE_URL_DEV || "").trim()

const getDb = () => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_DEV is required for self-serve onboarding e2e")
  }
  return neon(databaseUrl)
}

export const cleanupSelfServeSignup = async (normalizedEmail: string) => {
  const email = String(normalizedEmail || "").trim().toLowerCase()
  if (!email) {
    return
  }

  const db = getDb()
  const signupRows = await db`
    SELECT id, tenant_id, user_id
    FROM signup_requests
    WHERE normalized_email = ${email}
  `

  const tenantIds = Array.from(
    new Set(
      signupRows
        .map((row: any) => String(row.tenant_id || "").trim())
        .filter(Boolean),
    ),
  )

  const userIds = Array.from(
    new Set(
      signupRows
        .map((row: any) => String(row.user_id || "").trim())
        .filter(Boolean),
    ),
  )

  if (signupRows.length) {
    const signupIds = signupRows.map((row: any) => String(row.id))
    await db`DELETE FROM signup_tokens WHERE signup_request_id = ANY(${signupIds})`
    await db`DELETE FROM signup_requests WHERE id = ANY(${signupIds})`
  }

  if (userIds.length) {
    await db`DELETE FROM user_modules WHERE user_id = ANY(${userIds})`
    await db`DELETE FROM users WHERE id = ANY(${userIds})`
  } else {
    await db`DELETE FROM users WHERE normalized_email = ${email}`
  }

  if (tenantIds.length) {
    await db`DELETE FROM locations WHERE tenant_id = ANY(${tenantIds})`
    await db`DELETE FROM tenant_modules WHERE tenant_id = ANY(${tenantIds})`
    await db`DELETE FROM tenants WHERE id = ANY(${tenantIds})`
  }
}
