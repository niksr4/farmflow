import "server-only"

import { neon } from "@neondatabase/serverless"

type DatabaseEnv = {
  NODE_ENV?: string
  DATABASE_URL?: string
  DATABASE_URL_DEV?: string
}

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

export const resolveDatabaseUrl = (env: DatabaseEnv = process.env) => {
  const databaseUrl = normalizeEnvValue(env.DATABASE_URL)
  const databaseUrlDev = normalizeEnvValue(env.DATABASE_URL_DEV)

  if (env.NODE_ENV === "production") {
    return databaseUrl
  }

  return databaseUrlDev || databaseUrl
}

export const resolveDatabaseUrlSource = (env: DatabaseEnv = process.env) => {
  const databaseUrl = normalizeEnvValue(env.DATABASE_URL)
  const databaseUrlDev = normalizeEnvValue(env.DATABASE_URL_DEV)

  if (env.NODE_ENV === "production") {
    return databaseUrl ? "DATABASE_URL" : null
  }

  if (databaseUrlDev) return "DATABASE_URL_DEV"
  if (databaseUrl) return "DATABASE_URL"
  return null
}

const baseUrl = resolveDatabaseUrl()
const baseUrlSource = resolveDatabaseUrlSource()

const buildMissingDatabaseConfigMessage = () =>
  process.env.NODE_ENV === "production"
    ? "Database not configured. Set DATABASE_URL."
    : "Database not configured. Set DATABASE_URL_DEV or DATABASE_URL for local development."

const createUnavailableClient = (): ReturnType<typeof neon> => {
  const throwUnavailable = () => {
    throw new Error(buildMissingDatabaseConfigMessage())
  }
  const unavailable = ((..._args: any[]) => {
    throwUnavailable()
  }) as unknown as ReturnType<typeof neon>
  unavailable.query = ((() => {
    throwUnavailable()
  }) as unknown) as typeof unavailable.query
  unavailable.transaction = ((async () => {
    throwUnavailable()
  }) as unknown) as typeof unavailable.transaction
  unavailable.unsafe = (((_rawSql: string) => {
    throwUnavailable()
  }) as unknown) as typeof unavailable.unsafe
  return unavailable
}

export const sql = baseUrl ? neon(baseUrl) : createUnavailableClient()
export const inventorySql = sql
export const accountsSql = sql
export const processingSql = sql
export const isDbConfigured = Boolean(baseUrl)
export const databaseUrlSource = baseUrlSource
