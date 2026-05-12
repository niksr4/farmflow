import { NextResponse, type NextRequest } from "next/server"
import { sql } from "@/lib/server/db"
import { checkRateLimit, buildRateLimitHeaders } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const revalidate = 0

const getIp = (req: NextRequest) =>
  (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0]?.trim() || "unknown"

// Public endpoint — no auth required. Returns only non-sensitive trace data for a lot.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const rateLimit = await checkRateLimit("registerInterest", `lot:${getIp(request)}`).catch(() => null)
    if (rateLimit && !rateLimit.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: buildRateLimitHeaders(rateLimit) },
      )
    }

    const { lotId } = await params
    const normalized = String(lotId ?? "").trim()
    if (!normalized || normalized.length > 80) {
      return NextResponse.json({ success: false, error: "Invalid lot ID" }, { status: 400 })
    }

    // Fetch the processing record(s) for this lot
    const processingRows = await sql`
      SELECT
        pr.lot_id,
        pr.process_date,
        pr.coffee_type,
        pr.crop_today,
        pr.ripe_today,
        pr.green_today,
        pr.wet_parchment,
        pr.dry_parch,
        pr.dry_cherry,
        pr.moisture_pct,
        pr.quality_grade,
        l.name AS location_name,
        t.name AS estate_name,
        t.crop_family
      FROM processing_records pr
      LEFT JOIN locations l ON l.id = pr.location_id
      JOIN tenants t ON t.id = pr.tenant_id
      WHERE pr.lot_id = ${normalized}
      ORDER BY pr.process_date ASC
      LIMIT 20
    `

    const rows = Array.isArray(processingRows) ? processingRows : (processingRows as any)?.rows ?? []

    if (!rows.length) {
      return NextResponse.json({ success: false, error: "Lot not found" }, { status: 404 })
    }

    const first = rows[0]

    // Aggregate totals across all processing days for this lot
    const totalCherryKg = rows.reduce((s: number, r: any) => s + Number(r.crop_today ?? 0), 0)
    const totalDryParchKg = rows.reduce((s: number, r: any) => s + Number(r.dry_parch ?? 0), 0)
    const totalDryCherryKg = rows.reduce((s: number, r: any) => s + Number(r.dry_cherry ?? 0), 0)
    const lastMoisture = rows.findLast((r: any) => r.moisture_pct != null)?.moisture_pct ?? null
    const qualityGrade = rows.findLast((r: any) => r.quality_grade != null)?.quality_grade ?? null

    // Fetch compliance certifications for this estate (public-safe subset)
    const certRows = await sql`
      SELECT certification_name, status, valid_until
      FROM compliance_records
      WHERE tenant_id = (
        SELECT tenant_id FROM processing_records WHERE lot_id = ${normalized} LIMIT 1
      )
        AND status = 'active'
      LIMIT 10
    `.catch(() => [])
    const certs = (Array.isArray(certRows) ? certRows : (certRows as any)?.rows ?? []).map((r: any) => ({
      name: String(r.certification_name || ""),
      validUntil: r.valid_until ? String(r.valid_until).slice(0, 10) : null,
    }))

    return NextResponse.json({
      success: true,
      lot: {
        lotId: normalized,
        estateName: String(first.estate_name || "Estate"),
        cropFamily: String(first.crop_family || "coffee"),
        coffeeType: String(first.coffee_type || ""),
        locationName: first.location_name ? String(first.location_name) : null,
        processDateStart: String(rows[0].process_date).slice(0, 10),
        processDateEnd: String(rows[rows.length - 1].process_date).slice(0, 10),
        processingDays: rows.length,
        totalCherryKg: Math.round(totalCherryKg * 10) / 10,
        totalDryParchKg: Math.round(totalDryParchKg * 10) / 10,
        totalDryCherryKg: Math.round(totalDryCherryKg * 10) / 10,
        cherryToDryParchPct:
          totalCherryKg > 0
            ? Math.round((totalDryParchKg / totalCherryKg) * 1000) / 10
            : null,
        moisturePct: lastMoisture != null ? Number(lastMoisture) : null,
        qualityGrade,
        certifications: certs,
      },
    })
  } catch (err: any) {
    console.error("lot trace error:", err?.message)
    return NextResponse.json({ success: false, error: "Failed to load lot data" }, { status: 500 })
  }
}
