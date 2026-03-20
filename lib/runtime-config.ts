const PRODUCTION_BUILD_PHASE = "phase-production-build"

type RuntimeConfigValidation = {
  valid: boolean
  errors: string[]
}

let runtimeConfigValidated = false

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

const resolveDatabaseUrl = (env: NodeJS.ProcessEnv) => {
  const databaseUrl = normalizeEnvValue(env.DATABASE_URL)
  const databaseUrlDev = normalizeEnvValue(env.DATABASE_URL_DEV)
  if (env.NODE_ENV === "production") {
    return databaseUrl
  }
  return databaseUrlDev || databaseUrl
}

const resolveExplicitAppUrl = (env: NodeJS.ProcessEnv) =>
  normalizeEnvValue(env.NEXT_PUBLIC_APP_URL) || normalizeEnvValue(env.NEXTAUTH_URL)

const isLocalUrl = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1"

const shouldSkipValidation = (env: NodeJS.ProcessEnv) =>
  env.NODE_ENV === "test" || env.NEXT_PHASE === PRODUCTION_BUILD_PHASE

export function validateCoreRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfigValidation {
  if (shouldSkipValidation(env)) {
    return { valid: true, errors: [] }
  }

  const errors: string[] = []
  const nextAuthSecret = normalizeEnvValue(env.NEXTAUTH_SECRET)
  const databaseUrl = resolveDatabaseUrl(env)
  const explicitAppUrl = resolveExplicitAppUrl(env)

  if (!nextAuthSecret) {
    errors.push("NEXTAUTH_SECRET is required")
  }

  if (!databaseUrl) {
    if (env.NODE_ENV === "production") {
      errors.push("DATABASE_URL is required")
    } else {
      errors.push("DATABASE_URL_DEV or DATABASE_URL is required")
    }
  }

  if (explicitAppUrl) {
    try {
      const parsed = new URL(explicitAppUrl)
      if (env.NODE_ENV === "production" && parsed.protocol !== "https:" && !isLocalUrl(parsed)) {
        errors.push("NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must use https in production")
      }
    } catch {
      errors.push("NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must be a valid URL")
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function assertCoreRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  if (runtimeConfigValidated || shouldSkipValidation(env)) {
    return
  }

  const validation = validateCoreRuntimeConfig(env)
  if (!validation.valid) {
    throw new Error(`Invalid runtime configuration: ${validation.errors.join("; ")}`)
  }

  runtimeConfigValidated = true
}

