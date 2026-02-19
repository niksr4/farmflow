import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { requireOwnerRole } from "@/lib/tenant"

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to run the sales table migration"
  })
}

export async function POST() {
  try {
    const sessionUser = await requireSessionUser()
    requireOwnerRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    // Add new columns to sales_records
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS batch_no VARCHAR(100)`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS estate VARCHAR(100)`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS coffee_type VARCHAR(50)`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS kgs DECIMAL(10,2) DEFAULT 0`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS bags_sold DECIMAL(10,2) DEFAULT 0`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS price_per_bag DECIMAL(10,2) DEFAULT 0`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS revenue DECIMAL(12,2) DEFAULT 0`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS bank_account VARCHAR(255)`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS bags_sent NUMERIC(10,2) DEFAULT 0`
    await sql`ALTER TABLE sales_records ALTER COLUMN bags_sent TYPE NUMERIC(10,2) USING COALESCE(bags_sent, 0)::numeric`
    await sql`ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    // Add updated_at to dispatch_records
    await sql`ALTER TABLE dispatch_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    return NextResponse.json({ 
      success: true, 
      message: "Migration completed successfully. New columns added to sales_records table." 
    })
  } catch (error) {
    console.error("Migration error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
