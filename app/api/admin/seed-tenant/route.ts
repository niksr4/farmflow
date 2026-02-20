import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { recalculateInventoryForItem } from "@/lib/server/inventory-recalc"

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

const isMissingRelation = (error: unknown) => {
  const message = String((error as Error)?.message || error)
  return /relation\s+"[^"]+"\s+does not exist/i.test(message)
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

const seededBy = "seed"

const seededInventoryUnits: Record<string, string> = {
  "Urea Fertilizer": "kg",
  "NPK 19-19-19": "kg",
  "Diesel (L)": "L",
  "Fungicide (L)": "L",
  "Jute Bags": "bags",
}

const daysAgo = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

type OptionalSeedStep = {
  label: string
  run: () => Promise<void>
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
    const resetExisting = Boolean(body.resetExisting)

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const tenantRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, name
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )
    if (!tenantRows || tenantRows.length === 0) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const tenantName = String(tenantRows[0]?.name || "").trim()
    if (tenantName.toLowerCase().includes("honeyfarm")) {
      return NextResponse.json(
        {
          success: false,
          error: "Seeding is blocked for HoneyFarm. Use a dedicated mock/demo tenant.",
        },
        { status: 400 },
      )
    }

    const resetSummary = {
      applied: false,
      clearedTables: [] as string[],
      skippedTables: [] as string[],
    }
    if (resetExisting) {
      const resetTables = [
        "billing_invoice_items",
        "billing_invoices",
        "receivables",
        "quality_grading_records",
        "curing_records",
        "journal_entries",
        "sales_records",
        "dispatch_records",
        "rainfall_records",
        "pepper_records",
        "processing_records",
        "expense_transactions",
        "labor_transactions",
        "transaction_history",
        "current_inventory",
      ]
      for (const table of resetTables) {
        try {
          await runTenantQuery(
            sql,
            tenantContext,
            sql.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]),
          )
          resetSummary.clearedTables.push(table)
        } catch (error) {
          if (isMissingRelation(error)) {
            resetSummary.skippedTables.push(table)
            continue
          }
          throw error
        }
      }
      resetSummary.applied = true
    } else {
      const existingData = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT 1
          FROM transaction_history
          WHERE tenant_id = ${tenantId}
          LIMIT 1
        `,
      )
      if (existingData.length > 0) {
        return NextResponse.json(
          { success: false, error: "Tenant already has data. Use reseed mode to replace mock records." },
          { status: 400 },
        )
      }
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
      sql`
        SELECT id, code
        FROM locations
        WHERE tenant_id = ${tenantId}
      `,
    )
    const locationByCode = new Map(locationRows.map((row: any) => [row.code, row.id]))

    const hfId = locationByCode.get("HF")
    const mvId = locationByCode.get("MV")
    const pgId = locationByCode.get("PG")
    const defaultLocationId = hfId || mvId || pgId || locationRows[0]?.id || null
    const hfLocationId = hfId || defaultLocationId
    const mvLocationId = mvId || defaultLocationId
    const pgLocationId = pgId || defaultLocationId

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
        days: 24,
        locationId: hfLocationId,
        item_type: "Urea Fertilizer",
        quantity: 1800,
        transaction_type: "restock",
        notes: "Pre-season fertilizer stock",
        user_id: seededBy,
        price: 39,
        total_cost: 70200,
      },
      {
        days: 23,
        locationId: mvLocationId,
        item_type: "NPK 19-19-19",
        quantity: 1200,
        transaction_type: "restock",
        notes: "Nutrient blend for Robusta blocks",
        user_id: seededBy,
        price: 63,
        total_cost: 75600,
      },
      {
        days: 22,
        locationId: pgLocationId,
        item_type: "Diesel (L)",
        quantity: 900,
        transaction_type: "restock",
        notes: "Fuel for pulpers and transport",
        user_id: seededBy,
        price: 94,
        total_cost: 84600,
      },
      {
        days: 21,
        locationId: hfLocationId,
        item_type: "Fungicide (L)",
        quantity: 160,
        transaction_type: "restock",
        notes: "Rust prevention inventory",
        user_id: seededBy,
        price: 520,
        total_cost: 83200,
      },
      {
        days: 19,
        locationId: mvLocationId,
        item_type: "Jute Bags",
        quantity: 450,
        transaction_type: "restock",
        notes: "Packaging replenishment",
        user_id: seededBy,
        price: 30,
        total_cost: 13500,
      },
      {
        days: 15,
        locationId: hfLocationId,
        item_type: "Urea Fertilizer",
        quantity: 280,
        transaction_type: "deplete",
        notes: "Block A nutrient application",
        user_id: seededBy,
        price: 0,
        total_cost: 0,
      },
      {
        days: 12,
        locationId: mvLocationId,
        item_type: "NPK 19-19-19",
        quantity: 210,
        transaction_type: "deplete",
        notes: "Robusta foliar feed cycle",
        user_id: seededBy,
        price: 0,
        total_cost: 0,
      },
      {
        days: 10,
        locationId: pgLocationId,
        item_type: "Diesel (L)",
        quantity: 220,
        transaction_type: "deplete",
        notes: "Cherry transport + generator usage",
        user_id: seededBy,
        price: 0,
        total_cost: 0,
      },
      {
        days: 8,
        locationId: hfLocationId,
        item_type: "Fungicide (L)",
        quantity: 22,
        transaction_type: "deplete",
        notes: "Canopy spray completed",
        user_id: seededBy,
        price: 0,
        total_cost: 0,
      },
      {
        days: 6,
        locationId: pgLocationId,
        item_type: "Jute Bags",
        quantity: 85,
        transaction_type: "deplete",
        notes: "Dispatch packing usage",
        user_id: seededBy,
        price: 0,
        total_cost: 0,
      },
      {
        days: 4,
        locationId: mvLocationId,
        item_type: "Diesel (L)",
        quantity: 120,
        transaction_type: "deplete",
        notes: "Drying line fuel consumption",
        user_id: seededBy,
        price: 0,
        total_cost: 0,
      },
    ]

    for (const tx of transactions) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO current_inventory (
            item_type,
            quantity,
            unit,
            avg_price,
            total_cost,
            tenant_id,
            location_id
          )
          VALUES (
            ${tx.item_type},
            0,
            ${seededInventoryUnits[tx.item_type] || "kg"},
            0,
            0,
            ${tenantId},
            ${tx.locationId}
          )
          ON CONFLICT (item_type, tenant_id, location_id)
          DO UPDATE SET
            unit = EXCLUDED.unit
        `,
      )

      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO transaction_history (
            item_type,
            quantity,
            transaction_type,
            notes,
            transaction_date,
            user_id,
            price,
            total_cost,
            tenant_id,
            location_id,
            unit
          )
          VALUES (
            ${tx.item_type},
            ${tx.quantity},
            ${tx.transaction_type},
            ${tx.notes},
            ${daysAgo(tx.days)}::date,
            ${tx.user_id},
            ${tx.price},
            ${tx.total_cost},
            ${tenantId},
            ${tx.locationId},
            ${seededInventoryUnits[tx.item_type] || "kg"}
          )
        `,
      )
    }

    const uniqueInventoryKeys = new Set<string>()
    for (const tx of transactions) {
      uniqueInventoryKeys.add(`${tx.item_type}::${tx.locationId || ""}`)
    }
    for (const key of uniqueInventoryKeys) {
      const splitIndex = key.lastIndexOf("::")
      const itemType = key.slice(0, splitIndex)
      const locationScope = key.slice(splitIndex + 2) || null
      await recalculateInventoryForItem(sql, tenantContext, itemType, locationScope)
    }

    const laborTransactions = [
      {
        days: 20,
        code: "LABOR",
        locationId: hfLocationId,
        hf_laborers: 14,
        hf_cost_per_laborer: 460,
        outside_laborers: 4,
        outside_cost_per_laborer: 520,
        total_cost: 8520,
        notes: "Arabica selective picking team",
      },
      {
        days: 14,
        code: "LABOR",
        locationId: mvLocationId,
        hf_laborers: 11,
        hf_cost_per_laborer: 430,
        outside_laborers: 3,
        outside_cost_per_laborer: 500,
        total_cost: 6230,
        notes: "Robusta harvest support",
      },
      {
        days: 9,
        code: "LABOR",
        locationId: pgLocationId,
        hf_laborers: 9,
        hf_cost_per_laborer: 420,
        outside_laborers: 2,
        outside_cost_per_laborer: 490,
        total_cost: 4760,
        notes: "Sorting + drying crew",
      },
      {
        days: 5,
        code: "ADMIN",
        locationId: defaultLocationId,
        hf_laborers: 4,
        hf_cost_per_laborer: 320,
        outside_laborers: 0,
        outside_cost_per_laborer: 0,
        total_cost: 1280,
        notes: "Ledger reconciliation and QA paperwork",
      },
    ]

    for (const row of laborTransactions) {
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
          VALUES (
            ${daysAgo(row.days)}::timestamp,
            ${row.code},
            ${row.hf_laborers},
            ${row.hf_cost_per_laborer},
            ${row.outside_laborers},
            ${row.outside_cost_per_laborer},
            ${row.total_cost},
            ${row.notes},
            ${tenantId},
            ${row.locationId}
          )
        `,
      )
    }

    const expenseTransactions = [
      { days: 18, code: "SUPPLIES", locationId: hfLocationId, total_amount: 2450, notes: "Drying mesh repairs" },
      { days: 13, code: "TRANSPORT", locationId: mvLocationId, total_amount: 3150, notes: "Cherry transport to mill" },
      { days: 10, code: "MAINT", locationId: pgLocationId, total_amount: 1850, notes: "Pulping line service" },
      { days: 7, code: "UTILITIES", locationId: defaultLocationId, total_amount: 2100, notes: "Electricity + water" },
      { days: 3, code: "MARKETING", locationId: defaultLocationId, total_amount: 1400, notes: "Buyer sample shipping" },
    ]

    for (const row of expenseTransactions) {
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
          VALUES (
            ${daysAgo(row.days)}::timestamp,
            ${row.code},
            ${row.total_amount},
            ${row.notes},
            ${tenantId},
            ${row.locationId}
          )
        `,
      )
    }

    const processingRows = [
      {
        days: 20,
        locationId: hfLocationId,
        lot_id: "HF-A-2401",
        coffee_type: "Arabica",
        crop_today: 1680,
        crop_todate: 6120,
        ripe_today: 1390,
        ripe_todate: 5050,
        green_today: 205,
        green_todate: 740,
        float_today: 85,
        float_todate: 330,
        wet_parchment: 990,
        dry_parch: 640,
        dry_cherry: 120,
        dry_p_bags: 13,
        dry_cherry_bags: 2,
        notes: "Strong arabica recovery in HF block",
      },
      {
        days: 13,
        locationId: hfLocationId,
        lot_id: "HF-A-2402",
        coffee_type: "Arabica",
        crop_today: 1590,
        crop_todate: 7710,
        ripe_today: 1310,
        ripe_todate: 6360,
        green_today: 195,
        green_todate: 935,
        float_today: 80,
        float_todate: 410,
        wet_parchment: 930,
        dry_parch: 610,
        dry_cherry: 115,
        dry_p_bags: 12,
        dry_cherry_bags: 2,
        notes: "Clean cherry selection maintained",
      },
      {
        days: 18,
        locationId: hfLocationId,
        lot_id: "HF-R-2401",
        coffee_type: "Robusta",
        crop_today: 1460,
        crop_todate: 4820,
        ripe_today: 1190,
        ripe_todate: 3980,
        green_today: 185,
        green_todate: 640,
        float_today: 85,
        float_todate: 300,
        wet_parchment: 860,
        dry_parch: 520,
        dry_cherry: 150,
        dry_p_bags: 10,
        dry_cherry_bags: 3,
        notes: "HF robusta mixed washed + natural",
      },
      {
        days: 16,
        locationId: mvLocationId,
        lot_id: "MV-R-2401",
        coffee_type: "Robusta",
        crop_today: 1540,
        crop_todate: 5080,
        ripe_today: 1250,
        ripe_todate: 4170,
        green_today: 205,
        green_todate: 690,
        float_today: 85,
        float_todate: 315,
        wet_parchment: 905,
        dry_parch: 545,
        dry_cherry: 170,
        dry_p_bags: 11,
        dry_cherry_bags: 3,
        notes: "MV wet-mill performance stable",
      },
      {
        days: 7,
        locationId: mvLocationId,
        lot_id: "MV-R-2402",
        coffee_type: "Robusta",
        crop_today: 1490,
        crop_todate: 6570,
        ripe_today: 1200,
        ripe_todate: 5370,
        green_today: 205,
        green_todate: 895,
        float_today: 85,
        float_todate: 400,
        wet_parchment: 875,
        dry_parch: 525,
        dry_cherry: 165,
        dry_p_bags: 10,
        dry_cherry_bags: 3,
        notes: "Rain-affected intake, controlled float",
      },
      {
        days: 12,
        locationId: pgLocationId,
        lot_id: "PG-R-2401",
        coffee_type: "Robusta",
        crop_today: 1380,
        crop_todate: 4480,
        ripe_today: 1110,
        ripe_todate: 3590,
        green_today: 190,
        green_todate: 610,
        float_today: 80,
        float_todate: 280,
        wet_parchment: 820,
        dry_parch: 500,
        dry_cherry: 150,
        dry_p_bags: 10,
        dry_cherry_bags: 3,
        notes: "PG lot entered drying beds on schedule",
      },
      {
        days: 4,
        locationId: pgLocationId,
        lot_id: "PG-R-2402",
        coffee_type: "Robusta",
        crop_today: 1330,
        crop_todate: 5810,
        ripe_today: 1060,
        ripe_todate: 4650,
        green_today: 185,
        green_todate: 795,
        float_today: 85,
        float_todate: 365,
        wet_parchment: 790,
        dry_parch: 480,
        dry_cherry: 145,
        dry_p_bags: 10,
        dry_cherry_bags: 3,
        notes: "Late cycle robusta; good dry-cherry consistency",
      },
    ].filter((row) => row.locationId)

    for (const row of processingRows) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO processing_records (
            tenant_id,
            location_id,
            coffee_type,
            lot_id,
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
            ${row.locationId},
            ${row.coffee_type},
            ${row.lot_id},
            ${daysAgo(row.days)}::date,
            ${row.crop_today},
            ${row.crop_todate},
            ${row.ripe_today},
            ${row.ripe_todate},
            ${row.green_today},
            ${row.green_todate},
            ${row.float_today},
            ${row.float_todate},
            ${row.wet_parchment},
            ${row.dry_parch},
            ${row.dry_cherry},
            ${row.dry_p_bags},
            ${row.dry_cherry_bags},
            ${row.notes}
          )
          ON CONFLICT (tenant_id, location_id, coffee_type, process_date)
          DO UPDATE SET
            lot_id = EXCLUDED.lot_id,
            crop_today = EXCLUDED.crop_today,
            crop_todate = EXCLUDED.crop_todate,
            ripe_today = EXCLUDED.ripe_today,
            ripe_todate = EXCLUDED.ripe_todate,
            green_today = EXCLUDED.green_today,
            green_todate = EXCLUDED.green_todate,
            float_today = EXCLUDED.float_today,
            float_todate = EXCLUDED.float_todate,
            wet_parchment = EXCLUDED.wet_parchment,
            dry_parch = EXCLUDED.dry_parch,
            dry_cherry = EXCLUDED.dry_cherry,
            dry_p_bags = EXCLUDED.dry_p_bags,
            dry_cherry_bags = EXCLUDED.dry_cherry_bags,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
    }

    const pepperRows = [
      { days: 17, locationId: hfLocationId, kg_picked: 420, green_pepper: 320, dry_pepper: 100, notes: "Good drying cycle" },
      { days: 8, locationId: hfLocationId, kg_picked: 360, green_pepper: 274, dry_pepper: 86, notes: "Steady pepper quality" },
      { days: 16, locationId: mvLocationId, kg_picked: 310, green_pepper: 238, dry_pepper: 72, notes: "Uniform moisture profile" },
      { days: 7, locationId: mvLocationId, kg_picked: 280, green_pepper: 210, dry_pepper: 70, notes: "Improved drying control" },
      { days: 15, locationId: pgLocationId, kg_picked: 295, green_pepper: 212, dry_pepper: 83, notes: "Good sun window" },
      { days: 6, locationId: pgLocationId, kg_picked: 265, green_pepper: 191, dry_pepper: 74, notes: "Consistent dry conversion" },
    ].filter((row) => row.locationId)

    for (const row of pepperRows) {
      const greenPct = row.kg_picked > 0 ? (row.green_pepper / row.kg_picked) * 100 : 0
      const dryPct = row.kg_picked > 0 ? (row.dry_pepper / row.kg_picked) * 100 : 0
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
            ${row.locationId},
            ${daysAgo(row.days)}::date,
            ${row.kg_picked},
            ${row.green_pepper},
            ${greenPct},
            ${row.dry_pepper},
            ${dryPct},
            ${row.notes},
            ${seededBy}
          )
          ON CONFLICT (tenant_id, location_id, process_date)
          DO UPDATE SET
            kg_picked = EXCLUDED.kg_picked,
            green_pepper = EXCLUDED.green_pepper,
            green_pepper_percent = EXCLUDED.green_pepper_percent,
            dry_pepper = EXCLUDED.dry_pepper,
            dry_pepper_percent = EXCLUDED.dry_pepper_percent,
            notes = EXCLUDED.notes,
            recorded_by = EXCLUDED.recorded_by,
            updated_at = CURRENT_TIMESTAMP
        `,
      )
    }

    const rainfallRows = [
      { days: 19, inches: 1, cents: 8, notes: "Scattered showers" },
      { days: 15, inches: 2, cents: 2, notes: "Night rain helped flowering blocks" },
      { days: 11, inches: 0, cents: 9, notes: "Dry spell" },
      { days: 7, inches: 3, cents: 1, notes: "Moderate rain event" },
      { days: 3, inches: 1, cents: 6, notes: "Light rain with wind" },
      { days: 1, inches: 0, cents: 7, notes: "Clear weather for drying" },
    ]
    for (const row of rainfallRows) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO rainfall_records (record_date, inches, cents, notes, user_id, tenant_id)
          VALUES (${daysAgo(row.days)}::date, ${row.inches}, ${row.cents}, ${row.notes}, ${seededBy}, ${tenantId})
        `,
      )
    }

    const dispatchRows = [
      {
        days: 10,
        locationId: hfLocationId,
        estate: "HF",
        lot_id: "HF-A-2401",
        coffee_type: "Arabica",
        bag_type: "Dry Parchment",
        bags_dispatched: 12,
        kgs_received: 588,
        price_per_bag: 6400,
        buyer_name: "South Roast Co.",
        notes: "Moisture-adjusted weighbridge receipt",
      },
      {
        days: 9,
        locationId: hfLocationId,
        estate: "HF",
        lot_id: "HF-R-2401",
        coffee_type: "Robusta",
        bag_type: "Dry Cherry",
        bags_dispatched: 8,
        kgs_received: 392,
        price_per_bag: 5650,
        buyer_name: "Metro Traders",
        notes: "Dry cherry lot moved to curing partner",
      },
      {
        days: 6,
        locationId: mvLocationId,
        estate: "MV",
        lot_id: "MV-R-2401",
        coffee_type: "Robusta",
        bag_type: "Dry Parchment",
        bags_dispatched: 10,
        kgs_received: 490,
        price_per_bag: 6000,
        buyer_name: "Cascara Exports",
        notes: "Bridge slip attached",
      },
      {
        days: 4,
        locationId: pgLocationId,
        estate: "PG",
        lot_id: "PG-R-2401",
        coffee_type: "Robusta",
        bag_type: "Dry Cherry",
        bags_dispatched: 9,
        kgs_received: 438,
        price_per_bag: 5500,
        buyer_name: "Malnad Beans",
        notes: "Transit moisture variance recorded",
      },
      {
        days: 2,
        locationId: hfLocationId,
        estate: "HF",
        lot_id: "HF-A-2402",
        coffee_type: "Arabica",
        bag_type: "Dry Parchment",
        bags_dispatched: 11,
        kgs_received: 538,
        price_per_bag: 6550,
        buyer_name: "South Roast Co.",
        notes: "Second arabica dispatch this cycle",
      },
      {
        days: 1,
        locationId: mvLocationId,
        estate: "MV",
        lot_id: "MV-R-2402",
        coffee_type: "Robusta",
        bag_type: "Dry Cherry",
        bags_dispatched: 7,
        kgs_received: 340,
        price_per_bag: 5750,
        buyer_name: "Metro Traders",
        notes: "Late-cycle robusta shipment",
      },
    ].filter((row) => row.locationId)

    for (const row of dispatchRows) {
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO dispatch_records (
            dispatch_date,
            location_id,
            estate,
            lot_id,
            coffee_type,
            bag_type,
            bags_dispatched,
            kgs_received,
            price_per_bag,
            buyer_name,
            notes,
            created_by,
            tenant_id
          )
          VALUES (
            ${daysAgo(row.days)}::date,
            ${row.locationId},
            ${row.estate},
            ${row.lot_id},
            ${row.coffee_type},
            ${row.bag_type},
            ${row.bags_dispatched},
            ${row.kgs_received},
            ${row.price_per_bag},
            ${row.buyer_name},
            ${row.notes},
            ${seededBy},
            ${tenantId}
          )
        `,
      )
    }

    const salesRows = [
      {
        days: 8,
        batch_no: "BL-HF-2401",
        lot_id: "HF-A-2401",
        locationId: hfLocationId,
        estate: "HF",
        coffee_type: "Arabica",
        bag_type: "Dry Parchment",
        buyer_name: "South Roast Co.",
        bags_sold: 8.4,
        kgs: 420,
        price_per_bag: 6800,
        bank_account: "HDFC-Primary",
        notes: "Buyer accepted full quality premium",
      },
      {
        days: 6,
        batch_no: "BL-HF-2402",
        lot_id: "HF-R-2401",
        locationId: hfLocationId,
        estate: "HF",
        coffee_type: "Robusta",
        bag_type: "Dry Cherry",
        buyer_name: "Metro Traders",
        bags_sold: 5.6,
        kgs: 280,
        price_per_bag: 5650,
        bank_account: "HDFC-Primary",
        notes: "Robusta cherry lot partially sold",
      },
      {
        days: 3,
        batch_no: "BL-MV-2401",
        lot_id: "MV-R-2401",
        locationId: mvLocationId,
        estate: "MV",
        coffee_type: "Robusta",
        bag_type: "Dry Parchment",
        buyer_name: "Cascara Exports",
        bags_sold: 7.2,
        kgs: 360,
        price_per_bag: 6100,
        bank_account: "HDFC-Primary",
        notes: "Weight reconciled against dispatch receipt",
      },
      {
        days: 1,
        batch_no: "BL-PG-2401",
        lot_id: "PG-R-2401",
        locationId: pgLocationId,
        estate: "PG",
        coffee_type: "Robusta",
        bag_type: "Dry Cherry",
        buyer_name: "Malnad Beans",
        bags_sold: 6,
        kgs: 300,
        price_per_bag: 5600,
        bank_account: "HDFC-Primary",
        notes: "Balanced with PG dispatch records",
      },
      {
        days: 0,
        batch_no: "BL-HF-2403",
        lot_id: "HF-A-2402",
        locationId: hfLocationId,
        estate: "HF",
        coffee_type: "Arabica",
        bag_type: "Dry Parchment",
        buyer_name: "South Roast Co.",
        bags_sold: 5,
        kgs: 250,
        price_per_bag: 7000,
        bank_account: "HDFC-Primary",
        notes: "Spot order filled at premium rate",
      },
      {
        days: 0,
        batch_no: "BL-MV-2402",
        lot_id: "MV-R-2402",
        locationId: mvLocationId,
        estate: "MV",
        coffee_type: "Robusta",
        bag_type: "Dry Cherry",
        buyer_name: "Metro Traders",
        bags_sold: 4.2,
        kgs: 210,
        price_per_bag: 5750,
        bank_account: "HDFC-Primary",
        notes: "Advance settled on delivery",
      },
    ].filter((row) => row.locationId)

    for (const row of salesRows) {
      const revenue = Number((row.bags_sold * row.price_per_bag).toFixed(2))
      const pricePerKg = row.kgs > 0 ? revenue / row.kgs : 0
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO sales_records (
            sale_date,
            batch_no,
            lot_id,
            location_id,
            estate,
            coffee_type,
            bag_type,
            weight_kgs,
            price_per_kg,
            total_revenue,
            buyer_name,
            bags_sent,
            kgs,
            kgs_received,
            bags_sold,
            price_per_bag,
            revenue,
            bank_account,
            notes,
            tenant_id
          )
          VALUES (
            ${daysAgo(row.days)}::date,
            ${row.batch_no},
            ${row.lot_id},
            ${row.locationId},
            ${row.estate},
            ${row.coffee_type},
            ${row.bag_type},
            ${row.kgs},
            ${pricePerKg},
            ${revenue},
            ${row.buyer_name},
            ${row.bags_sold},
            ${row.kgs},
            ${row.kgs},
            ${row.bags_sold},
            ${row.price_per_bag},
            ${revenue},
            ${row.bank_account},
            ${row.notes},
            ${tenantId}
          )
        `,
      )
    }

    const optionalSteps: OptionalSeedStep[] = [
      {
        label: "journal_entries",
        run: async () => {
          const journalRows = [
            {
              days: 18,
              locationId: hfLocationId,
              plot: "Block A1",
              title: "Flowering flush observed",
              fertilizer_name: "NPK 19-19-19",
              fertilizer_composition: "19-19-19, 120 kg/ha",
              spray_composition: "Bordeaux mix (1%)",
              irrigation_done: false,
              irrigation_notes: "",
              notes: "Uniform bloom after first rain.",
            },
            {
              days: 14,
              locationId: mvLocationId,
              plot: "Block MV-3",
              title: "Nutrient application",
              fertilizer_name: "Urea",
              fertilizer_composition: "46-0-0, 90 kg/ha",
              spray_composition: "",
              irrigation_done: true,
              irrigation_notes: "2-hour drip cycle",
              notes: "Follow-up moisture check scheduled.",
            },
            {
              days: 10,
              locationId: pgLocationId,
              plot: "Block PG-2",
              title: "Pest scouting",
              fertilizer_name: "",
              fertilizer_composition: "",
              spray_composition: "Neem + sticker",
              irrigation_done: false,
              irrigation_notes: "",
              notes: "Low borer incidence; continue weekly scouting.",
            },
            {
              days: 7,
              locationId: hfLocationId,
              plot: "Drying Yard HF",
              title: "Drying management update",
              fertilizer_name: "",
              fertilizer_composition: "",
              spray_composition: "",
              irrigation_done: false,
              irrigation_notes: "",
              notes: "Bed turning every 45 minutes due strong sun.",
            },
            {
              days: 4,
              locationId: mvLocationId,
              plot: "Block MV-1",
              title: "Irrigation during dry spell",
              fertilizer_name: "",
              fertilizer_composition: "",
              spray_composition: "",
              irrigation_done: true,
              irrigation_notes: "1.5-hour evening cycle",
              notes: "Targeted irrigation to prevent cherry stress.",
            },
            {
              days: 1,
              locationId: pgLocationId,
              plot: "Dispatch Shed PG",
              title: "Pre-dispatch quality check",
              fertilizer_name: "",
              fertilizer_composition: "",
              spray_composition: "",
              irrigation_done: false,
              irrigation_notes: "",
              notes: "All bags sealed and tagged lot-wise.",
            },
          ].filter((row) => row.locationId)

          for (const row of journalRows) {
            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO journal_entries (
                  tenant_id,
                  location_id,
                  entry_date,
                  plot,
                  title,
                  fertilizer_name,
                  fertilizer_composition,
                  spray_composition,
                  irrigation_done,
                  irrigation_notes,
                  notes,
                  created_by
                )
                VALUES (
                  ${tenantId},
                  ${row.locationId},
                  ${daysAgo(row.days)}::date,
                  ${row.plot},
                  ${row.title},
                  ${row.fertilizer_name},
                  ${row.fertilizer_composition},
                  ${row.spray_composition},
                  ${row.irrigation_done},
                  ${row.irrigation_notes},
                  ${row.notes},
                  ${seededBy}
                )
              `,
            )
          }
        },
      },
      {
        label: "curing_records",
        run: async () => {
          const curingRows = [
            {
              days: 18,
              locationId: hfLocationId,
              lot_id: "HF-A-2401",
              coffee_type: "Arabica",
              process_type: "Washed",
              intake_kg: 990,
              intake_bags: 20,
              moisture_start_pct: 51.5,
              moisture_end_pct: 10.9,
              drying_days: 13,
              output_kg: 760,
              output_bags: 15,
              loss_kg: 230,
              storage_bin: "HF-BIN-01",
              notes: "Good airflow and even bed turns",
            },
            {
              days: 11,
              locationId: hfLocationId,
              lot_id: "HF-A-2402",
              coffee_type: "Arabica",
              process_type: "Washed",
              intake_kg: 930,
              intake_bags: 19,
              moisture_start_pct: 50.8,
              moisture_end_pct: 10.7,
              drying_days: 12,
              output_kg: 725,
              output_bags: 14,
              loss_kg: 205,
              storage_bin: "HF-BIN-02",
              notes: "Mild rain interruption managed with covers",
            },
            {
              days: 14,
              locationId: mvLocationId,
              lot_id: "MV-R-2401",
              coffee_type: "Robusta",
              process_type: "Natural",
              intake_kg: 905,
              intake_bags: 18,
              moisture_start_pct: 52.3,
              moisture_end_pct: 11.2,
              drying_days: 14,
              output_kg: 710,
              output_bags: 14,
              loss_kg: 195,
              storage_bin: "MV-BIN-01",
              notes: "Natural lot with stable moisture drop",
            },
            {
              days: 5,
              locationId: mvLocationId,
              lot_id: "MV-R-2402",
              coffee_type: "Robusta",
              process_type: "Natural",
              intake_kg: 875,
              intake_bags: 17,
              moisture_start_pct: 52.0,
              moisture_end_pct: 11.4,
              drying_days: 13,
              output_kg: 690,
              output_bags: 14,
              loss_kg: 185,
              storage_bin: "MV-BIN-02",
              notes: "Drying schedule held despite cloudy afternoons",
            },
            {
              days: 10,
              locationId: pgLocationId,
              lot_id: "PG-R-2401",
              coffee_type: "Robusta",
              process_type: "Natural",
              intake_kg: 820,
              intake_bags: 16,
              moisture_start_pct: 51.7,
              moisture_end_pct: 11.1,
              drying_days: 12,
              output_kg: 650,
              output_bags: 13,
              loss_kg: 170,
              storage_bin: "PG-BIN-01",
              notes: "Consistent night covering prevented rewetting",
            },
          ].filter((row) => row.locationId)

          for (const row of curingRows) {
            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO curing_records (
                  tenant_id,
                  location_id,
                  lot_id,
                  coffee_type,
                  process_type,
                  process_date,
                  intake_kg,
                  intake_bags,
                  moisture_start_pct,
                  moisture_end_pct,
                  drying_days,
                  output_kg,
                  output_bags,
                  loss_kg,
                  storage_bin,
                  recorded_by,
                  notes
                )
                VALUES (
                  ${tenantId},
                  ${row.locationId},
                  ${row.lot_id},
                  ${row.coffee_type},
                  ${row.process_type},
                  ${daysAgo(row.days)}::date,
                  ${row.intake_kg},
                  ${row.intake_bags},
                  ${row.moisture_start_pct},
                  ${row.moisture_end_pct},
                  ${row.drying_days},
                  ${row.output_kg},
                  ${row.output_bags},
                  ${row.loss_kg},
                  ${row.storage_bin},
                  ${seededBy},
                  ${row.notes}
                )
                ON CONFLICT (tenant_id, location_id, process_date, lot_id)
                DO UPDATE SET
                  coffee_type = EXCLUDED.coffee_type,
                  process_type = EXCLUDED.process_type,
                  intake_kg = EXCLUDED.intake_kg,
                  intake_bags = EXCLUDED.intake_bags,
                  moisture_start_pct = EXCLUDED.moisture_start_pct,
                  moisture_end_pct = EXCLUDED.moisture_end_pct,
                  drying_days = EXCLUDED.drying_days,
                  output_kg = EXCLUDED.output_kg,
                  output_bags = EXCLUDED.output_bags,
                  loss_kg = EXCLUDED.loss_kg,
                  storage_bin = EXCLUDED.storage_bin,
                  recorded_by = EXCLUDED.recorded_by,
                  notes = EXCLUDED.notes,
                  updated_at = CURRENT_TIMESTAMP
              `,
            )
          }
        },
      },
      {
        label: "quality_grading_records",
        run: async () => {
          const qualityRows = [
            {
              days: 9,
              locationId: hfLocationId,
              lot_id: "HF-A-2401",
              coffee_type: "Arabica",
              process_type: "Washed",
              grade: "AA",
              moisture_pct: 10.8,
              screen_size: "17/18",
              defects_count: 14,
              defect_notes: "Minor quakers",
              sample_weight_g: 350,
              outturn_pct: 78.2,
              cup_score: 84.3,
              buyer_reference: "SOUTH-QC-01",
              notes: "Clean acidity and floral notes",
            },
            {
              days: 2,
              locationId: hfLocationId,
              lot_id: "HF-A-2402",
              coffee_type: "Arabica",
              process_type: "Washed",
              grade: "AA",
              moisture_pct: 10.9,
              screen_size: "16/17",
              defects_count: 16,
              defect_notes: "Slight uneven size",
              sample_weight_g: 350,
              outturn_pct: 77.6,
              cup_score: 83.6,
              buyer_reference: "SOUTH-QC-02",
              notes: "Good body with slight grassy finish",
            },
            {
              days: 6,
              locationId: mvLocationId,
              lot_id: "MV-R-2401",
              coffee_type: "Robusta",
              process_type: "Natural",
              grade: "A",
              moisture_pct: 11.3,
              screen_size: "15/16",
              defects_count: 21,
              defect_notes: "Few broken beans",
              sample_weight_g: 350,
              outturn_pct: 75.1,
              cup_score: 81.4,
              buyer_reference: "METRO-QC-11",
              notes: "Balanced robusta profile",
            },
            {
              days: 1,
              locationId: mvLocationId,
              lot_id: "MV-R-2402",
              coffee_type: "Robusta",
              process_type: "Natural",
              grade: "A",
              moisture_pct: 11.4,
              screen_size: "15/16",
              defects_count: 22,
              defect_notes: "Slightly high black beans",
              sample_weight_g: 350,
              outturn_pct: 74.7,
              cup_score: 81.0,
              buyer_reference: "METRO-QC-12",
              notes: "Stable cup, requires tighter sorting",
            },
            {
              days: 3,
              locationId: pgLocationId,
              lot_id: "PG-R-2401",
              coffee_type: "Robusta",
              process_type: "Natural",
              grade: "B",
              moisture_pct: 11.2,
              screen_size: "14/15",
              defects_count: 24,
              defect_notes: "Mixed maturity signs",
              sample_weight_g: 350,
              outturn_pct: 73.9,
              cup_score: 80.6,
              buyer_reference: "MALNAD-QC-04",
              notes: "Needs selective picking reinforcement",
            },
          ].filter((row) => row.locationId)

          for (const row of qualityRows) {
            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO quality_grading_records (
                  tenant_id,
                  location_id,
                  lot_id,
                  coffee_type,
                  process_type,
                  grade_date,
                  grade,
                  moisture_pct,
                  screen_size,
                  defects_count,
                  defect_notes,
                  sample_weight_g,
                  outturn_pct,
                  cup_score,
                  buyer_reference,
                  graded_by,
                  notes
                )
                VALUES (
                  ${tenantId},
                  ${row.locationId},
                  ${row.lot_id},
                  ${row.coffee_type},
                  ${row.process_type},
                  ${daysAgo(row.days)}::date,
                  ${row.grade},
                  ${row.moisture_pct},
                  ${row.screen_size},
                  ${row.defects_count},
                  ${row.defect_notes},
                  ${row.sample_weight_g},
                  ${row.outturn_pct},
                  ${row.cup_score},
                  ${row.buyer_reference},
                  ${seededBy},
                  ${row.notes}
                )
                ON CONFLICT (tenant_id, location_id, grade_date, lot_id)
                DO UPDATE SET
                  coffee_type = EXCLUDED.coffee_type,
                  process_type = EXCLUDED.process_type,
                  grade = EXCLUDED.grade,
                  moisture_pct = EXCLUDED.moisture_pct,
                  screen_size = EXCLUDED.screen_size,
                  defects_count = EXCLUDED.defects_count,
                  defect_notes = EXCLUDED.defect_notes,
                  sample_weight_g = EXCLUDED.sample_weight_g,
                  outturn_pct = EXCLUDED.outturn_pct,
                  cup_score = EXCLUDED.cup_score,
                  buyer_reference = EXCLUDED.buyer_reference,
                  graded_by = EXCLUDED.graded_by,
                  notes = EXCLUDED.notes,
                  updated_at = CURRENT_TIMESTAMP
              `,
            )
          }
        },
      },
      {
        label: "receivables",
        run: async () => {
          const receivablesRows = [
            {
              days: 9,
              buyer_name: "South Roast Co.",
              invoice_no: "INV-HF-2401",
              locationId: hfLocationId,
              amount: 145000,
              status: "partial",
              due_in_days: 3,
              notes: "50% advance received, balance on final QC",
            },
            {
              days: 5,
              buyer_name: "Metro Traders",
              invoice_no: "INV-MV-2401",
              locationId: mvLocationId,
              amount: 98000,
              status: "overdue",
              due_in_days: -1,
              notes: "Reminder sent; awaiting payment confirmation",
            },
            {
              days: 2,
              buyer_name: "Malnad Beans",
              invoice_no: "INV-PG-2401",
              locationId: pgLocationId,
              amount: 76000,
              status: "unpaid",
              due_in_days: 12,
              notes: "Due next cycle",
            },
            {
              days: 1,
              buyer_name: "South Roast Co.",
              invoice_no: "INV-HF-2402",
              locationId: hfLocationId,
              amount: 62000,
              status: "paid",
              due_in_days: 10,
              notes: "Paid via NEFT",
            },
            {
              days: 0,
              buyer_name: "Cascara Exports",
              invoice_no: "INV-MV-2402",
              locationId: mvLocationId,
              amount: 54000,
              status: "unpaid",
              due_in_days: 14,
              notes: "Fresh invoice issued today",
            },
          ].filter((row) => row.locationId)

          for (const row of receivablesRows) {
            const invoiceDate = new Date()
            invoiceDate.setDate(invoiceDate.getDate() - row.days)
            const dueDate = new Date(invoiceDate)
            dueDate.setDate(dueDate.getDate() + row.due_in_days)
            const invoiceDateIso = invoiceDate.toISOString().slice(0, 10)
            const dueDateIso = dueDate.toISOString().slice(0, 10)
            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO receivables (
                  tenant_id,
                  location_id,
                  buyer_name,
                  invoice_no,
                  invoice_date,
                  due_date,
                  amount,
                  status,
                  notes
                )
                VALUES (
                  ${tenantId},
                  ${row.locationId},
                  ${row.buyer_name},
                  ${row.invoice_no},
                  ${invoiceDateIso}::date,
                  ${dueDateIso}::date,
                  ${row.amount},
                  ${row.status},
                  ${row.notes}
                )
              `,
            )
          }
        },
      },
      {
        label: "billing_invoices",
        run: async () => {
          const invoices = [
            {
              days: 8,
              invoiceNumber: "BILL-HF-2401",
              billToName: "South Roast Co.",
              billToState: "Karnataka",
              isInterState: false,
              status: "sent",
              subtotal: 100000,
              taxTotal: 5000,
              total: 105000,
              notes: "Arabica premium lot invoice",
              items: [
                {
                  description: "Arabica Dry Parchment (HF-A-2401)",
                  hsn: "090111",
                  quantity: 8.4,
                  unitPrice: 11904.76,
                  taxRate: 5,
                  lineSubtotal: 100000,
                  taxAmount: 5000,
                  lineTotal: 105000,
                },
              ],
            },
            {
              days: 3,
              invoiceNumber: "BILL-MV-2401",
              billToName: "Cascara Exports",
              billToState: "Tamil Nadu",
              isInterState: true,
              status: "paid",
              subtotal: 75000,
              taxTotal: 3750,
              total: 78750,
              notes: "Robusta parchment settlement",
              items: [
                {
                  description: "Robusta Dry Parchment (MV-R-2401)",
                  hsn: "090111",
                  quantity: 7.2,
                  unitPrice: 10416.67,
                  taxRate: 5,
                  lineSubtotal: 75000,
                  taxAmount: 3750,
                  lineTotal: 78750,
                },
              ],
            },
          ]

          for (const invoice of invoices) {
            const invoiceDate = daysAgo(invoice.days)
            const dueDate = daysAgo(Math.max(0, invoice.days - 10))
            const [createdInvoice] = await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO billing_invoices (
                  tenant_id,
                  invoice_number,
                  invoice_date,
                  due_date,
                  currency,
                  bill_to_name,
                  bill_to_state,
                  place_of_supply_state,
                  supply_state,
                  is_inter_state,
                  subtotal,
                  tax_total,
                  cgst_amount,
                  sgst_amount,
                  igst_amount,
                  total,
                  status,
                  notes,
                  created_by
                )
                VALUES (
                  ${tenantId},
                  ${invoice.invoiceNumber},
                  ${invoiceDate}::date,
                  ${dueDate}::date,
                  'INR',
                  ${invoice.billToName},
                  ${invoice.billToState},
                  ${invoice.billToState},
                  ${invoice.billToState},
                  ${invoice.isInterState},
                  ${invoice.subtotal},
                  ${invoice.taxTotal},
                  ${invoice.isInterState ? 0 : invoice.taxTotal / 2},
                  ${invoice.isInterState ? 0 : invoice.taxTotal / 2},
                  ${invoice.isInterState ? invoice.taxTotal : 0},
                  ${invoice.total},
                  ${invoice.status},
                  ${invoice.notes},
                  ${seededBy}
                )
                ON CONFLICT (tenant_id, invoice_number)
                DO UPDATE SET
                  invoice_date = EXCLUDED.invoice_date,
                  due_date = EXCLUDED.due_date,
                  bill_to_name = EXCLUDED.bill_to_name,
                  bill_to_state = EXCLUDED.bill_to_state,
                  place_of_supply_state = EXCLUDED.place_of_supply_state,
                  supply_state = EXCLUDED.supply_state,
                  is_inter_state = EXCLUDED.is_inter_state,
                  subtotal = EXCLUDED.subtotal,
                  tax_total = EXCLUDED.tax_total,
                  cgst_amount = EXCLUDED.cgst_amount,
                  sgst_amount = EXCLUDED.sgst_amount,
                  igst_amount = EXCLUDED.igst_amount,
                  total = EXCLUDED.total,
                  status = EXCLUDED.status,
                  notes = EXCLUDED.notes,
                  updated_at = CURRENT_TIMESTAMP
                RETURNING id
              `,
            )

            if (!createdInvoice?.id) continue

            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                DELETE FROM billing_invoice_items
                WHERE tenant_id = ${tenantId}
                  AND invoice_id = ${createdInvoice.id}
              `,
            )

            for (const item of invoice.items) {
              await runTenantQuery(
                sql,
                tenantContext,
                sql`
                  INSERT INTO billing_invoice_items (
                    tenant_id,
                    invoice_id,
                    description,
                    hsn,
                    quantity,
                    unit_price,
                    tax_rate,
                    line_subtotal,
                    tax_amount,
                    line_total
                  )
                  VALUES (
                    ${tenantId},
                    ${createdInvoice.id},
                    ${item.description},
                    ${item.hsn},
                    ${item.quantity},
                    ${item.unitPrice},
                    ${item.taxRate},
                    ${item.lineSubtotal},
                    ${item.taxAmount},
                    ${item.lineTotal}
                  )
                `,
              )
            }
          }
        },
      },
    ]

    const skippedSteps: string[] = []
    for (const step of optionalSteps) {
      try {
        await step.run()
      } catch (error) {
        if (isMissingRelation(error)) {
          skippedSteps.push(step.label)
          continue
        }
        throw error
      }
    }

    const summaryCounts = {
      locations: seedLocations.length,
      activities: accountActivities.length,
      inventoryTransactions: transactions.length,
      laborTransactions: laborTransactions.length,
      expenseTransactions: expenseTransactions.length,
      processingRecords: processingRows.length,
      pepperRecords: pepperRows.length,
      rainfallRecords: rainfallRows.length,
      dispatchRecords: dispatchRows.length,
      salesRecords: salesRows.length,
      skippedSteps,
      resetApplied: resetSummary.applied,
      resetClearedTables: resetSummary.clearedTables,
      resetSkippedTables: resetSummary.skippedTables,
    }

    await logAuditEvent(sql, sessionUser, {
      action: "upsert",
      entityType: "tenant_seed",
      entityId: tenantId,
      after: summaryCounts,
    })

    const moduleAuditEntries: Array<{ entityType: string; count: number }> = [
      { entityType: "transaction_history", count: transactions.length },
      { entityType: "labor_transactions", count: laborTransactions.length },
      { entityType: "expense_transactions", count: expenseTransactions.length },
      { entityType: "processing_records", count: processingRows.length },
      { entityType: "dispatch_records", count: dispatchRows.length },
      { entityType: "sales_records", count: salesRows.length },
      { entityType: "rainfall_records", count: rainfallRows.length },
      { entityType: "pepper_records", count: pepperRows.length },
      { entityType: "journal_entries", count: skippedSteps.includes("journal_entries") ? 0 : 6 },
      { entityType: "curing_records", count: skippedSteps.includes("curing_records") ? 0 : 5 },
      { entityType: "quality_grading_records", count: skippedSteps.includes("quality_grading_records") ? 0 : 5 },
      { entityType: "receivables", count: skippedSteps.includes("receivables") ? 0 : 5 },
      { entityType: "billing_invoices", count: skippedSteps.includes("billing_invoices") ? 0 : 2 },
    ]

    for (const entry of moduleAuditEntries) {
      if (entry.count <= 0) continue
      await logAuditEvent(sql, sessionUser, {
        action: "upsert",
        entityType: entry.entityType,
        entityId: `${tenantId}:seed`,
        after: { inserted: entry.count, source: "tenant_seed" },
      })
    }

    return NextResponse.json({
      success: true,
      tenantId,
      tenantName,
      skippedSteps,
      counts: summaryCounts,
    })
  } catch (error: any) {
    console.error("Error seeding tenant data:", error)
    return adminErrorResponse(error, "Failed to seed tenant data")
  }
}
