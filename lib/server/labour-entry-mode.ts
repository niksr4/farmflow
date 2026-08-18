import { accountsSql } from "@/lib/server/db"
import { runTenantQuery, type normalizeTenantContext } from "@/lib/server/tenant-db"

/**
 * Which way a tenant records labour, and from when.
 *
 * A tenant with no row has not switched: everything is typed into Accounts, exactly as before.
 * A tenant with a row records labour on the muster roll from that date, and labour_cost stops
 * counting their Accounts entries for those days (scripts/117).
 *
 * That last part is why writes have to be guarded. Left alone, the Accounts form would happily
 * accept and save an entry dated after the switch, show it in its own list, and quietly leave it
 * out of every total in the app -- money entered, receipt shown, nothing counted. Refusing the
 * write is the only honest option; the alternative is a number that is wrong in the safe-looking
 * direction.
 */

type TenantContext = ReturnType<typeof normalizeTenantContext>

export const getLabourCutover = async (tenantContext: TenantContext): Promise<string | null> => {
  try {
    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT assignments_from::text AS from_date
        FROM tenant_labour_entry_mode
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
    )
    const value = (rows?.[0] as { from_date?: string } | undefined)?.from_date
    return value ? String(value).slice(0, 10) : null
  } catch {
    // The table only exists from migration 116. On an instance without it nobody has switched,
    // so the honest answer is "not switched" rather than a 500 on every labour write.
    return null
  }
}

/**
 * Null when the write is allowed, otherwise the reason it is not.
 * `date` is any parseable date; only the calendar day matters.
 */
export const blockedByLabourCutover = async (
  tenantContext: TenantContext,
  date: unknown,
): Promise<string | null> => {
  const day = String(date ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null

  const cutover = await getLabourCutover(tenantContext)
  if (!cutover || day < cutover) return null

  return (
    `From ${cutover} this estate records labour on the muster roll, so an entry dated ${day} ` +
    `would not be counted anywhere. Open Attendance for that day and set each worker's work instead.`
  )
}

/**
 * The same guard pointing the other way: null when a muster allocation is allowed, otherwise why not.
 *
 * labour_cost counts a muster row only when the tenant has a cutover AND the work is dated on or
 * after it. Both halves matter, and missing either one produces the identical failure -- a row
 * saved, a receipt shown, and no total anywhere that moves.
 *
 *   no cutover at all      -> the estate never switched. The Muster tab is still visible to them
 *                             (it is gated on the accounts module, which everyone has) and "Set
 *                             work" is right there, so this is reachable by anyone, not just by
 *                             a tenant mid-migration. Refuse.
 *   dated before cutover   -> those days are read from the old Accounts entries. Refuse.
 *   dated on/after cutover -> allowed.
 *
 * The no-cutover case is the one that bites hardest, because nothing about that tenant's screen
 * suggests they are doing something the app will ignore.
 */
export const blockedByLabourCutoverBefore = async (
  tenantContext: TenantContext,
  date: unknown,
): Promise<string | null> => {
  const day = String(date ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null

  const cutover = await getLabourCutover(tenantContext)

  if (!cutover) {
    return (
      `This estate records labour in Costs, not on the muster roll, so work set here would not be ` +
      `counted anywhere. Mark attendance as usual and enter the day's labour in Costs.`
    )
  }

  if (day >= cutover) return null

  return (
    `This estate records labour on the muster roll from ${cutover}. Work dated ${day} belongs to ` +
    `the earlier way of recording, so an allocation here would not be counted anywhere — enter it ` +
    `in Costs instead.`
  )
}
