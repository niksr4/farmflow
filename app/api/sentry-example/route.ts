import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

export const dynamic = "force-dynamic"

export async function GET() {
  const error = new Error("FarmFlow Sentry server-side test error")
  Sentry.captureException(error)
  return NextResponse.json({ error: "Server error triggered — check Sentry Issues" }, { status: 500 })
}
