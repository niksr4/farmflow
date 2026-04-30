"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Leaf, Package, Clock, Award, MapPin, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type LotData = {
  lotId: string
  estateName: string
  cropFamily: string
  coffeeType: string
  locationName: string | null
  processDateStart: string
  processDateEnd: string
  processingDays: number
  totalCherryKg: number
  totalDryParchKg: number
  totalDryCherryKg: number
  cherryToDryParchPct: number | null
  moisturePct: number | null
  qualityGrade: string | null
  certifications: Array<{ name: string; validUntil: string | null }>
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export default function LotTracePage({ lotId }: { lotId: string }) {
  const [data, setData] = useState<LotData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/lots/${encodeURIComponent(lotId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error || "Lot not found")
        setData(d.lot)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [lotId])

  const traceUrl = typeof window !== "undefined" ? window.location.href : ""

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(traceUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-emerald-50 to-white px-4 text-center">
        <Package className="h-12 w-12 text-gray-300" />
        <h1 className="text-xl font-semibold text-gray-700">Lot not found</h1>
        <p className="text-sm text-gray-500">
          Lot <code className="rounded bg-gray-100 px-1 font-mono">{lotId}</code> could not be found.
        </p>
        <p className="text-xs text-gray-400">
          This may be an invalid QR code or the lot has not been processed yet.
        </p>
      </div>
    )
  }

  const totalOutputKg = data.totalDryParchKg + data.totalDryCherryKg

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50">
      {/* Header */}
      <div className="bg-emerald-700 px-4 py-6 text-white">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-emerald-300" />
            <span className="text-sm font-medium text-emerald-200">FarmFlow Traceability</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold">{data.estateName}</h1>
          <p className="mt-0.5 text-sm text-emerald-200">
            {data.coffeeType && `${data.coffeeType} · `}
            {data.cropFamily.charAt(0).toUpperCase() + data.cropFamily.slice(1)}
          </p>
          {data.locationName && (
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-300">
              <MapPin className="h-3 w-3" />
              {data.locationName}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <code className="rounded-lg bg-emerald-800/60 px-3 py-1.5 font-mono text-sm text-emerald-100">
              LOT: {data.lotId}
            </code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg bg-emerald-800/40 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-800/60 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* Processing timeline */}
        <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Clock className="h-4 w-4 text-emerald-600" />
            Processing Period
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-500">Start</p>
              <p className="font-semibold text-gray-800">{data.processDateStart}</p>
            </div>
            <div className="flex-1 border-t-2 border-dashed border-emerald-200" />
            <div className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {data.processingDays}d
            </div>
            <div className="flex-1 border-t-2 border-dashed border-emerald-200" />
            <div className="text-center">
              <p className="text-xs text-gray-500">End</p>
              <p className="font-semibold text-gray-800">{data.processDateEnd}</p>
            </div>
          </div>
        </div>

        {/* Yield stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Cherry Received"
            value={`${data.totalCherryKg.toLocaleString("en-IN")} kg`}
            sub="Raw cherry intake"
          />
          {data.totalDryParchKg > 0 && (
            <StatCard
              label="Dry Parchment"
              value={`${data.totalDryParchKg.toLocaleString("en-IN")} kg`}
              sub={data.cherryToDryParchPct != null ? `${data.cherryToDryParchPct}% yield` : undefined}
            />
          )}
          {data.totalDryCherryKg > 0 && (
            <StatCard
              label="Dry Cherry"
              value={`${data.totalDryCherryKg.toLocaleString("en-IN")} kg`}
            />
          )}
          {data.moisturePct != null && (
            <StatCard
              label="Moisture"
              value={`${data.moisturePct}%`}
              sub="Final moisture content"
            />
          )}
        </div>

        {/* Quality grade */}
        {data.qualityGrade && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <Award className="h-6 w-6 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-700">Quality Grade</p>
              <p className="text-lg font-bold text-amber-900">{data.qualityGrade}</p>
            </div>
          </div>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Certifications
            </p>
            <div className="space-y-2">
              {data.certifications.map((cert) => (
                <div key={cert.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-gray-700">{cert.name}</span>
                  </div>
                  {cert.validUntil && (
                    <span className="text-xs text-gray-400">valid until {cert.validUntil}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-4">
          <p>Verified by FarmFlow · thefarmflow.in</p>
          <p className="mt-1">This trace record is generated automatically from farm management data.</p>
        </div>
      </div>
    </div>
  )
}
