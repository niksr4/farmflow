import { NextResponse } from "next/server"
import { adminSql, isAdminDbConfigured } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireOwnerRole } from "@/lib/tenant"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to run the sales table migration"
  })
}

export async function POST() {
  try {
    const sessionUser = await requireSessionUser()
    requireOwnerRole(sessionUser.role)

    /**
     * isAdminDbConfigured, NOT isDbConfigured. adminSql falls back to `sql` when no separate
     * owner URL is set, so gating on "is there a database" would hand this the least-privilege
     * runtime client and put the ALTER TABLEs below straight back on a role that owns nothing --
     * the exact bug this route was just fixed for, reintroduced through the guard.
     */
    if (!isAdminDbConfigured) {
      return NextResponse.json(
        { success: false, error: "Schema-owner database connection not configured" },
        { status: 500 },
      )
    }

    /**
     * adminSql, NOT sql. This is DDL, and `sql` is the app_runtime connection -- a
     * least-privilege, non-BYPASSRLS, DML-only role that does not own these tables
     * (sales_records and dispatch_records are owned by neondb_owner). ALTER TABLE checks
     * ownership before it checks anything else, so every statement below would have been
     * refused outright wherever APP_DATABASE_URL is set -- which is both dev and prod.
     *
     * IF NOT EXISTS does not save it: that suppresses the "column already exists" error, not
     * the privilege check. lib/server/db.ts exposes adminSql precisely for DDL and self-healing.
     */
    // Add new columns to sales_records
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS batch_no VARCHAR(100)`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS estate VARCHAR(100)`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS coffee_type VARCHAR(50)`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS kgs DECIMAL(10,2) DEFAULT 0`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS bags_sold DECIMAL(10,2) DEFAULT 0`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS price_per_bag DECIMAL(10,2) DEFAULT 0`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS revenue DECIMAL(12,2) DEFAULT 0`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS bank_account VARCHAR(255)`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS bags_sent NUMERIC(10,2) DEFAULT 0`
    await adminSql`ALTER TABLE sales_records ALTER COLUMN bags_sent TYPE NUMERIC(10,2) USING COALESCE(bags_sent, 0)::numeric`
    await adminSql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    // Add updated_at to dispatch_records
    await adminSql`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    return NextResponse.json({ 
      success: true, 
      message: "Migration completed successfully. New columns added to sales_records table." 
    })
  } catch (error) {
    console.error("Migration error:", error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Migration failed") },
      { status: 500 }
    )
  }
}
