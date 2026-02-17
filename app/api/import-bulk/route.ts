import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { csvToObjects, normalizeCsvHeader } from "@/lib/csv"
import { resolveLocationInfo } from "@/lib/server/location-utils"
import { recalculateInventoryForItem } from "@/lib/server/inventory-recalc"
import { recomputeProcessingTotals, resolveBagWeightKg } from "@/lib/server/processing-utils"

const MAX_ROWS = 5000
const CHUNK_SIZE = 100
const DATASET_MODULE_MAP: Record<string, string> = {
  processing: "processing",
  pepper: "pepper",
  rainfall: "rainfall",
  dispatch: "dispatch",
  sales: "sales",
  transactions: "transactions",
  inventory: "inventory",
  labor: "accounts",
  expenses: "accounts",
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const parseNumber = (value: string | null | undefined, fallback: number | null = null) => {
  if (value === null || value === undefined) return fallback
  const cleaned = String(value).replace(/,/g, "").trim()
  if (!cleaned) return fallback
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseDate = (value: string | null | undefined) => {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}$/)
  if (isoMatch) return raw
  const slashMatch = raw.match(/^(\d{2})[\/](\d{2})[\/](\d{4})$/)
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch
    return `${yyyy}-${mm}-${dd}`
  }
  const altMatch = raw.match(/^(\d{4})[\/](\d{2})[\/](\d{2})$/)
  if (altMatch) {
    const [, yyyy, mm, dd] = altMatch
    return `${yyyy}-${mm}-${dd}`
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const normalizeCoffeeType = (value: string | null | undefined) => {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const lower = raw.toLowerCase()
  if (lower.includes("arabica")) return "Arabica"
  if (lower.includes("robusta")) return "Robusta"
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const normalizeBagType = (value: string | null | undefined) => {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return ""
  if (raw.includes("cherry")) return "Dry Cherry"
  return "Dry Parchment"
}

const normalizeTransactionType = (value: string | null | undefined) => {
  const raw = String(value || "").trim().toLowerCase()
  if (raw.includes("restock")) return "restock"
  return "deplete"
}

const getField = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const normalized = normalizeCsvHeader(key)
    const value = row[normalized]
    if (value !== undefined && value !== null && String(value).trim() !== "") return value
  }
  return ""
}

const toLocationCode = (value: string) => {
  const token = value.trim().split(/\s+/)[0] || value.trim()
  const cleaned = token.replace(/[^a-z0-9]/gi, "").toUpperCase()
  return cleaned.slice(0, 8) || "LOC"
}

export async function POST(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireSessionUser()
    if (!["admin", "owner"].includes(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Admin role required" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const body = await request.json()
    const dataset = String(body?.dataset || "").trim().toLowerCase()
    const csvText = String(body?.csv || "")

    if (!dataset) {
      return NextResponse.json({ success: false, error: "Dataset is required" }, { status: 400 })
    }

    const moduleId = DATASET_MODULE_MAP[dataset]
    if (!moduleId) {
      return NextResponse.json({ success: false, error: "Unsupported dataset" }, { status: 400 })
    }

    await requireModuleAccess(moduleId, sessionUser)

    if (!csvText.trim()) {
      return NextResponse.json({ success: false, error: "CSV content is required" }, { status: 400 })
    }

    const { records } = csvToObjects(csvText)
    if (!records.length) {
      return NextResponse.json({ success: false, error: "No rows found in CSV" }, { status: 400 })
    }

    if (records.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `CSV exceeds ${MAX_ROWS} rows. Split into smaller uploads.` },
        { status: 400 },
      )
    }

    const errors: Array<{ row: number; message: string }> = []
    let imported = 0
    let skipped = 0

    const locationCache = new Map<string, string>()

    const resolveOrCreateLocationId = async (rawValue: string) => {
      const raw = String(rawValue || "").trim()
      if (!raw) return null
      if (isUuid(raw)) {
        const cached = locationCache.get(raw)
        if (cached) return cached
        const rows = await runTenantQuery(
          sql,
          tenantContext,
          sql`
            SELECT id
            FROM locations
            WHERE id = ${raw}
              AND tenant_id = ${tenantContext.tenantId}
            LIMIT 1
          `,
        )
        if (rows?.length) {
          locationCache.set(raw, String(rows[0].id))
          return String(rows[0].id)
        }
      }

      const cached = locationCache.get(raw.toLowerCase())
      if (cached) return cached

      const resolved = await resolveLocationInfo(sql, tenantContext, { estate: raw })
      if (resolved?.id) {
        locationCache.set(raw.toLowerCase(), resolved.id)
        return resolved.id
      }

      const code = toLocationCode(raw)
      const insert = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO locations (tenant_id, name, code)
          VALUES (${tenantContext.tenantId}, ${raw}, ${code})
          ON CONFLICT (tenant_id, code) DO NOTHING
          RETURNING id
        `,
      )

      if (insert?.length) {
        const id = String(insert[0].id)
        locationCache.set(raw.toLowerCase(), id)
        return id
      }

      const fallback = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT id
          FROM locations
          WHERE tenant_id = ${tenantContext.tenantId}
            AND code = ${code}
          LIMIT 1
        `,
      )

      if (fallback?.length) {
        const id = String(fallback[0].id)
        locationCache.set(raw.toLowerCase(), id)
        return id
      }

      return null
    }

    const flushQueries = async (queries: any[]) => {
      if (!queries.length) return
      await runTenantQueries(sql, tenantContext, queries)
      imported += queries.length
      queries.length = 0
    }

    if (dataset === "processing") {
      const queries: any[] = []
      const recomputeTargets = new Set<string>()

      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2

        const processDate = parseDate(getField(row, ["process_date", "date"]))
        const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])

        if (!processDate || !coffeeType || !locationRaw) {
          errors.push({ row: rowNumber, message: "Missing process_date, coffee_type, or location" })
          skipped += 1
          continue
        }

        const locationId = await resolveOrCreateLocationId(locationRaw)
        if (!locationId) {
          errors.push({ row: rowNumber, message: "Unable to resolve location" })
          skipped += 1
          continue
        }

        const cropToday = parseNumber(getField(row, ["crop_today", "crop"])) || 0
        const ripeToday = parseNumber(getField(row, ["ripe_today", "ripe"])) || 0
        const greenToday = parseNumber(getField(row, ["green_today", "green"])) || 0
        const floatToday = parseNumber(getField(row, ["float_today", "float"])) || 0
        const wetParchment = parseNumber(getField(row, ["wet_parchment", "wet_parch"])) || 0
        const dryParch = parseNumber(getField(row, ["dry_parch", "dry_parchment", "dry_parchment_today"])) || 0
        const dryCherry = parseNumber(getField(row, ["dry_cherry", "dry_cherry_today"])) || 0
        const moisturePct = parseNumber(getField(row, ["moisture_pct", "moisture"]))
        const lotId = getField(row, ["lot_id", "lot"]) || null
        const qualityGrade = getField(row, ["quality_grade", "grade"]) || null
        const defectNotes = getField(row, ["defect_notes", "defects"]) || null
        const qualityPhotoUrl = getField(row, ["quality_photo_url", "photo_url", "photo"]) || null
        const notes = getField(row, ["notes", "note"]) || ""

        queries.push(
          sql.query(
            `
            INSERT INTO processing_records (
              tenant_id, location_id, coffee_type, process_date,
              crop_today, ripe_today, green_today, float_today,
              wet_parchment, dry_parch, dry_cherry, moisture_pct,
              lot_id, quality_grade, defect_notes, quality_photo_url, notes
            )
            VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8,
              $9, $10, $11, $12,
              $13, $14, $15, $16, $17
            )
            ON CONFLICT (tenant_id, location_id, coffee_type, process_date)
            DO UPDATE SET
              crop_today = EXCLUDED.crop_today,
              ripe_today = EXCLUDED.ripe_today,
              green_today = EXCLUDED.green_today,
              float_today = EXCLUDED.float_today,
              wet_parchment = EXCLUDED.wet_parchment,
              dry_parch = EXCLUDED.dry_parch,
              dry_cherry = EXCLUDED.dry_cherry,
              moisture_pct = EXCLUDED.moisture_pct,
              lot_id = EXCLUDED.lot_id,
              quality_grade = EXCLUDED.quality_grade,
              defect_notes = EXCLUDED.defect_notes,
              quality_photo_url = EXCLUDED.quality_photo_url,
              notes = EXCLUDED.notes,
              updated_at = CURRENT_TIMESTAMP
            `,
            [
              tenantContext.tenantId,
              locationId,
              coffeeType,
              processDate,
              cropToday,
              ripeToday,
              greenToday,
              floatToday,
              wetParchment,
              dryParch,
              dryCherry,
              moisturePct,
              lotId,
              qualityGrade,
              defectNotes,
              qualityPhotoUrl,
              notes,
            ],
          ),
        )

        recomputeTargets.add(`${locationId}|${coffeeType}`)
        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)

      for (const target of recomputeTargets) {
        const [locationId, coffeeType] = target.split("|")
        await recomputeProcessingTotals(sql, tenantContext, locationId, coffeeType)
      }

      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "pepper") {
      const queries: any[] = []
      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const processDate = parseDate(getField(row, ["process_date", "date"]))
        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])

        if (!processDate || !locationRaw) {
          errors.push({ row: rowNumber, message: "Missing process_date or location" })
          skipped += 1
          continue
        }

        const locationId = await resolveOrCreateLocationId(locationRaw)
        if (!locationId) {
          errors.push({ row: rowNumber, message: "Unable to resolve location" })
          skipped += 1
          continue
        }

        const kgPicked = parseNumber(getField(row, ["kg_picked", "kgs_picked", "picked_kg"])) || 0
        const greenPepper = parseNumber(getField(row, ["green_pepper", "green"])) || 0
        const dryPepper = parseNumber(getField(row, ["dry_pepper", "dry"])) || 0
        const greenPercent =
          parseNumber(getField(row, ["green_pepper_percent", "green_percent"])) ??
          (kgPicked > 0 ? (greenPepper / kgPicked) * 100 : 0)
        const dryPercent =
          parseNumber(getField(row, ["dry_pepper_percent", "dry_percent"])) ??
          (kgPicked > 0 ? (dryPepper / kgPicked) * 100 : 0)
        const notes = getField(row, ["notes", "note"]) || ""
        const recordedBy = getField(row, ["recorded_by", "user", "user_id"]) || sessionUser.username || ""

        queries.push(
          sql.query(
            `
            INSERT INTO pepper_records (
              tenant_id, location_id, process_date,
              kg_picked, green_pepper, green_pepper_percent,
              dry_pepper, dry_pepper_percent, notes, recorded_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            [
              tenantContext.tenantId,
              locationId,
              processDate,
              kgPicked,
              greenPepper,
              greenPercent,
              dryPepper,
              dryPercent,
              notes,
              recordedBy,
            ],
          ),
        )

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)
      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "rainfall") {
      const queries: any[] = []
      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const recordDate = parseDate(getField(row, ["record_date", "date"]))
        if (!recordDate) {
          errors.push({ row: rowNumber, message: "Missing record_date" })
          skipped += 1
          continue
        }

        const inchesValue =
          parseNumber(getField(row, ["inches", "inch"])) ??
          (parseNumber(getField(row, ["mm", "millimeters"])) ?? 0) / 25.4
        const centsValue = parseNumber(getField(row, ["cents", "amount_cents", "cost_cents"])) || 0
        const notes = getField(row, ["notes", "note"]) || ""
        const userId = getField(row, ["user_id", "user"]) || sessionUser.username || ""

        queries.push(
          sql.query(
            `
            INSERT INTO rainfall_records (
              record_date, inches, cents, notes, user_id, tenant_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [recordDate, inchesValue, centsValue, notes, userId, tenantContext.tenantId],
          ),
        )

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)
      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "dispatch") {
      const queries: any[] = []
      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const dispatchDate = parseDate(getField(row, ["dispatch_date", "date"]))
        const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
        const bagType = normalizeBagType(getField(row, ["bag_type", "bag", "bagtype"]))
        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])

        if (!dispatchDate || !coffeeType || !bagType || !locationRaw) {
          errors.push({ row: rowNumber, message: "Missing dispatch_date, coffee_type, bag_type, or location" })
          skipped += 1
          continue
        }

        const bagsDispatched = parseNumber(getField(row, ["bags_dispatched", "bags", "bags_sent"]))
        if (!bagsDispatched && bagsDispatched !== 0) {
          errors.push({ row: rowNumber, message: "Missing bags_dispatched" })
          skipped += 1
          continue
        }

        const locationId = await resolveOrCreateLocationId(locationRaw)
        if (!locationId) {
          errors.push({ row: rowNumber, message: "Unable to resolve location" })
          skipped += 1
          continue
        }

        const resolvedLocation = await resolveLocationInfo(sql, tenantContext, { locationId })
        const resolvedEstate = resolvedLocation?.name || resolvedLocation?.code || locationRaw

        const kgsReceived = parseNumber(getField(row, ["kgs_received", "kgs", "weight_kgs"]))
        const lotId = getField(row, ["lot_id", "lot"]) || null
        const notes = getField(row, ["notes", "note"]) || ""
        const createdBy = getField(row, ["created_by", "user", "user_id"]) || sessionUser.username || "unknown"

        queries.push(
          sql.query(
            `
            INSERT INTO dispatch_records (
              dispatch_date, location_id, estate, lot_id, coffee_type, bag_type,
              bags_dispatched, kgs_received, notes, created_by, tenant_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            `,
            [
              dispatchDate,
              locationId,
              resolvedEstate,
              lotId,
              coffeeType,
              bagType,
              bagsDispatched,
              kgsReceived ?? null,
              notes,
              createdBy,
              tenantContext.tenantId,
            ],
          ),
        )

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)
      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "sales") {
      const queries: any[] = []
      const bagWeightKg = await resolveBagWeightKg(sql, tenantContext)

      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const saleDate = parseDate(getField(row, ["sale_date", "date"]))
        const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
        const bagType = normalizeBagType(getField(row, ["bag_type", "bag", "bagtype"]))
        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])

        if (!saleDate || !coffeeType || !bagType || !locationRaw) {
          errors.push({ row: rowNumber, message: "Missing sale_date, coffee_type, bag_type, or location" })
          skipped += 1
          continue
        }

        const locationId = await resolveOrCreateLocationId(locationRaw)
        if (!locationId) {
          errors.push({ row: rowNumber, message: "Unable to resolve location" })
          skipped += 1
          continue
        }

        const resolvedLocation = await resolveLocationInfo(sql, tenantContext, { locationId })
        const resolvedEstate = resolvedLocation?.name || resolvedLocation?.code || locationRaw

        const bagsSoldInput = parseNumber(getField(row, ["bags_sold", "bags", "bags_sent"]))
        const kgsInput = parseNumber(getField(row, ["kgs", "kgs_sold", "weight_kgs"]))
        const bagsSold = bagsSoldInput ?? (kgsInput ? kgsInput / bagWeightKg : null)

        if (bagsSold === null || bagsSold === undefined) {
          errors.push({ row: rowNumber, message: "Missing bags_sold or kgs" })
          skipped += 1
          continue
        }

        const pricePerBagInput = parseNumber(getField(row, ["price_per_bag", "price_bag"]))
        const pricePerKgInput = parseNumber(getField(row, ["price_per_kg", "price_kg"]))
        const pricePerBag = pricePerBagInput ?? (pricePerKgInput ? pricePerKgInput * bagWeightKg : null)

        if (!pricePerBag && pricePerBag !== 0) {
          errors.push({ row: rowNumber, message: "Missing price_per_bag or price_per_kg" })
          skipped += 1
          continue
        }

        const kgsSold = Number((bagsSold * bagWeightKg).toFixed(2))
        const revenueComputed = Number((bagsSold * pricePerBag).toFixed(2))
        const revenue = parseNumber(getField(row, ["revenue", "total_revenue"])) ?? revenueComputed
        const buyerName = getField(row, ["buyer_name", "buyer"]) || null
        const batchNo = getField(row, ["batch_no", "batch"]) || null
        const lotId = getField(row, ["lot_id", "lot"]) || null
        const bankAccount = getField(row, ["bank_account", "bank"]) || null
        const notes = getField(row, ["notes", "note"]) || ""

        queries.push(
          sql.query(
            `
            INSERT INTO sales_records (
              sale_date, batch_no, lot_id, location_id, estate, coffee_type, bag_type,
              buyer_name, bags_sent, kgs, kgs_received, bags_sold,
              price_per_bag, price_per_kg, revenue, total_revenue,
              bank_account, notes, tenant_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10,$11,$12,
              $13,$14,$15,$16,
              $17,$18,$19
            )
            `,
            [
              saleDate,
              batchNo,
              lotId,
              locationId,
              resolvedEstate,
              coffeeType,
              bagType,
              buyerName,
              bagsSold,
              kgsSold,
              kgsSold,
              bagsSold,
              pricePerBag,
              pricePerKgInput ?? (pricePerBag / bagWeightKg),
              revenue,
              revenue,
              bankAccount,
              notes,
              tenantContext.tenantId,
            ],
          ),
        )

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)
      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "transactions") {
      const queries: any[] = []
      const affectedItems = new Set<string>()

      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const transactionDate = parseDate(getField(row, ["transaction_date", "date"]))
        const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
        const transactionType = normalizeTransactionType(getField(row, ["transaction_type", "type"]))
        const quantity = parseNumber(getField(row, ["quantity", "qty"]))
        const price = parseNumber(getField(row, ["price", "unit_price", "price_per_unit"])) || 0
        const unit = getField(row, ["unit"]) || ""

        if (!transactionDate || !itemType || quantity === null || quantity === undefined) {
          errors.push({ row: rowNumber, message: "Missing transaction_date, item_type, or quantity" })
          skipped += 1
          continue
        }

        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
        const locationId = locationRaw ? await resolveOrCreateLocationId(locationRaw) : null
        const notes = getField(row, ["notes", "note"]) || ""
        const userId = getField(row, ["user_id", "user"]) || sessionUser.username || "system"
        const totalCost = Number((quantity * price).toFixed(2))

        if (unit) {
          if (locationId) {
            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
                VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, ${locationId})
                ON CONFLICT (item_type, tenant_id, location_id)
                DO UPDATE SET unit = EXCLUDED.unit
              `,
            )
          } else {
            await runTenantQuery(
              sql,
              tenantContext,
              sql`
                INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
                VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, NULL)
                ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
                DO UPDATE SET unit = EXCLUDED.unit
              `,
            )
          }
        }

        queries.push(
          sql.query(
            `
            INSERT INTO transaction_history (
              item_type, quantity, transaction_type, notes, user_id, price, total_cost, transaction_date, tenant_id${
                locationId ? ", location_id" : ""
              }
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9${locationId ? ", $10" : ""}
            )
            `,
            locationId
              ? [
                  itemType,
                  quantity,
                  transactionType,
                  notes,
                  userId,
                  price,
                  totalCost,
                  transactionDate,
                  tenantContext.tenantId,
                  locationId,
                ]
              : [itemType, quantity, transactionType, notes, userId, price, totalCost, transactionDate, tenantContext.tenantId],
          ),
        )

        affectedItems.add(`${itemType}::${locationId ? String(locationId) : "null"}`)

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)

      for (const key of affectedItems) {
        const [itemType, locationValue] = key.split("::")
        await recalculateInventoryForItem(
          sql,
          tenantContext,
          itemType,
          locationValue === "null" ? null : locationValue,
        )
      }

      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "inventory") {
      const affectedItems = new Set<string>()

      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
        const unit = getField(row, ["unit"]) || "kg"
        const quantity = parseNumber(getField(row, ["quantity", "qty"])) || 0
        const price = parseNumber(getField(row, ["price", "unit_price", "price_per_unit"])) || 0
        const notes = getField(row, ["notes", "note"]) || ""

        if (!itemType) {
          errors.push({ row: rowNumber, message: "Missing item_type" })
          skipped += 1
          continue
        }

        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
        const locationId = locationRaw ? await resolveOrCreateLocationId(locationRaw) : null
        const totalCost = Number((quantity * price).toFixed(2))

        if (locationId) {
          await runTenantQuery(
            sql,
            tenantContext,
            sql`
              INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
              VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, ${locationId})
              ON CONFLICT (item_type, tenant_id, location_id)
              DO UPDATE SET unit = EXCLUDED.unit
            `,
          )
        } else {
          await runTenantQuery(
            sql,
            tenantContext,
            sql`
              INSERT INTO current_inventory (item_type, quantity, unit, avg_price, total_cost, tenant_id, location_id)
              VALUES (${itemType}, 0, ${unit}, 0, 0, ${tenantContext.tenantId}, NULL)
              ON CONFLICT (item_type, tenant_id) WHERE location_id IS NULL
              DO UPDATE SET unit = EXCLUDED.unit
            `,
          )
        }

        if (quantity > 0) {
          await runTenantQuery(
            sql,
            tenantContext,
            sql`
              INSERT INTO transaction_history (
                item_type, quantity, transaction_type, notes, user_id, price, total_cost, tenant_id, location_id
              ) VALUES (
                ${itemType}, ${quantity}, 'restock', ${notes || "Imported opening balance"}, ${sessionUser.username || "system"}, ${price}, ${totalCost}, ${tenantContext.tenantId}, ${locationId}
              )
            `,
          )
        }

        affectedItems.add(`${itemType}::${locationId ? String(locationId) : "null"}`)
        imported += 1
      }

      for (const key of affectedItems) {
        const [itemType, locationValue] = key.split("::")
        await recalculateInventoryForItem(
          sql,
          tenantContext,
          itemType,
          locationValue === "null" ? null : locationValue,
        )
      }

      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "labor") {
      const queries: any[] = []
      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const deploymentDate = parseDate(getField(row, ["deployment_date", "date"]))
        const code = getField(row, ["code", "activity_code"]) || ""
        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])

        if (!deploymentDate || !code) {
          errors.push({ row: rowNumber, message: "Missing deployment_date or code" })
          skipped += 1
          continue
        }

        const locationId = locationRaw ? await resolveOrCreateLocationId(locationRaw) : null

        const hfLaborers = parseNumber(getField(row, ["hf_laborers", "estate_laborers"])) || 0
        const hfCostPer = parseNumber(getField(row, ["hf_cost_per_laborer", "estate_cost_per_laborer"])) || 0
        const outsideLaborers = parseNumber(getField(row, ["outside_laborers"])) || 0
        const outsideCostPer = parseNumber(getField(row, ["outside_cost_per_laborer"])) || 0
        const computedTotal = hfLaborers * hfCostPer + outsideLaborers * outsideCostPer
        const totalCost = parseNumber(getField(row, ["total_cost", "total_amount"])) ?? computedTotal
        const notes = getField(row, ["notes", "note"]) || ""

        queries.push(
          sql.query(
            `
            INSERT INTO labor_transactions (
              deployment_date, code, hf_laborers, hf_cost_per_laborer,
              outside_laborers, outside_cost_per_laborer, total_cost, notes, tenant_id${
                locationId ? ", location_id" : ""
              }
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9${locationId ? ", $10" : ""}
            )
            `,
            locationId
              ? [
                  deploymentDate,
                  code,
                  hfLaborers,
                  hfCostPer,
                  outsideLaborers,
                  outsideCostPer,
                  totalCost,
                  notes,
                  tenantContext.tenantId,
                  locationId,
                ]
              : [
                  deploymentDate,
                  code,
                  hfLaborers,
                  hfCostPer,
                  outsideLaborers,
                  outsideCostPer,
                  totalCost,
                  notes,
                  tenantContext.tenantId,
                ],
          ),
        )

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)
      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    if (dataset === "expenses") {
      const queries: any[] = []
      for (let index = 0; index < records.length; index += 1) {
        const row = records[index]
        const rowNumber = index + 2
        const entryDate = parseDate(getField(row, ["entry_date", "date"]))
        const code = getField(row, ["code", "activity_code"]) || ""
        const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])

        if (!entryDate || !code) {
          errors.push({ row: rowNumber, message: "Missing entry_date or code" })
          skipped += 1
          continue
        }

        const locationId = locationRaw ? await resolveOrCreateLocationId(locationRaw) : null
        const totalAmount = parseNumber(getField(row, ["total_amount", "amount", "cost"])) || 0
        const notes = getField(row, ["notes", "note"]) || ""

        queries.push(
          sql.query(
            `
            INSERT INTO expense_transactions (
              entry_date, code, total_amount, notes, tenant_id${locationId ? ", location_id" : ""}
            ) VALUES (
              $1,$2,$3,$4,$5${locationId ? ", $6" : ""}
            )
            `,
            locationId
              ? [entryDate, code, totalAmount, notes, tenantContext.tenantId, locationId]
              : [entryDate, code, totalAmount, notes, tenantContext.tenantId],
          ),
        )

        if (queries.length >= CHUNK_SIZE) {
          await flushQueries(queries)
        }
      }

      await flushQueries(queries)
      return NextResponse.json({ success: true, imported, skipped, errors })
    }

    return NextResponse.json({ success: false, error: "Unsupported dataset" }, { status: 400 })
  } catch (error: any) {
    console.error("Import error:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error?.message || "Import failed" }, { status: 500 })
  }
}
