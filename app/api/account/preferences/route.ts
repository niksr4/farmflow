import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeAppLocale } from "@/lib/i18n"
import { requireSessionUser } from "@/lib/server/auth"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

const preferencesBodySchema = z.object({
  preferredLocale: z.string().trim().min(1, "Preferred language is required").optional(),
  digestEmail: z.string().email("Enter a valid email address").optional(),
}).refine((data) => data.preferredLocale !== undefined || data.digestEmail !== undefined, {
  message: "At least one field is required",
})

export async function GET() {
  try {
    const sessionUser = await requireSessionUser()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT preferred_locale
        FROM users
        WHERE id = ${sessionUser.id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    return NextResponse.json({
      success: true,
      preferences: {
        preferredLocale: normalizeAppLocale(rows?.[0]?.preferred_locale || sessionUser.preferredLocale || "en"),
      },
    })
  } catch (error: any) {
    const message = error?.message || "Failed to load account preferences"
    return NextResponse.json({ success: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = preferencesBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    if (parsed.data.preferredLocale !== undefined) {
      const preferredLocale = normalizeAppLocale(parsed.data.preferredLocale)
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          UPDATE users
          SET preferred_locale = ${preferredLocale}
          WHERE id = ${sessionUser.id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    }

    if (parsed.data.digestEmail !== undefined) {
      const email = parsed.data.digestEmail.trim().toLowerCase()
      await runTenantQuery(
        sql,
        tenantContext,
        sql`
          UPDATE users
          SET email = ${email}, normalized_email = ${email}
          WHERE id = ${sessionUser.id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    const message = error?.message || "Failed to update account preferences"
    return NextResponse.json({ success: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 })
  }
}

