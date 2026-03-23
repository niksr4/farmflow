"use client"

import { Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { AlertThresholds } from "@/hooks/use-tenant-settings"

type ThresholdField = keyof AlertThresholds
type TargetField = keyof NonNullable<AlertThresholds["targets"]>

type ThresholdsSectionProps = {
  thresholdDraft: AlertThresholds | null
  isSavingThresholds: boolean
  settingsLoading: boolean
  onThresholdFieldChange: (field: ThresholdField, value: string) => void
  onTargetFieldChange: (field: TargetField, value: string) => void
  onSaveThresholds: () => void
}

type HelpLabelProps = {
  htmlFor: string
  label: string
  help: string
}

function HelpLabel({ htmlFor, label, help }: HelpLabelProps) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label} help`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

export function ThresholdsSection({
  thresholdDraft,
  isSavingThresholds,
  settingsLoading,
  onThresholdFieldChange,
  onTargetFieldChange,
  onSaveThresholds,
}: ThresholdsSectionProps) {
  return (
    <Card id="thresholds" className="scroll-mt-24 overflow-hidden border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Exception Thresholds & Targets</CardTitle>
        <CardDescription>
          Control how the weekly exception engine flags issues and set optional KPI targets for benchmarking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!thresholdDraft ? (
          <div className="text-sm text-muted-foreground">Loading thresholds...</div>
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Most estates leave these close to default.</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Thresholds are meant to catch weekly exceptions after the estate is already live, not to be tuned every day.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 shadow-sm">
                <p className="text-sm font-semibold text-amber-950">Change them only when the alert pattern is clearly wrong.</p>
                <p className="mt-1 text-sm leading-6 text-amber-900/80">
                  A good time to revisit these is after a few weeks of live data, when you can see which alerts are too noisy or too loose.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Weekly exception rules</p>
                  <p className="text-xs text-muted-foreground">These settings decide when the system should flag something unusual.</p>
                </div>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  Rarely edited
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="threshold-float"
                    label="Float rate increase (ratio)"
                    help="Flags records when float rate jumps vs last week."
                  />
                  <Input
                    id="threshold-float"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.floatRateIncreasePct}
                    onChange={(event) => onThresholdFieldChange("floatRateIncreasePct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.15 = 15% above last week.</p>
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="threshold-yield"
                    label="Dry parch yield drop (ratio)"
                    help="Flags when dry-parch yield falls below last week."
                  />
                  <Input
                    id="threshold-yield"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.yieldDropPct}
                    onChange={(event) => onThresholdFieldChange("yieldDropPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.12 = 12% below last week.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="threshold-loss-abs">Transit loss spike (absolute)</Label>
                  <Input
                    id="threshold-loss-abs"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.lossSpikeAbsPct}
                    onChange={(event) => onThresholdFieldChange("lossSpikeAbsPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.02 = +2 percentage points.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="threshold-loss-rel">Transit loss spike (relative)</Label>
                  <Input
                    id="threshold-loss-rel"
                    type="number"
                    step="0.1"
                    value={thresholdDraft.lossSpikeRelPct}
                    onChange={(event) => onThresholdFieldChange("lossSpikeRelPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.5 = 50% above last week.</p>
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="threshold-mismatch"
                    label="Inventory mismatch buffer (KGs)"
                    help="Allowed gap between stock and transaction totals."
                  />
                  <Input
                    id="threshold-mismatch"
                    type="number"
                    step="1"
                    value={thresholdDraft.mismatchBufferKgs}
                    onChange={(event) => onThresholdFieldChange("mismatchBufferKgs", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="threshold-dispatch"
                    label="Dispatch unconfirmed days"
                    help="Days before a shipment is flagged as unconfirmed."
                  />
                  <Input
                    id="threshold-dispatch"
                    type="number"
                    step="1"
                    value={thresholdDraft.dispatchUnconfirmedDays}
                    onChange={(event) => onThresholdFieldChange("dispatchUnconfirmedDays", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="threshold-bagweight"
                    label="Bag weight drift (ratio)"
                    help="Flags when recorded bag weights deviate from standard."
                  />
                  <Input
                    id="threshold-bagweight"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.bagWeightDriftPct}
                    onChange={(event) => onThresholdFieldChange("bagWeightDriftPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.05 = 5% drift.</p>
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="threshold-minkgs"
                    label="Minimum KGs for signal"
                    help="Ignore tiny volumes to avoid noisy alerts."
                  />
                  <Input
                    id="threshold-minkgs"
                    type="number"
                    step="1"
                    value={thresholdDraft.minKgsForSignal}
                    onChange={(event) => onThresholdFieldChange("minKgsForSignal", event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/40 p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Season Targets (optional)</div>
                  <p className="text-xs text-emerald-900/75">Use these only when you want a benchmark to compare the season against.</p>
                </div>
                <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                  Benchmark only
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="target-yield"
                    label="Target dry parch yield from ripe"
                    help="Benchmark for seasonal yield performance."
                  />
                  <Input
                    id="target-yield"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.targets?.dryParchYieldFromRipe ?? ""}
                    onChange={(event) => onTargetFieldChange("dryParchYieldFromRipe", event.target.value)}
                    placeholder="0.46"
                  />
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="target-loss"
                    label="Target transit loss %"
                    help="Expected transit shrinkage for buyer reconciliation."
                  />
                  <Input
                    id="target-loss"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.targets?.lossPct ?? ""}
                    onChange={(event) => onTargetFieldChange("lossPct", event.target.value)}
                    placeholder="0.03"
                  />
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="target-price"
                    label="Target avg price/kg (INR)"
                    help="Benchmark for premium pricing per kg."
                  />
                  <Input
                    id="target-price"
                    type="number"
                    step="1"
                    value={thresholdDraft.targets?.avgPricePerKg ?? ""}
                    onChange={(event) => onTargetFieldChange("avgPricePerKg", event.target.value)}
                    placeholder="200"
                  />
                </div>

                <div className="space-y-2">
                  <HelpLabel
                    htmlFor="target-float"
                    label="Target float rate"
                    help="Expected float rate for quality grading."
                  />
                  <Input
                    id="target-float"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.targets?.floatRate ?? ""}
                    onChange={(event) => onTargetFieldChange("floatRate", event.target.value)}
                    placeholder="0.04"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={onSaveThresholds} disabled={isSavingThresholds || settingsLoading}>
                {isSavingThresholds ? "Saving..." : "Save Thresholds"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
