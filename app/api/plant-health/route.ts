import { NextResponse } from "next/server"
import { isModuleAccessError, requireAnyModuleAccess } from "@/lib/server/module-access"

export const dynamic = "force-dynamic"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEFAULT_KINDWISE_ENDPOINT = "https://plant.id/api/v3/health_assessment"

type NormalizedFinding = {
  name: string
  probabilityPct: number
  description: string | null
  commonNames: string[]
  treatment: string[]
}

const getApiKey = () => {
  const explicit = String(process.env.PLANTHEALTH_API_KEY || "").trim()
  if (explicit) return explicit
  return String(process.env.planthealth || "").trim()
}

const getApiUrl = () => {
  const explicit = String(process.env.PLANTHEALTH_API_URL || process.env.KINDWISE_HEALTH_API_URL || "").trim()
  return explicit || DEFAULT_KINDWISE_ENDPOINT
}

const toTrimmed = (value: unknown, max = 160) => String(value || "").trim().slice(0, max)

const toDataUri = async (file: File) => {
  const type = file.type || "image/jpeg"
  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64")
  return `data:${type};base64,${bytes}`
}

const toTextList = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 6)
}

const toTreatmentList = (value: unknown) => {
  if (!value || typeof value !== "object") return []
  const treatment = value as Record<string, unknown>
  return [
    ...toTextList(treatment.biological),
    ...toTextList(treatment.chemical),
    ...toTextList(treatment.prevention),
  ].slice(0, 9)
}

const normalizeFindings = (payload: any): NormalizedFinding[] => {
  const suggestions = Array.isArray(payload?.result?.disease?.suggestions) ? payload.result.disease.suggestions : []
  return suggestions
    .map((item: any) => {
      const probabilityRaw = Number(item?.probability)
      const probabilityPct = Number.isFinite(probabilityRaw) ? Math.round(probabilityRaw * 1000) / 10 : 0
      return {
        name: toTrimmed(item?.name, 120) || "Unknown issue",
        probabilityPct,
        description: toTrimmed(item?.details?.description, 600) || null,
        commonNames: toTextList(item?.details?.common_names),
        treatment: toTreatmentList(item?.details?.treatment),
      }
    })
    .sort((a: NormalizedFinding, b: NormalizedFinding) => b.probabilityPct - a.probabilityPct)
    .slice(0, 5)
}

const toRiskLevel = (isHealthy: boolean | null, findings: NormalizedFinding[]) => {
  if (isHealthy === true) return "low"
  if (findings.length === 0) return "unknown"
  const top = findings[0].probabilityPct
  if (top >= 70) return "high"
  if (top >= 40) return "medium"
  return "low"
}

const buildRecommendations = (findings: NormalizedFinding[], cropType: string | null) => {
  const fromFindings = findings.flatMap((finding) => finding.treatment).filter(Boolean)
  const deduped = [...new Set(fromFindings)]
  const recommendations = deduped.slice(0, 5)

  if (recommendations.length === 0) {
    recommendations.push("Isolate affected plants and avoid moving infected leaves across locations.")
    recommendations.push("Photograph the same plant again in 3-5 days to confirm disease progression.")
    recommendations.push("Validate diagnosis with local agronomy support before applying chemical treatment.")
  }

  if (cropType === "coffee") {
    recommendations.push("Prioritize block-wise scouting so spray actions are targeted by location.")
  }
  if (cropType === "pepper") {
    recommendations.push("Check vine support shade and drainage when leaf spots or yellowing appears.")
  }

  return [...new Set(recommendations)].slice(0, 6)
}

export async function POST(request: Request) {
  try {
    await requireAnyModuleAccess(["plant-health", "resources", "ai-analysis"])

    const apiKey = getApiKey()
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Plant health API key is missing. Set PLANTHEALTH_API_KEY or planthealth.",
        },
        { status: 503 },
      )
    }

    const formData = await request.formData()
    const image = formData.get("image")
    if (!(image instanceof File)) {
      return NextResponse.json({ success: false, error: "Image file is required." }, { status: 400 })
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Only image uploads are supported." }, { status: 400 })
    }
    if (!image.size) {
      return NextResponse.json({ success: false, error: "Uploaded file is empty." }, { status: 400 })
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image is too large. Maximum size is 8 MB." },
        { status: 413 },
      )
    }

    const cropType = toTrimmed(formData.get("cropType"), 40).toLowerCase() || null
    const locationName = toTrimmed(formData.get("locationName"), 100) || null
    const notes = toTrimmed(formData.get("notes"), 240) || null

    const upstreamPayload = {
      images: [await toDataUri(image)],
      similar_images: false,
    }

    const upstreamResponse = await fetch(getApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify(upstreamPayload),
    })

    const rawText = await upstreamResponse.text()
    let upstreamJson: any = null
    try {
      upstreamJson = rawText ? JSON.parse(rawText) : null
    } catch {
      upstreamJson = null
    }

    if (!upstreamResponse.ok) {
      const upstreamMessage =
        String(upstreamJson?.detail || upstreamJson?.message || upstreamJson?.error || "").trim() ||
        `Kindwise request failed with status ${upstreamResponse.status}.`
      return NextResponse.json({ success: false, error: upstreamMessage }, { status: 502 })
    }

    const findings = normalizeFindings(upstreamJson)
    const healthyBinary =
      typeof upstreamJson?.result?.is_healthy?.binary === "boolean" ? Boolean(upstreamJson.result.is_healthy.binary) : null
    const healthyProbabilityRaw = Number(upstreamJson?.result?.is_healthy?.probability)
    const healthProbabilityPct = Number.isFinite(healthyProbabilityRaw)
      ? Math.round(healthyProbabilityRaw * 1000) / 10
      : null

    const riskLevel = toRiskLevel(healthyBinary, findings)
    const recommendations = buildRecommendations(findings, cropType)

    return NextResponse.json({
      success: true,
      provider: "kindwise",
      requestId: upstreamJson?.id ? String(upstreamJson.id) : null,
      isHealthy: healthyBinary,
      healthProbabilityPct,
      riskLevel,
      findings,
      recommendations,
      context: {
        cropType,
        locationName,
        notes,
      },
    })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error?.message || "Plant health analysis failed" },
      { status: 500 },
    )
  }
}
