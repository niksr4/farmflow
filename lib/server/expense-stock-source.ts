import { runTenantQuery, type normalizeTenantContext } from "@/lib/server/tenant-db"

type TenantContext = ReturnType<typeof normalizeTenantContext>

/**
 * Which shed an expense takes its stock out of.
 *
 * An expense names the **block** the work happened on. Stock sits in a **store**. Those are
 * different rows in `locations` and always have been, so passing the expense's own location_id in
 * as the allocator's preferred slot could never match anything -- `getSlotPriority` compares
 * location ids, and a block id is not a store id. The preference was dead on arrival and every
 * allocation silently fell through to the general rule: take from whichever slot holds the most.
 *
 * With one store that is invisible and harmless. Medappa has two, one per estate, and there it is
 * wrong in a way nobody would catch from the screen: spraying a Tirtha block would draw the
 * chemical out of the Citrus Grove shed whenever Citrus Grove happened to hold more of it, and
 * both stores' balances would drift from the physical count with no error anywhere.
 *
 * The estate is the link. A block belongs to an estate; a store belongs to an estate or to none.
 * So the store to draw from is the one on the same estate as the block being worked -- and a
 * store with no estate serves every estate, the same always-shows rule `lib/estate-filter.ts`
 * applies everywhere else.
 *
 * Returns null when there is nothing better to say, which leaves the previous behaviour intact
 * rather than inventing a source: no block on the expense, a block with no estate, or an estate
 * with no store of its own.
 */
export async function resolveExpenseStockLocationId(
  // Loosely typed on purpose: lib/server/db exports the runtime client as a union depending on
  // whether APP_DATABASE_URL is set, and pinning one arm here would break at whichever call site
  // holds the other.
  sql: any,
  tenantContext: TenantContext,
  expenseLocationId: string | null,
): Promise<string | null> {
  if (!expenseLocationId) return null

  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      WITH worked AS (
        SELECT estate
        FROM locations
        WHERE id = ${expenseLocationId}
          AND tenant_id = ${tenantContext.tenantId}
      )
      SELECT s.id
      FROM locations s, worked w
      WHERE s.tenant_id = ${tenantContext.tenantId}
        AND s.kind = 'store'
        -- A store with no estate serves every estate. The comment above has said so since this
        -- file was written; the SQL did not implement it. s.estate = w.estate is NULL, not true,
        -- when s.estate is NULL, so a tenant whose single shed serves the whole property matched
        -- nothing and fell through to "take from whichever slot holds the most" -- the exact
        -- behaviour this function exists to replace. Laxmi, HoneyFarm and Seshagiri all keep one
        -- estate-wide store, so it has never worked for three of the four real tenants.
        AND (s.estate IS NULL OR (w.estate IS NOT NULL AND s.estate = w.estate))
      -- An estate's own store wins over the shared one; without this the shared store could be
      -- picked for a Medappa block that has a dedicated shed sitting right there.
      ORDER BY (s.estate IS NULL), s.created_at ASC
      LIMIT 1
    `,
  )

  return rows?.[0]?.id ? String(rows[0].id) : null
}
