import "server-only"

// Cross-tenant queries (enumerating every tenant's digest recipient / rainfall) run from a
// cron-triggered agent, not a per-request handler, so they use the RLS-bypassing owner
// connection — there's no single app.tenant_id session context to set here.
import { adminSql as sql } from "@/lib/server/db"
import { mergeTenantEstateProfile, buildTenantWeatherQuery } from "@/lib/tenant-estate-profile"

export type TenantDigestRow = {
  tenantId: string
  tenantName: string
  ownerEmail: string
  ownerName: string
  cropFamily: string | null
  primaryVarieties: string[]
  weatherLocationQuery: string | null
}

const toRows = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  const candidate = (value as any)?.rows
  return Array.isArray(candidate) ? (candidate as T[]) : []
}

export async function fetchTenantOwnersWithVerifiedEmail(): Promise<TenantDigestRow[]> {
  if (!sql) throw new Error("Database not configured")

  // Prefer the explicit digest_email the user set in Settings.
  // Fall back to users.email only when it has been verified (self-serve signups).
  // Username-only tenants (no email, no digest_email) are skipped — they won't
  // receive a digest until they add an address in Settings.
  const result = await sql.query(`
    SELECT DISTINCT ON (t.id)
      t.id AS tenant_id,
      t.name AS tenant_name,
      t.ui_preferences,
      COALESCE(
        NULLIF(BTRIM(u.digest_email), ''),
        CASE WHEN u.email_verified_at IS NOT NULL THEN NULLIF(BTRIM(u.email), '') END
      ) AS owner_email,
      COALESCE(u.username, u.email) AS owner_name
    FROM tenants t
    JOIN users u ON u.tenant_id = t.id
    WHERE COALESCE(
        NULLIF(BTRIM(u.digest_email), ''),
        CASE WHEN u.email_verified_at IS NOT NULL THEN NULLIF(BTRIM(u.email), '') END
      ) IS NOT NULL
      AND u.role IN ('owner', 'admin')
    ORDER BY t.id, CASE u.role WHEN 'owner' THEN 0 ELSE 1 END, u.created_at ASC
  `)

  return toRows<any>(result).map((row: any) => {
    const prefs = row.ui_preferences && typeof row.ui_preferences === "object" ? row.ui_preferences : {}
    const profile = mergeTenantEstateProfile(prefs.estateProfile ?? null)
    return {
      tenantId: String(row.tenant_id),
      tenantName: String(row.tenant_name || "Your Estate"),
      ownerEmail: String(row.owner_email),
      ownerName: String(row.owner_name || "Estate Manager"),
      cropFamily: profile.cropFamily,
      primaryVarieties: profile.primaryVarieties,
      weatherLocationQuery: buildTenantWeatherQuery(profile) ?? null,
    }
  })
}

export type RecentRainfallSummary = {
  last7DaysInches: number
  last30DaysInches: number
  loggedDaysInLast30: number
  recentDailyAverageInches: number
}

export async function fetchRecentRainfallSummary(tenantId: string): Promise<RecentRainfallSummary> {
  const empty: RecentRainfallSummary = { last7DaysInches: 0, last30DaysInches: 0, loggedDaysInLast30: 0, recentDailyAverageInches: 0 }
  if (!sql) return empty
  try {
    const result = await sql.query(`
      SELECT
        COALESCE(SUM(CASE WHEN record_date >= NOW() - INTERVAL '7 days'  THEN inches + cents::numeric/100 END), 0) AS last7,
        COALESCE(SUM(CASE WHEN record_date >= NOW() - INTERVAL '30 days' THEN inches + cents::numeric/100 END), 0) AS last30,
        COUNT(CASE  WHEN record_date >= NOW() - INTERVAL '30 days' THEN 1 END) AS logged30
      FROM rainfall_records
      WHERE tenant_id = $1
    `, [tenantId])
    const row = (Array.isArray(result) ? result[0] : (result as any)?.rows?.[0]) ?? {}
    const last7 = Number(row.last7) || 0
    const last30 = Number(row.last30) || 0
    const logged30 = Number(row.logged30) || 0
    return {
      last7DaysInches: last7,
      last30DaysInches: last30,
      loggedDaysInLast30: logged30,
      recentDailyAverageInches: logged30 > 0 ? last30 / logged30 : 0,
    }
  } catch {
    return empty
  }
}
