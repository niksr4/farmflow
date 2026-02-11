import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

const accountActivities = [
  { code: "ADMIN", activity: "Administrative Expenses" },
  { code: "LABOR", activity: "Labor Costs" },
  { code: "SUPPLIES", activity: "Office Supplies" },
  { code: "UTILITIES", activity: "Utilities" },
  { code: "MAINT", activity: "Equipment Maintenance" },
  { code: "TRANSPORT", activity: "Transportation" },
  { code: "MARKETING", activity: "Marketing and Advertising" },
  { code: "INSURANCE", activity: "Insurance" },
  { code: "RENT", activity: "Rent and Facilities" },
  { code: "MISC", activity: "Miscellaneous Expenses" },
]

const seedLocations = [
  { name: "HF", code: "HF" },
  { name: "MV", code: "MV" },
  { name: "PG", code: "PG" },
]

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const tenantId = String(body.tenantId || "").trim()

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const tenant = await runTenantQuery(
      sql,
      tenantContext,
      sql`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`,
    )
    if (!tenant || tenant.length === 0) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const existingData = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT 1 FROM transaction_history WHERE tenant_id = ${tenantId} LIMIT 1
      `,
    )
    if (existingData.length > 0) {
      return NextResponse.json(
        { success: false, error: "Tenant already has data. Clear it before seeding again." },
        { status: 400 },
      )
    }

    for (const location of seedLocations) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO locations (tenant_id, name, code)
          VALUES (${tenantId}, ${location.name}, ${location.code})
          ON CONFLICT (tenant_id, code) DO NOTHING
        `,
      )
    }

    const locationRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`SELECT id, code FROM locations WHERE tenant_id = ${tenantId}`,
    )
    const locationByCode = new Map(locationRows.map((row: any) => [row.code, row.id]))

    const hfId = locationByCode.get("HF")
    const mvId = locationByCode.get("MV")
    const pgId = locationByCode.get("PG")
    const defaultLocationId = hfId || mvId || pgId || locationRows[0]?.id || null

    for (const activity of accountActivities) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO account_activities (code, activity, tenant_id, location_id)
          VALUES (${activity.code}, ${activity.activity}, ${tenantId}, ${defaultLocationId})
          ON CONFLICT DO NOTHING
        `,
      )
    }

    const transactions = [
      {
        item_type: "Arabica Cherry",
        quantity: 1200,
        transaction_type: "restock",
        notes: "Initial harvest intake",
        user_id: "seed",
        price: 40,
        total_cost: 48000,
      },
      {
        item_type: "Robusta Cherry",
        quantity: 900,
        transaction_type: "restock",
        notes: "Initial harvest intake",
        user_id: "seed",
        price: 32,
        total_cost: 28800,
      },
      {
        item_type: "Arabica Cherry",
        quantity: 200,
        transaction_type: "deplete",
        notes: "Processing loss",
        user_id: "seed",
        price: 0,
        total_cost: 0,
      },
      {
        item_type: "Dry Parchment",
        quantity: 300,
        transaction_type: "restock",
        notes: "Drying output",
        user_id: "seed",
        price: 120,
        total_cost: 36000,
      },
    ]

    for (const tx of transactions) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO transaction_history (
            item_type,
            quantity,
            transaction_type,
            notes,
            user_id,
            price,
            total_cost,
            tenant_id,
            location_id
          )
          VALUES (
            ${tx.item_type},
            ${tx.quantity},
            ${tx.transaction_type},
            ${tx.notes},
            ${tx.user_id},
            ${tx.price},
            ${tx.total_cost},
            ${tenantId},
            ${defaultLocationId}
          )
        `,
      )
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO labor_transactions (
          deployment_date,
          code,
          hf_laborers,
          hf_cost_per_laborer,
          outside_laborers,
          outside_cost_per_laborer,
          total_cost,
          notes,
          tenant_id,
          location_id
        )
        VALUES
          (${daysAgo(12)}::timestamp, 'LABOR', 12, 450, 3, 500, 6900, 'Harvest team', ${tenantId}, ${defaultLocationId}),
          (${daysAgo(7)}::timestamp, 'ADMIN', 4, 300, 0, 0, 1200, 'Admin support', ${tenantId}, ${defaultLocationId})
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO expense_transactions (
          entry_date,
          code,
          total_amount,
          notes,
          tenant_id,
          location_id
        )
        VALUES
          (${daysAgo(14)}::timestamp, 'SUPPLIES', 1800, 'Drying tarps', ${tenantId}, ${defaultLocationId}),
          (${daysAgo(6)}::timestamp, 'TRANSPORT', 2400, 'Truck fuel', ${tenantId}, ${defaultLocationId}),
          (${daysAgo(3)}::timestamp, 'MAINT', 950, 'Machine servicing', ${tenantId}, ${defaultLocationId})
      `,
    )

    const processingSeedRows = [
      { locationId: hfId, coffeeType: "Arabica" },
      { locationId: hfId, coffeeType: "Robusta" },
      { locationId: mvId, coffeeType: "Robusta" },
      { locationId: pgId, coffeeType: "Robusta" },
    ].filter((row) => row.locationId)

    for (const seed of processingSeedRows) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO processing_records (
            tenant_id,
            location_id,
            coffee_type,
            process_date,
            crop_today,
            crop_todate,
            ripe_today,
            ripe_todate,
            green_today,
            green_todate,
            float_today,
            float_todate,
            wet_parchment,
            dry_parch,
            dry_cherry,
            dry_p_bags,
            dry_cherry_bags,
            notes
          )
          VALUES (
            ${tenantId},
            ${seed.locationId},
            ${seed.coffeeType},
            ${daysAgo(5)}::date,
            1200,
            5400,
            950,
            4200,
            120,
            520,
            60,
            310,
            300,
            260,
            110,
            5,
            2,
            'Steady ripening'
          )
          ON CONFLICT (tenant_id, location_id, coffee_type, process_date) DO NOTHING
        `,
      )
    }

    const pepperSeedRows = [hfId, mvId, pgId].filter(Boolean)
    for (const locationId of pepperSeedRows) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO pepper_records (
            tenant_id,
            location_id,
            process_date,
            kg_picked,
            green_pepper,
            green_pepper_percent,
            dry_pepper,
            dry_pepper_percent,
            notes,
            recorded_by
          )
          VALUES (
            ${tenantId},
            ${locationId},
            ${daysAgo(8)}::date,
            420,
            320,
            76,
            100,
            24,
            'Good drying conditions',
            'seed'
          )
          ON CONFLICT (tenant_id, location_id, process_date) DO NOTHING
        `,
      )
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO rainfall_records (record_date, inches, cents, notes, user_id, tenant_id)
        VALUES
          (${daysAgo(9)}::date, 2, 5, 'Light showers', 'seed', ${tenantId}),
          (${daysAgo(2)}::date, 5, 0, 'Heavy rain', 'seed', ${tenantId})
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO dispatch_records (
          dispatch_date,
          location_id,
          estate,
          coffee_type,
          bag_type,
          bags_dispatched,
          price_per_bag,
          buyer_name,
          notes,
          created_by,
          tenant_id
        )
        VALUES
          (${daysAgo(4)}::date, ${hfId || defaultLocationId}, 'HF', 'Arabica', 'Dry Parchment', 80, 6200, 'Coastal Buyers', 'First shipment', 'seed', ${tenantId}),
          (${daysAgo(1)}::date, ${mvId || defaultLocationId}, 'MV', 'Robusta', 'Dry Cherry', 55, 5400, 'Metro Traders', 'Follow-up order', 'seed', ${tenantId})
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO sales_records (
          sale_date,
          batch_no,
          location_id,
          estate,
          coffee_type,
          bag_type,
          weight_kgs,
          price_per_kg,
          total_revenue,
          bags_sent,
          kgs,
          bags_sold,
          price_per_bag,
          revenue,
          bank_account,
          notes,
          tenant_id
        )
        VALUES
          (${daysAgo(3)}::date, 'BL-102', ${hfId || defaultLocationId}, 'HF', 'Arabica', 'Dry Parchment', 4000, 78, 312000, 80, 4000, 60, 6500, 390000, 'HDFC-Primary', 'Partial payment', ${tenantId}),
          (${daysAgo(0)}::date, 'BL-108', ${mvId || defaultLocationId}, 'MV', 'Robusta', 'Dry Cherry', 2750, 70, 192500, 55, 2750, 30, 5600, 168000, 'HDFC-Primary', 'Advance received', ${tenantId})
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "upsert",
      entityType: "tenant_seed",
      entityId: tenantId,
      after: {
        locations: seedLocations.length,
        activities: accountActivities.length,
        transactions: transactions.length,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error seeding tenant data:", error)
    return adminErrorResponse(error, "Failed to seed tenant data")
  }
}
