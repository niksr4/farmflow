import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { isModuleAccessError, requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const sanitizeFileName = (value: string) => {
  const trimmed = String(value || "document.bin").trim()
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_")
  return safe || "document.bin"
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireModuleAccess("documents")

    const params = await context.params
    const id = String(params?.id || "").trim()
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid document id" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          file_name,
          mime_type,
          file_data_base64,
          file_size_bytes
        FROM document_records
        WHERE id = ${id}::uuid
          AND tenant_id = ${tenantContext.tenantId}::uuid
        LIMIT 1
      `,
    )

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })
    }

    const row = rows[0]
    const fileBytes = Buffer.from(String(row.file_data_base64 || ""), "base64")
    const fileName = sanitizeFileName(String(row.file_name || "document.bin"))
    const mimeType = String(row.mime_type || "application/octet-stream")

    return new NextResponse(new Uint8Array(fileBytes), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(Number(row.file_size_bytes) || fileBytes.byteLength),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error: any) {
    console.error("Error downloading document:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const message = String(error?.message || "Failed to download document")
    if (message.includes('relation "document_records" does not exist')) {
      return NextResponse.json(
        { success: false, error: "Document table is not available. Run scripts/55-document-records.sql first." },
        { status: 503 },
      )
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
