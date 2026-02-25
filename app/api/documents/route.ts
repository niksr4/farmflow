import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { sql } from "@/lib/server/db"
import { isModuleAccessError, requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_LIMIT = 200
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const DOCUMENT_TYPES = [
  "invoice",
  "dispatch_slip",
  "buyer_confirmation",
  "weighbridge_slip",
  "lab_report",
  "quality_sheet",
  "other",
] as const
const VALID_DOCUMENT_TYPES = new Set<string>(DOCUMENT_TYPES)

type OptionalIdValidation = {
  value: number | null
  error?: string
}

const toTrimmed = (value: FormDataEntryValue | null, max = 240) => {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

const normalizeTenantId = (requested: string | null, sessionTenantId: string, role: string) => {
  if (role === "owner") {
    const normalized = String(requested || "").trim()
    if (normalized && UUID_PATTERN.test(normalized)) return normalized
  }
  return sessionTenantId
}

const parseOptionalUuid = (value: string) => {
  const normalized = String(value || "").trim()
  if (!normalized) return null
  return UUID_PATTERN.test(normalized) ? normalized : "invalid"
}

const parseOptionalDate = (value: string) => {
  const normalized = String(value || "").trim()
  if (!normalized) return null
  return DATE_PATTERN.test(normalized) ? normalized : "invalid"
}

const parseOptionalId = (value: FormDataEntryValue | null, field: string): OptionalIdValidation => {
  const normalized = toTrimmed(value, 30)
  if (!normalized) return { value: null }
  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { value: null, error: `${field} must be a positive integer` }
  }
  return { value: parsed }
}

const normalizeMimeType = (raw: string) => {
  const mime = String(raw || "").trim().toLowerCase().slice(0, 120)
  return mime || "application/octet-stream"
}

const formatDocumentRow = (row: any) => ({
  id: row.id,
  tenant_id: row.tenant_id,
  location_id: row.location_id,
  location_name: row.location_name,
  location_code: row.location_code,
  document_type: row.document_type,
  title: row.title,
  file_name: row.file_name,
  mime_type: row.mime_type,
  file_size_bytes: Number(row.file_size_bytes) || 0,
  sha256_hex: row.sha256_hex,
  lot_id: row.lot_id,
  buyer_name: row.buyer_name,
  dispatch_record_id: row.dispatch_record_id,
  sales_record_id: row.sales_record_id,
  receivable_id: row.receivable_id,
  document_date: row.document_date,
  notes: row.notes,
  uploaded_by: row.uploaded_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

async function validateLocationForTenant(
  tenantContext: { tenantId: string; role: string },
  locationId: string | null,
) {
  if (!locationId) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT id
      FROM locations
      WHERE id = ${locationId}::uuid
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return rows?.length ? locationId : null
}

async function validateScopedRecord(
  tenantContext: { tenantId: string; role: string },
  tableName: "dispatch_records" | "sales_records" | "receivables",
  id: number | null,
) {
  if (!id) return null
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql.query(
      `
        SELECT id
        FROM ${tableName}
        WHERE id = $1
          AND tenant_id = $2::uuid
        LIMIT 1
      `,
      [id, tenantContext.tenantId],
    ),
  )
  return rows?.length ? id : null
}

export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("documents")

    const { searchParams } = new URL(request.url)
    const tenantId = normalizeTenantId(searchParams.get("tenantId"), sessionUser.tenantId, sessionUser.role)
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const typeFilterRaw = String(searchParams.get("documentType") || "").trim().toLowerCase()
    const typeFilter = typeFilterRaw && VALID_DOCUMENT_TYPES.has(typeFilterRaw) ? typeFilterRaw : null

    const locationFilterRaw = parseOptionalUuid(String(searchParams.get("locationId") || ""))
    if (locationFilterRaw === "invalid") {
      return NextResponse.json({ success: false, error: "locationId is invalid" }, { status: 400 })
    }

    const queryText = String(searchParams.get("q") || "").trim().toLowerCase().slice(0, 120)
    const requestedLimit = Number(searchParams.get("limit") || "50")
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.round(requestedLimit)))
      : 50

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          d.id,
          d.tenant_id,
          d.location_id,
          d.document_type,
          d.title,
          d.file_name,
          d.mime_type,
          d.file_size_bytes,
          d.sha256_hex,
          d.lot_id,
          d.buyer_name,
          d.dispatch_record_id,
          d.sales_record_id,
          d.receivable_id,
          d.document_date,
          d.notes,
          d.uploaded_by,
          d.created_at,
          d.updated_at,
          l.name AS location_name,
          l.code AS location_code
        FROM document_records d
        LEFT JOIN locations l ON l.id = d.location_id
        WHERE d.tenant_id = ${tenantId}::uuid
          AND (${typeFilter}::text IS NULL OR lower(d.document_type) = ${typeFilter})
          AND (${locationFilterRaw}::uuid IS NULL OR d.location_id = ${locationFilterRaw}::uuid)
          AND (
            ${queryText} = ''
            OR lower(
              concat_ws(
                ' ',
                COALESCE(d.title, ''),
                COALESCE(d.file_name, ''),
                COALESCE(d.lot_id, ''),
                COALESCE(d.buyer_name, ''),
                COALESCE(d.notes, ''),
                COALESCE(l.name, ''),
                COALESCE(l.code, '')
              )
            ) LIKE ${`%${queryText}%`}
          )
        ORDER BY d.created_at DESC
        LIMIT ${limit}
      `,
    )

    return NextResponse.json({
      success: true,
      records: (rows || []).map(formatDocumentRow),
      count: rows?.length || 0,
      filters: {
        documentType: typeFilter,
        locationId: locationFilterRaw,
        q: queryText,
      },
    })
  } catch (error: any) {
    console.error("Error fetching documents:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const message = String(error?.message || "Failed to fetch documents")
    if (message.includes('relation "document_records" does not exist')) {
      return NextResponse.json(
        { success: false, error: "Document table is not available. Run scripts/55-document-records.sql first." },
        { status: 503 },
      )
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("documents")

    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "File upload is required" }, { status: 400 })
    }
    if (!file.size) {
      return NextResponse.json({ success: false, error: "Uploaded file is empty" }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: `File is too large. Maximum size is ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.` },
        { status: 413 },
      )
    }

    const documentType = toTrimmed(formData.get("documentType"), 40).toLowerCase()
    if (!VALID_DOCUMENT_TYPES.has(documentType)) {
      return NextResponse.json(
        { success: false, error: `documentType must be one of: ${DOCUMENT_TYPES.join(", ")}` },
        { status: 400 },
      )
    }

    const title = toTrimmed(formData.get("title"), 140) || null
    const lotId = toTrimmed(formData.get("lotId"), 80) || null
    const buyerName = toTrimmed(formData.get("buyerName"), 120) || null
    const notes = toTrimmed(formData.get("notes"), 1200) || null
    const documentDateRaw = parseOptionalDate(toTrimmed(formData.get("documentDate"), 20))
    if (documentDateRaw === "invalid") {
      return NextResponse.json({ success: false, error: "documentDate must be YYYY-MM-DD" }, { status: 400 })
    }

    const locationInput = parseOptionalUuid(toTrimmed(formData.get("locationId"), 60))
    if (locationInput === "invalid") {
      return NextResponse.json({ success: false, error: "locationId is invalid" }, { status: 400 })
    }

    const dispatchId = parseOptionalId(formData.get("dispatchRecordId"), "dispatchRecordId")
    const salesId = parseOptionalId(formData.get("salesRecordId"), "salesRecordId")
    const receivableId = parseOptionalId(formData.get("receivableId"), "receivableId")
    if (dispatchId.error || salesId.error || receivableId.error) {
      return NextResponse.json(
        {
          success: false,
          error: dispatchId.error || salesId.error || receivableId.error,
        },
        { status: 400 },
      )
    }

    const tenantId = normalizeTenantId(toTrimmed(formData.get("tenantId"), 80), sessionUser.tenantId, sessionUser.role)
    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    const validLocationId = await validateLocationForTenant(tenantContext, locationInput)
    if (locationInput && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }

    const validDispatchId = await validateScopedRecord(tenantContext, "dispatch_records", dispatchId.value)
    if (dispatchId.value && !validDispatchId) {
      return NextResponse.json({ success: false, error: "dispatchRecordId not found for this tenant" }, { status: 400 })
    }

    const validSalesId = await validateScopedRecord(tenantContext, "sales_records", salesId.value)
    if (salesId.value && !validSalesId) {
      return NextResponse.json({ success: false, error: "salesRecordId not found for this tenant" }, { status: 400 })
    }

    const validReceivableId = await validateScopedRecord(tenantContext, "receivables", receivableId.value)
    if (receivableId.value && !validReceivableId) {
      return NextResponse.json({ success: false, error: "receivableId not found for this tenant" }, { status: 400 })
    }

    const fileName = String(file.name || "upload.bin").trim().slice(0, 255) || "upload.bin"
    const mimeType = normalizeMimeType(file.type)
    const bytes = Buffer.from(await file.arrayBuffer())
    const fileSizeBytes = bytes.byteLength
    const fileDataBase64 = bytes.toString("base64")
    const sha256Hex = createHash("sha256").update(new Uint8Array(bytes)).digest("hex")

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO document_records (
          tenant_id,
          location_id,
          document_type,
          title,
          file_name,
          mime_type,
          file_size_bytes,
          file_data_base64,
          sha256_hex,
          lot_id,
          buyer_name,
          dispatch_record_id,
          sales_record_id,
          receivable_id,
          document_date,
          notes,
          uploaded_by
        )
        VALUES (
          ${tenantId}::uuid,
          ${validLocationId}::uuid,
          ${documentType},
          ${title},
          ${fileName},
          ${mimeType},
          ${fileSizeBytes},
          ${fileDataBase64},
          ${sha256Hex},
          ${lotId},
          ${buyerName},
          ${validDispatchId},
          ${validSalesId},
          ${validReceivableId},
          ${documentDateRaw}::date,
          ${notes},
          ${sessionUser.username}
        )
        RETURNING
          id,
          tenant_id,
          location_id,
          document_type,
          title,
          file_name,
          mime_type,
          file_size_bytes,
          sha256_hex,
          lot_id,
          buyer_name,
          dispatch_record_id,
          sales_record_id,
          receivable_id,
          document_date,
          notes,
          uploaded_by,
          created_at,
          updated_at
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "document_records",
      entityId: rows?.[0]?.id,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: rows?.[0] ? formatDocumentRow(rows[0]) : null })
  } catch (error: any) {
    console.error("Error creating document record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const message = String(error?.message || "Failed to upload document")
    if (message.includes('relation "document_records" does not exist')) {
      return NextResponse.json(
        { success: false, error: "Document table is not available. Run scripts/55-document-records.sql first." },
        { status: 503 },
      )
    }
    if (message.includes('relation "receivables" does not exist')) {
      return NextResponse.json(
        { success: false, error: "Receivables table is not available. Run scripts/47-receivables.sql first." },
        { status: 503 },
      )
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
