import { NextResponse } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const revalidate = 0
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { normalizeAppLocale } from "@/lib/i18n"
import { MODULE_BUNDLES } from "@/lib/modules"
import { requireSessionUser } from "@/lib/server/auth"
import { completeGuidedSetup, loadGuidedSetup } from "@/lib/server/onboarding/setup"
import { buildErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { isDbConfigured } from "@/lib/server/db"

const setupBodySchema = z.object({
  estateName: z.string().trim().min(1, "Estate name is required").max(160, "Estate name is too long"),
  bagWeightKg: z.number().min(40, "Bag weight must be at least 40 kg").max(70, "Bag weight must be 70 kg or less"),
  preferredLocale: z.string().trim().min(1, "Preferred language is required"),
  primaryLocationName: z.string().trim().min(1, "Primary location name is required").max(120, "Location name is too long"),
  primaryLocationCode: z.string().trim().min(1, "Location code is required").max(24, "Location code is too long"),
  moduleBundleId: z.string().trim().min(1, "Module bundle is required"),
})

export async function GET() {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  try {
    const sessionUser = await requireSessionUser()
    if (!shouldForceGuidedSetup(sessionUser)) {
      return NextResponse.json({ success: false, error: "Guided setup is not required for this account" }, { status: 403 })
    }
    const setup = await loadGuidedSetup(sessionUser)
    return NextResponse.json({
      success: true,
      setup,
      moduleBundles: MODULE_BUNDLES,
    })
  } catch (error) {
    return buildErrorResponse(error, "Failed to load onboarding setup", {
      statusByMessage: { Unauthorized: 401, "Admin role required": 403 },
    })
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured) {
    return databaseNotConfiguredResponse()
  }

  try {
    const sessionUser = await requireSessionUser()
    if (!shouldForceGuidedSetup(sessionUser)) {
      return NextResponse.json({ success: false, error: "Guided setup is not required for this account" }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const parsed = setupBodySchema.safeParse({
      ...body,
      bagWeightKg: Number(body?.bagWeightKg),
    })
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid onboarding payload" },
        { status: 400 },
      )
    }

    const saved = await completeGuidedSetup(sessionUser, {
      estateName: parsed.data.estateName,
      bagWeightKg: parsed.data.bagWeightKg,
      preferredLocale: normalizeAppLocale(parsed.data.preferredLocale),
      primaryLocationName: parsed.data.primaryLocationName,
      primaryLocationCode: parsed.data.primaryLocationCode,
      moduleBundleId: parsed.data.moduleBundleId,
    })

    return NextResponse.json({ success: true, setup: saved })
  } catch (error) {
    return buildErrorResponse(error, "Failed to complete onboarding setup", {
      statusByMessage: {
        Unauthorized: 401,
        "Admin role required": 403,
        "Module bundle is invalid": 400,
      },
    })
  }
}
