import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { runTenantQuery } from "@/lib/server/tenant-db"

type TenantContext = {
  tenantId: string
  role: string
}

type LocationScope = string | null

const isRestockType = (value: string) => {
  const normalized = value.toLowerCase()
  return normalized === "restock" || normalized === "restocking"
}

async function recalculateInventoryForLocation(
  sql: NeonQueryFunction<any, any>,
  tenantContext: TenantContext,
  itemType: string,
  locationId: LocationScope,
) {
  const transactions = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT transaction_type, quantity, total_cost
      FROM transaction_history
      WHERE item_type = ${itemType}
        AND tenant_id = ${tenantContext.tenantId}
        AND location_id IS NOT DISTINCT FROM ${locationId}
      ORDER BY transaction_date ASC, id ASC
    `,
  )

  let runningQty = 0
  let runningCost = 0

  for (const row of transactions || []) {
    const qty = Number(row.quantity) || 0
    const totalCost = Number(row.total_cost) || 0
    const type = String(row.transaction_type || "")

    if (isRestockType(type)) {
      runningQty += qty
      runningCost += totalCost
      continue
    }

    const avgCost = runningQty > 0 ? runningCost / runningQty : 0
    const depletionCost = avgCost * qty
    runningQty = Math.max(0, runningQty - qty)
    runningCost = Math.max(0, runningCost - depletionCost)
  }

  const avgPrice = runningQty > 0 ? runningCost / runningQty : 0
  const unitRow = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT unit
      FROM current_inventory
      WHERE item_type = ${itemType}
        AND tenant_id = ${tenantContext.tenantId}
        AND location_id IS NOT DISTINCT FROM ${locationId}
      LIMIT 1
    `,
  )
  const unit = unitRow?.[0]?.unit ? String(unitRow[0].unit) : "kg"

  if (locationId) {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
        VALUES (${itemType}, ${runningQty}, ${unit}, ${avgPrice}, ${runningCost}, ${tenantContext.tenantId}, ${locationId})
        ON CONFLICT (item_type, tenant_id, location_id)
        DO UPDATE SET
          quantity = ${runningQty},
          unit = ${unit},
          avg_price = ${avgPrice},
          total_cost = ${runningCost}
      `,
    )
  } else {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
        VALUES (${itemType}, ${runningQty}, ${unit}, ${avgPrice}, ${runningCost}, ${tenantContext.tenantId}, NULL)
        ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
        DO UPDATE SET
          quantity = ${runningQty},
          unit = ${unit},
          avg_price = ${avgPrice},
          total_cost = ${runningCost}
      `,
    )
  }

  return {
    quantity: runningQty,
    total_cost: runningCost,
    avg_price: avgPrice,
    unit,
  }
}

export async function recalculateInventoryForItem(
  sql: NeonQueryFunction<any, any>,
  tenantContext: TenantContext,
  itemType: string,
  locationId?: LocationScope,
) {
  if (locationId === undefined) {
    const locations = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT DISTINCT location_id
        FROM transaction_history
        WHERE item_type = ${itemType}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )
    if (!locations || locations.length === 0) {
      return recalculateInventoryForLocation(sql, tenantContext, itemType, null)
    }
    const results = []
    for (const row of locations) {
      const loc = row.location_id ? String(row.location_id) : null
      results.push(await recalculateInventoryForLocation(sql, tenantContext, itemType, loc))
    }
    return results
  }

  return recalculateInventoryForLocation(sql, tenantContext, itemType, locationId ?? null)
}
