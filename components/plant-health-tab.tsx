"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { AlertTriangle, CheckCircle2, Leaf, Loader2, UploadCloud } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

type PlantFinding = {
  name: string
  probabilityPct: number
  description: string | null
  commonNames: string[]
  treatment: string[]
}

type PlantHealthResult = {
  provider: string
  requestId: string | null
  isHealthy: boolean | null
  healthProbabilityPct: number | null
  riskLevel: "low" | "medium" | "high" | "unknown" | string
  findings: PlantFinding[]
  recommendations: string[]
}

const cropOptions = [
  { value: "coffee", label: "Coffee" },
  { value: "pepper", label: "Pepper" },
  { value: "other", label: "Other crop" },
]

const riskStyle: Record<string, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
}

const toReadableRisk = (riskLevel: string) => {
  const normalized = String(riskLevel || "unknown").toLowerCase()
  if (normalized === "low") return "Low risk"
  if (normalized === "medium") return "Medium risk"
  if (normalized === "high") return "High risk"
  return "Unknown risk"
}

export default function PlantHealthTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [cropType, setCropType] = useState<string>("coffee")
  const [locationName, setLocationName] = useState("")
  const [notes, setNotes] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<PlantHealthResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  const fileSizeLabel = useMemo(() => {
    if (!selectedFile) return "No file selected"
    const mb = selectedFile.size / (1024 * 1024)
    return `${selectedFile.name} (${mb.toFixed(2)} MB)`
  }, [selectedFile])

  const analyzeImage = async () => {
    setError("")
    setResult(null)

    if (!selectedFile) {
      setError("Please choose a leaf image before running analysis.")
      return
    }
    if (selectedFile.size > MAX_IMAGE_BYTES) {
      setError("Image exceeds 8 MB. Please upload a smaller photo.")
      return
    }

    setIsAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append("image", selectedFile)
      formData.append("cropType", cropType)
      formData.append("locationName", locationName)
      formData.append("notes", notes)

      const response = await fetch("/api/plant-health", {
        method: "POST",
        body: formData,
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Plant health analysis failed.")
      }

      setResult({
        provider: String(payload.provider || "kindwise"),
        requestId: payload.requestId ? String(payload.requestId) : null,
        isHealthy: typeof payload.isHealthy === "boolean" ? payload.isHealthy : null,
        healthProbabilityPct:
          typeof payload.healthProbabilityPct === "number" ? Number(payload.healthProbabilityPct) : null,
        riskLevel: String(payload.riskLevel || "unknown"),
        findings: Array.isArray(payload.findings) ? payload.findings : [],
        recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : [],
      })
    } catch (analysisError: any) {
      setError(analysisError?.message || "Plant health analysis failed.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-emerald-700" />
            Plant Health Scan
          </CardTitle>
          <CardDescription>
            Upload a clear leaf photo to detect likely disease patterns and suggested next actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plant-health-image">Leaf image</Label>
              <Input
                id="plant-health-image"
                type="file"
                accept="image/*"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">{fileSizeLabel}</p>
            </div>

            <div className="space-y-2">
              <Label>Crop type</Label>
              <Select value={cropType} onValueChange={setCropType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select crop type" />
                </SelectTrigger>
                <SelectContent>
                  {cropOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plant-health-location">Location (optional)</Label>
              <Input
                id="plant-health-location"
                placeholder="Block A / Main Estate"
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plant-health-notes">Notes (optional)</Label>
              <Textarea
                id="plant-health-notes"
                placeholder="Example: yellowing after heavy rain"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <Button
              onClick={analyzeImage}
              disabled={isAnalyzing || !selectedFile}
              className="w-full bg-emerald-700 hover:bg-emerald-800 sm:w-auto"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Analyze Leaf
                </>
              )}
            </Button>

            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          <div className="space-y-3">
            <Label>Preview</Label>
            {previewUrl ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                <Image src={previewUrl} alt="Leaf preview" fill unoptimized className="object-cover" />
              </div>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
                Upload an image to preview
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: use bright natural light and keep one leaf centered in the photo.
            </p>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-border/70 bg-white/85">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="mr-2">Scan Result</CardTitle>
              <Badge className={cn("border", riskStyle[result.riskLevel] || riskStyle.unknown)}>
                {toReadableRisk(result.riskLevel)}
              </Badge>
              {result.isHealthy === true && (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Plant marked healthy
                </Badge>
              )}
              {result.isHealthy === false && (
                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                  Attention needed
                </Badge>
              )}
            </div>
            <CardDescription>
              {result.healthProbabilityPct !== null
                ? `Health confidence: ${result.healthProbabilityPct.toFixed(1)}%`
                : "No direct health score returned by provider."}
              {result.requestId ? ` · Request ID: ${result.requestId}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {result.findings.length > 0 ? (
                result.findings.slice(0, 4).map((finding) => (
                  <div key={`${finding.name}-${finding.probabilityPct}`} className="rounded-lg border border-border/60 bg-white/80 p-3">
                    <p className="text-sm font-semibold">{finding.name}</p>
                    <p className="text-xs text-muted-foreground">{finding.probabilityPct.toFixed(1)}% confidence</p>
                    {finding.description && <p className="mt-2 text-sm text-foreground/90">{finding.description}</p>}
                    {finding.treatment.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                        {finding.treatment.slice(0, 3).map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-border/60 bg-white/80 p-4 text-sm text-muted-foreground md:col-span-2">
                  No disease suggestions returned. Try a clearer close-up and analyze again.
                </div>
              )}
            </div>

            {result.recommendations.length > 0 && (
              <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 p-4">
                <p className="text-sm font-semibold text-emerald-900">Recommended next actions</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-emerald-900/90">
                  {result.recommendations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This scan supports field triage. Confirm treatment decisions with agronomy advice before chemical application.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
