import { NextResponse } from "next/server"
import { requireSessionUser } from "@/lib/server/auth"
import { ensurePrivacySchema, updateUsername } from "@/lib/server/privacy"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const schema = await ensurePrivacySchema(sessionUser)
    if (!schema.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "DPDP schema missing. Run scripts/40-dpdp-privacy.sql.",
          missing: schema,
        },
        { status: 500 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 })
    }
    const newUsername = String(body?.newUsername || "").trim()
    if (!newUsername) {
      return NextResponse.json({ success: false, error: "New username is required" }, { status: 400 })
    }

    await updateUsername(sessionUser, newUsername)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const rawMessage = error?.message || "Failed to update username"
    const isKnownMessage =
      rawMessage === "Username already exists" ||
      [
        "Invalid request body",
        "New username is required",
        "System usernames are reserved",
        "Username 'owner' is reserved for the platform account",
        "User not found",
      ].includes(rawMessage)
    const status = rawMessage === "Username already exists" ? 409 : isKnownMessage ? 400 : 500
    // Known messages above are safe, deliberately-thrown application errors — only the
    // unrecognized fallback path needs sanitizing against raw DB/internal error text.
    const message = isKnownMessage ? rawMessage : sanitizeRouteError(error, "Failed to update username")
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
