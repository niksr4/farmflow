import { createHash } from "crypto"
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
const VALIDATION_EXPIRY_MINUTES = 30
const IMPORT_JOB_HELP = "Run scripts/56-import-jobs.sql to enable dry-run/commit import jobs."
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

const isImportJobTableMissing = (error: unknown) =>
  String((error as any)?.message || "").includes(`relation "import_jobs" does not exist`)

const isImportJobsUserColumnMissing = (error: unknown) =>
  String((error as any)?.message || "").includes(`requested_by_user_id`)

const hashCsv = (value: string) => createHash("sha256").update(value).digest("hex")

const normalizeImportMode = (value: unknown) => {
  const normalized = String(value || "commit").trim().toLowerCase()
  return normalized === "validate" ? "validate" : "commit"
}

const buildValidationErrors = (dataset: string, records: Array<Record<string, string>>) => {
  const errors: Array<{ row: number; message: string }> = []
  let skipped = 0

  for (let index = 0; index < records.length; index += 1) {
    const row = records[index]
    const rowNumber = index + 2
    const fail = (message: string) => {
      errors.push({ row: rowNumber, message })
      skipped += 1
    }

    if (dataset === "processing") {
      const processDate = parseDate(getField(row, ["process_date", "date"]))
      const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      if (!processDate || !coffeeType || !locationRaw) fail("Missing process_date, coffee_type, or location")
      continue
    }

    if (dataset === "pepper") {
      const processDate = parseDate(getField(row, ["process_date", "date"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      if (!processDate || !locationRaw) fail("Missing process_date or location")
      continue
    }

    if (dataset === "rainfall") {
      const recordDate = parseDate(getField(row, ["record_date", "date"]))
      if (!recordDate) fail("Missing record_date")
      continue
    }

    if (dataset === "dispatch") {
      const dispatchDate = parseDate(getField(row, ["dispatch_date", "date"]))
      const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
      const bagType = normalizeBagType(getField(row, ["bag_type", "bag", "bagtype"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      const bagsDispatched = parseNumber(getField(row, ["bags_dispatched", "bags", "bags_sent"]))
      if (!dispatchDate || !coffeeType || !bagType || !locationRaw) {
        fail("Missing dispatch_date, coffee_type, bag_type, or location")
        continue
      }
      if (!bagsDispatched && bagsDispatched !== 0) fail("Missing bags_dispatched")
      continue
    }

    if (dataset === "sales") {
      const saleDate = parseDate(getField(row, ["sale_date", "date"]))
      const coffeeType = normalizeCoffeeType(getField(row, ["coffee_type", "variety", "type"]))
      const bagType = normalizeBagType(getField(row, ["bag_type", "bag", "bagtype"]))
      const locationRaw = getField(row, ["location_id", "location", "location_code", "location_name", "estate"])
      const bagsSold = parseNumber(getField(row, ["bags_sold", "bags", "bags_sent"]))
      const kgs = parseNumber(getField(row, ["kgs", "kgs_sold", "weight_kgs"]))
      const pricePerBag = parseNumber(getField(row, ["price_per_bag", "price_bag"]))
      const pricePerKg = parseNumber(getField(row, ["price_per_kg", "price_kg"]))
      if (!saleDate || !coffeeType || !bagType || !locationRaw) {
        fail("Missing sale_date, coffee_type, bag_type, or location")
        continue
      }
      if ((bagsSold === null || bagsSold === undefined) && (kgs === null || kgs === undefined)) {
        fail("Missing bags_sold or kgs")
        continue
      }
      if ((pricePerBag === null || pricePerBag === undefined) && (pricePerKg === null || pricePerKg === undefined)) {
        fail("Missing price_per_bag or price_per_kg")
      }
      continue
    }

    if (dataset === "transactions") {
      const transactionDate = parseDate(getField(row, ["transaction_date", "date"]))
      const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
      const quantity = parseNumber(getField(row, ["quantity", "qty"]))
      if (!transactionDate || !itemType || quantity === null || quantity === undefined) {
        fail("Missing transaction_date, item_type, or quantity")
      }
      continue
    }

    if (dataset === "inventory") {
      const itemType = getField(row, ["item_type", "item", "item_name"]) || ""
      if (!itemType) fail("Missing item_type")
      continue
    }

    if (dataset === "labor") {
      const deploymentDate = parseDate(getField(row, ["deployment_date", "date"]))
      const code = getField(row, ["code", "activity_code"]) || ""
      if (!deploymentDate || !code) fail("Missing deployment_date or code")
      continue
    }

    if (dataset === "expenses") {
      const entryDate = parseDate(getField(row, ["entry_date", "date"]))
      const code = getField(row, ["code", "activity_code"]) || ""
      if (!entryDate || !code) fail("Missing entry_date or code")
    }
  }

  return { errors, skipped }
}

async function createValidationImportJob(input: {
  tenantId: string
  role: string
  requestedBy: string
  requestedByUserId?: string | null
  dataset: string
  csvText: string
  rowCount: number
  errors: Array<{ row: number; message: string }>
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  try {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO import_jobs (
          tenant_id,
          requested_by,
          requested_by_user_id,
          requested_role,
          dataset,
          mode,
          status,
          csv_sha256,
          csv_text,
          row_count,
          imported_count,
          skipped_count,
          error_count,
          errors,
          metadata,
          validation_expires_at
        )
        VALUES (
          ${tenantContext.tenantId}::uuid,
          ${input.requestedBy},
          ${input.requestedByUserId || null}::uuid,
          ${tenantContext.role},
          ${input.dataset},
          'validate',
          ${input.errors.length ? "invalid" : "validated"},
          ${hashCsv(input.csvText)},
          ${input.csvText},
          ${input.rowCount},
          0,
          ${input.errors.length},
          ${input.errors.length},
          ${JSON.stringify(input.errors)}::jsonb,
          ${JSON.stringify({ validationRows: input.rowCount })}::jsonb,
          NOW() + (${VALIDATION_EXPIRY_MINUTES} * INTERVAL '1 minute')
        )
        RETURNING id::text AS id, validation_expires_at
      `,
    )

    return rows?.[0]
  } catch (error) {
    if (!isImportJobsUserColumnMissing(error)) throw error

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO import_jobs (
          tenant_id,
          requested_by,
          requested_role,
          dataset,
          mode,
          status,
          csv_sha256,
          csv_text,
          row_count,
          imported_count,
          skipped_count,
          error_count,
          errors,
          metadata,
          validation_expires_at
        )
        VALUES (
          ${tenantContext.tenantId}::uuid,
          ${input.requestedBy},
          ${tenantContext.role},
          ${input.dataset},
          'validate',
          ${input.errors.length ? "invalid" : "validated"},
          ${hashCsv(input.csvText)},
          ${input.csvText},
          ${input.rowCount},
          0,
          ${input.errors.length},
          ${input.errors.length},
          ${JSON.stringify(input.errors)}::jsonb,
          ${JSON.stringify({ validationRows: input.rowCount })}::jsonb,
          NOW() + (${VALIDATION_EXPIRY_MINUTES} * INTERVAL '1 minute')
        )
        RETURNING id::text AS id, validation_expires_at
      `,
    )

    return rows?.[0]
  }
}

async function resolveRequestedByUserId(input: { tenantId: string; role: string; username: string }) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  const username = String(input.username || "").trim()
  if (!username) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id::text AS id
      FROM users
      WHERE tenant_id = ${tenantContext.tenantId}::uuid
        AND username = ${username}
      LIMIT 1
    `,
  )
  return rows?.[0]?.id ? String(rows[0].id) : null
}

async function loadValidatedImportJob(input: {
  tenantId: string
  role: string
  requestedBy: string
  requestedByUserId?: string | null
  dataset: string
  validationToken: string
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  if (input.requestedByUserId) {
    try {
      const rows = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT
            id::text AS id,
            status,
            dataset,
            csv_text,
            row_count,
            validation_expires_at,
            errors
          FROM import_jobs
          WHERE id = ${input.validationToken}::uuid
            AND tenant_id = ${tenantContext.tenantId}::uuid
            AND dataset = ${input.dataset}
            AND (
              requested_by_user_id = ${input.requestedByUserId}::uuid
              OR (requested_by_user_id IS NULL AND requested_by = ${input.requestedBy})
            )
          LIMIT 1
        `,
      )
      return rows?.[0]
    } catch (error) {
      if (!isImportJobsUserColumnMissing(error)) throw error
    }
  }

  const fallbackRows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        id::text AS id,
        status,
        dataset,
        csv_text,
        row_count,
        validation_expires_at,
        errors
      FROM import_jobs
      WHERE id = ${input.validationToken}::uuid
        AND tenant_id = ${tenantContext.tenantId}::uuid
        AND requested_by = ${input.requestedBy}
        AND dataset = ${input.dataset}
      LIMIT 1
    `,
  )
  return fallbackRows?.[0]
}

async function markImportJobCommitted(input: {
  tenantId: string
  role: string
  jobId: string
  imported: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE import_jobs
      SET
        mode = 'commit',
        status = 'committed',
        imported_count = ${input.imported},
        skipped_count = ${input.skipped},
        error_count = ${input.errors.length},
        errors = ${JSON.stringify(input.errors)}::jsonb,
        committed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${input.jobId}::uuid
        AND tenant_id = ${tenantContext.tenantId}::uuid
    `,
  )
}

async function markImportJobFailed(input: {
  tenantId: string
  role: string
  jobId: string
  message: string
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  await runTenantQuery(
    sql,
    tenantContext,
    sql`
      UPDATE import_jobs
      SET
        mode = 'commit',
        status = 'failed',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{failure}', ${JSON.stringify({
          message: input.message,
          at: new Date().toISOString(),
        })}::jsonb, true),
        updated_at = NOW()
      WHERE id = ${input.jobId}::uuid
        AND tenant_id = ${tenantContext.tenantId}::uuid
    `,
  )
}

export async function POST(request: Request) {
  let commitJobId: string | null = null
  let mode: "validate" | "commit" = "commit"
  let activeTenantContext: { tenantId: string; role: string } | null = null
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireSessionUser()
    if (!["admin", "owner"].includes(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Admin role required" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    activeTenantContext = tenantContext
    const requestedBy = String(sessionUser.username || "").trim()
    const requestedByUserId = await resolveRequestedByUserId({
      tenantId: tenantContext.tenantId,
      role: tenantContext.role,
      username: requestedBy,
    })

    const body = await request.json()
    const dataset = String(body?.dataset || "").trim().toLowerCase()
    mode = normalizeImportMode(body?.mode)
    const validationToken = String(body?.validationToken || "").trim()
    let csvText = String(body?.csv || "")

    if (!dataset) {
      return NextResponse.json({ success: false, error: "Dataset is required" }, { status: 400 })
    }

    const moduleId = DATASET_MODULE_MAP[dataset]
    if (!moduleId) {
      return NextResponse.json({ success: false, error: "Unsupported dataset" }, { status: 400 })
    }

    await requireModuleAccess(moduleId, sessionUser)

    if (mode === "commit" && validationToken) {
      let validationJob: any
      try {
        validationJob = await loadValidatedImportJob({
          tenantId: tenantContext.tenantId,
          role: tenantContext.role,
          requestedBy,
          requestedByUserId,
          dataset,
          validationToken,
        })
      } catch (error) {
        if (isImportJobTableMissing(error)) {
          return NextResponse.json({ success: false, error: IMPORT_JOB_HELP }, { status: 503 })
        }
        throw error
      }

      if (!validationJob) {
        return NextResponse.json({ success: false, error: "Validation token not found for this dataset/user" }, { status: 404 })
      }
      if (validationJob.status === "invalid") {
        return NextResponse.json(
          {
            success: false,
            error: "Validation failed. Fix CSV errors and validate again.",
            validationErrors: Array.isArray(validationJob.errors) ? validationJob.errors : [],
          },
          { status: 400 },
        )
      }
      if (validationJob.status === "committed") {
        return NextResponse.json(
          { success: false, error: "Validation token already committed. Validate CSV again before re-importing." },
          { status: 409 },
        )
      }
      if (validationJob.status === "expired") {
        return NextResponse.json({ success: false, error: "Validation token expired. Validate CSV again." }, { status: 410 })
      }
      if (validationJob.status !== "validated") {
        return NextResponse.json({ success: false, error: "Validation token is not ready for commit." }, { status: 400 })
      }
      const expiresAt = validationJob.validation_expires_at ? new Date(validationJob.validation_expires_at) : null
      if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        await runTenantQuery(
          sql,
          tenantContext,
          sql`
            UPDATE import_jobs
            SET status = 'expired', updated_at = NOW()
            WHERE id = ${validationJob.id}::uuid
              AND tenant_id = ${tenantContext.tenantId}::uuid
          `,
        )
        return NextResponse.json({ success: false, error: "Validation token expired. Validate CSV again." }, { status: 410 })
      }
      commitJobId = String(validationJob.id)
      csvText = String(validationJob.csv_text || "")
    }

    if (mode === "validate") {
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

      const validation = buildValidationErrors(dataset, records)
      let jobRow: any
      try {
        jobRow = await createValidationImportJob({
          tenantId: tenantContext.tenantId,
          role: tenantContext.role,
          requestedBy,
          requestedByUserId,
          dataset,
          csvText,
          rowCount: records.length,
          errors: validation.errors,
        })
      } catch (error) {
        if (isImportJobTableMissing(error)) {
          return NextResponse.json({ success: false, error: IMPORT_JOB_HELP }, { status: 503 })
        }
        throw error
      }

      const valid = validation.errors.length === 0
      return NextResponse.json({
        success: true,
        mode: "validate",
        valid,
        rowCount: records.length,
        imported: 0,
        skipped: validation.skipped,
        errors: validation.errors,
        validationToken: valid ? String(jobRow?.id || "") : null,
        expiresAt: jobRow?.validation_expires_at || null,
      })
    }

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

    const finalizeSuccess = async () => {
      if (commitJobId) {
        await markImportJobCommitted({
          tenantId: tenantContext.tenantId,
          role: tenantContext.role,
          jobId: commitJobId,
          imported,
          skipped,
          errors,
        })
      }
      return NextResponse.json({
        success: true,
        mode: "commit",
        imported,
        skipped,
        errors,
        validationToken: commitJobId,
      })
    }

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

      return finalizeSuccess()
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
      return finalizeSuccess()
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
      return finalizeSuccess()
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
      return finalizeSuccess()
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
      return finalizeSuccess()
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
        const unitValue = unit || "kg"

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
              item_type, quantity, transaction_type, notes, user_id, price, total_cost, transaction_date, tenant_id, unit${
                locationId ? ", location_id" : ""
              }
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10${locationId ? ", $11" : ""}
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
                  unitValue,
                  locationId,
                ]
              : [itemType, quantity, transactionType, notes, userId, price, totalCost, transactionDate, tenantContext.tenantId, unitValue],
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

      return finalizeSuccess()
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
                item_type, quantity, transaction_type, notes, user_id, price, total_cost, tenant_id, location_id, unit
              ) VALUES (
                ${itemType}, ${quantity}, 'restock', ${notes || "Imported opening balance"}, ${sessionUser.username || "system"}, ${price}, ${totalCost}, ${tenantContext.tenantId}, ${locationId}, ${unit || "kg"}
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

      return finalizeSuccess()
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
      return finalizeSuccess()
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
      return finalizeSuccess()
    }

    return NextResponse.json({ success: false, error: "Unsupported dataset" }, { status: 400 })
  } catch (error: any) {
    console.error("Import error:", error)
    if (commitJobId && activeTenantContext) {
      try {
        await markImportJobFailed({
          tenantId: activeTenantContext.tenantId,
          role: activeTenantContext.role,
          jobId: commitJobId,
          message: error?.message || "Import failed",
        })
      } catch (jobError) {
        console.warn("Failed to mark import job as failed:", jobError)
      }
    }
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if ((mode === "validate" || commitJobId) && isImportJobTableMissing(error)) {
      return NextResponse.json({ success: false, error: IMPORT_JOB_HELP }, { status: 503 })
    }
    return NextResponse.json({ success: false, error: error?.message || "Import failed" }, { status: 500 })
  }
}
