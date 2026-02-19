import "server-only"

import type { NeonQueryFunction, NeonQueryPromise } from "@neondatabase/serverless"

const FALLBACK_TENANT_ID = "00000000-0000-0000-0000-000000000000"

export type NeonSql = NeonQueryFunction<any, any>

type TenantContext = {
  tenantId: string
  role: string
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
  const results = await client.transaction([
    client`SELECT set_config('TimeZone', 'UTC', true)`,
    client`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`,
    client`SELECT set_config('app.role', ${context.role}, true)`,
    query,
  ])

  return results[3] as T[]
}

export async function runTenantQueries(
  client: NeonSql,
  context: TenantContext,
  queries: NeonQueryPromise<any, any, any>[],
): Promise<any[][]> {
  const results = await client.transaction([
    client`SELECT set_config('TimeZone', 'UTC', true)`,
    client`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`,
    client`SELECT set_config('app.role', ${context.role}, true)`,
    ...queries,
  ])

  return results.slice(3) as any[][]
}
