import "server-only"

import type { NeonQueryFunction, NeonQueryPromise } from "@neondatabase/serverless"

const FALLBACK_TENANT_ID = "00000000-0000-0000-0000-000000000000"
const MAX_TRANSIENT_RETRIES = 3
const RETRY_BASE_DELAY_MS = 200

export type NeonSql = NeonQueryFunction<any, any>

type TenantContext = {
  tenantId: string
  role: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const collectErrorMessages = (error: unknown) => {
  const values = new Set<string>()
  const queue: any[] = [error]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const message = typeof current?.message === "string" ? current.message.trim() : ""
    if (message) values.add(message)
    if (typeof current?.code === "string" && current.code.trim()) values.add(current.code.trim())
    if (current?.cause) queue.push(current.cause)
    if (current?.sourceError) queue.push(current.sourceError)
  }

  return Array.from(values).join(" | ")
}

const isTransientConnectionError = (error: unknown) => {
  const details = collectErrorMessages(error).toLowerCase()
  if (!details) return false
  return (
    details.includes("fetch failed") ||
    details.includes("signal is aborted") ||
    details.includes("aborted without reason") ||
    details.includes("aborterror") ||
    details.includes("operation was aborted") ||
    details.includes("econnreset") ||
    details.includes("connect timeout") ||
    details.includes("und_err_connect_timeout") ||
    details.includes("etimedout") ||
    details.includes("ecanceled")
  )
}

const buildConnectionError = (error: unknown) => {
  const normalized = new Error("Database connection was interrupted. Please retry.", {
    cause: error instanceof Error ? error : undefined,
  })
  normalized.name = "TenantDbConnectionError"
  return normalized
}

export function normalizeTenantContext(tenantId?: string | null, role?: string | null): TenantContext {
  return {
    tenantId: tenantId || FALLBACK_TENANT_ID,
    role: role || "user",
  }
}

export async function runTenantQuery<T = any>(
  client: NeonSql,
  context: TenantContext,
  query: NeonQueryPromise<any, any, any>,
): Promise<T[]> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    try {
      const results = await client.transaction([
        client`SELECT set_config('TimeZone', 'UTC', true)`,
        client`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`,
        client`SELECT set_config('app.role', ${context.role}, true)`,
        query,
      ])

      return results[3] as T[]
    } catch (error) {
      lastError = error
      const canRetry = isTransientConnectionError(error) && attempt < MAX_TRANSIENT_RETRIES
      if (!canRetry) break
      await delay(RETRY_BASE_DELAY_MS * attempt)
    }
  }

  if (isTransientConnectionError(lastError)) {
    throw buildConnectionError(lastError)
  }
  throw lastError
}

export async function runTenantQueries(
  client: NeonSql,
  context: TenantContext,
  queries: NeonQueryPromise<any, any, any>[],
): Promise<any[][]> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    try {
      const results = await client.transaction([
        client`SELECT set_config('TimeZone', 'UTC', true)`,
        client`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`,
        client`SELECT set_config('app.role', ${context.role}, true)`,
        ...queries,
      ])

      return results.slice(3) as any[][]
    } catch (error) {
      lastError = error
      const canRetry = isTransientConnectionError(error) && attempt < MAX_TRANSIENT_RETRIES
      if (!canRetry) break
      await delay(RETRY_BASE_DELAY_MS * attempt)
    }
  }

  if (isTransientConnectionError(lastError)) {
    throw buildConnectionError(lastError)
  }
  throw lastError
}
