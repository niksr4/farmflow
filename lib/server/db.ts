import "server-only"

import { neon } from "@neondatabase/serverless"

type DatabaseEnv = {
  NODE_ENV?: string
  DATABASE_URL?: string
  DATABASE_URL_DEV?: string
  APP_DATABASE_URL?: string
}

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

// Owner/DDL connection: used by migrations and the app's self-healing DDL paths
// (constraint/index repair, cache-table bootstrap). This role owns the schema.
export const resolveDatabaseUrl = (env: DatabaseEnv = process.env) => {
  const databaseUrl = normalizeEnvValue(env.DATABASE_URL)
  const databaseUrlDev = normalizeEnvValue(env.DATABASE_URL_DEV)

  if (env.NODE_ENV === "production") {
    return databaseUrl
  }

  return databaseUrlDev || databaseUrl
}

// Runtime query connection. When APP_DATABASE_URL is set it points at a least-privilege,
// NON-BYPASSRLS role so that row-level security actually isolates tenants (see
// scripts/44-db-roles.sql and scripts/98-enable-rls-all-tenant-tables.sql). When unset,
// this is identical to resolveDatabaseUrl — so behaviour is unchanged until the restricted
// role is provisioned and APP_DATABASE_URL is configured. This makes the isolation hardening
// a single env-var switch with no code deploy.
export const resolveAppDatabaseUrl = (env: DatabaseEnv = process.env) =>
  normalizeEnvValue(env.APP_DATABASE_URL) || resolveDatabaseUrl(env)

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

const baseUrl = resolveAppDatabaseUrl()
const adminUrl = resolveDatabaseUrl()
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

// Owner-privileged client for DDL / self-healing maintenance (constraint & index repair,
// cache-table bootstrap). Always the schema-owning connection, so these paths keep working
// even after APP_DATABASE_URL routes normal queries through a least-privilege role.
// Falls back to the runtime client when no separate owner URL is configured.
export const adminSql = adminUrl ? neon(adminUrl) : sql

export const isDbConfigured = Boolean(baseUrl)
export const databaseUrlSource = baseUrlSource
