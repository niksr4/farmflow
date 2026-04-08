"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Clock, Info, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { appendOwnerPreviewContext, normalizeOwnerPreviewContext } from "@/lib/owner-preview"
import { cn } from "@/lib/utils"

export type OnboardingStep = {
  key: string
  title: string
  description: string
  done: boolean
  actionLabel: string
  onAction: () => void
}

type OnboardingChecklistProps = {
  isVisible: boolean
  isLoading: boolean
  error?: string | null
  completedCount: number
  totalCount: number
  steps: OnboardingStep[]
  canManageEstateDefaults: boolean
  estateName: string
  bagWeightKg: string
  onEstateNameChange: (value: string) => void
  onBagWeightKgChange: (value: string) => void
  onSaveEstateDefaults: () => void
  isSavingEstateDefaults: boolean
  canCreateLocation: boolean
  locationName: string
  locationCode: string
  onLocationNameChange: (value: string) => void
  onLocationCodeChange: (value: string) => void
  onCreateLocation: () => void
  isCreatingLocation: boolean
  onRefresh: () => void
  isExpanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export default function OnboardingChecklist({
  isVisible,
  isLoading,
  error,
  completedCount,
  totalCount,
  steps,
  canManageEstateDefaults,
  estateName,
  bagWeightKg,
  onEstateNameChange,
  onBagWeightKgChange,
  onSaveEstateDefaults,
  isSavingEstateDefaults,
  canCreateLocation,
  locationName,
  locationCode,
  onLocationNameChange,
  onLocationCodeChange,
  onCreateLocation,
  isCreatingLocation,
  onRefresh,
  isExpanded,
  onExpandedChange,
}: OnboardingChecklistProps) {
  const searchParams = useSearchParams()
  const previewContext = useMemo(
    () =>
      normalizeOwnerPreviewContext({
        previewTenantId: searchParams.get("previewTenantId"),
        previewRole: searchParams.get("previewRole"),
        previewTenantName: searchParams.get("previewTenantName"),
      }),
    [searchParams],
  )
  const manualsHref = useMemo(() => appendOwnerPreviewContext("/manuals", previewContext), [previewContext])

  if (!isVisible) return null

  const nextPendingStep = steps.find((step) => !step.done) || null
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100
  const setupStateLabel = progressPct >= 100 ? "Ready" : nextPendingStep ? "In progress" : "Setup"

  return (
    <Card className="overflow-hidden border border-emerald-100/80 bg-[linear-gradient(180deg,#f7fdf9_0%,#ffffff_58%)] shadow-[0_18px_60px_-42px_rgba(14,93,82,0.35)]">
      <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
        <CardHeader className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="w-fit border-emerald-200 bg-white text-emerald-700">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Launch checklist
              </Badge>
              <CardTitle>Estate Launch Checklist</CardTitle>
              <CardDescription>Complete these steps to unlock traceability and season reporting.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                {completedCount}/{totalCount} complete
              </Badge>
              <Button variant="outline" size="sm" asChild className="bg-white">
                <Link href={manualsHref}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Open manuals
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="bg-transparent"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  {isExpanded ? "Collapse" : "Expand"}
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.25fr_0.85fr]">
            <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-emerald-700">
                <span>Launch progress</span>
                <span>{progressPct}% ready</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-50/80">
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {nextPendingStep
                  ? `Do this next: ${nextPendingStep.title}.`
                  : "Core setup is complete. Your estate is ready for live records."}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Setup flow
              </div>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Keep the first pass short: estate defaults, one location, then the first live record.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700">
                <span className={cn("h-2 w-2 rounded-full", progressPct >= 100 ? "bg-emerald-500" : "bg-amber-500")} />
                {setupStateLabel}
              </div>
            </div>
          </div>
          {!isExpanded && nextPendingStep && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/85 px-4 py-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    <Clock className="h-3.5 w-3.5" />
                    Do this next
                  </div>
                  <p className="text-sm font-semibold text-amber-950">{nextPendingStep.title}</p>
                  <p className="text-xs leading-relaxed text-amber-900">{nextPendingStep.description}</p>
                  <p className="text-xs leading-relaxed text-amber-800">
                    Keep the first pass simple. One honest live record is enough to move forward. If you get stuck, ask FarmFlow from the bottom-right corner.
                  </p>
                </div>
                <Button size="sm" onClick={nextPendingStep.onAction} className="bg-amber-700 text-white hover:bg-amber-800">
                  <span className="inline-flex items-center gap-2">
                    {nextPendingStep.actionLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 px-5 pb-5 pt-0 sm:px-6">
            {canManageEstateDefaults && (
              <div className="space-y-4 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Confirm estate defaults</p>
                  <p className="text-xs text-muted-foreground">
                    Set the estate name and standard bag weight your team uses before daily records begin.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1.3fr_0.8fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-estate-name">Estate name</Label>
                    <Input
                      id="onboarding-estate-name"
                      placeholder="Estate or cooperative name"
                      value={estateName}
                      onChange={(event) => onEstateNameChange(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-bag-weight">Standard bag weight (kg)</Label>
                    <Input
                      id="onboarding-bag-weight"
                      type="number"
                      min={40}
                      max={70}
                      step={1}
                      placeholder="50"
                      value={bagWeightKg}
                      onChange={(event) => onBagWeightKgChange(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={onSaveEstateDefaults} disabled={isSavingEstateDefaults} className="w-full bg-emerald-700 hover:bg-emerald-800">
                      {isSavingEstateDefaults ? "Saving..." : "Save Defaults"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Bag weight drives bag-to-kg math across processing, dispatch, sales, and exports.
                </p>
              </div>
            )}

            <div className="grid gap-3">
              {steps.map((step) => {
                const isNextStep = !step.done && nextPendingStep?.key === step.key
                return (
                <div
                  key={step.key}
                  className={cn(
                    "rounded-2xl border p-4 shadow-sm transition-colors",
                    step.done
                      ? "border-emerald-200 bg-emerald-50/70"
                      : isNextStep
                        ? "border-amber-200 bg-amber-50/80"
                        : "border-stone-200 bg-white/90",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border",
                          step.done
                            ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                            : isNextStep
                              ? "border-amber-200 bg-amber-100 text-amber-700"
                              : "border-stone-200 bg-white text-stone-500",
                        )}
                      >
                        {step.done ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{step.title}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px] uppercase tracking-[0.18em]",
                              step.done
                                ? "border-emerald-200 bg-white text-emerald-700"
                                : isNextStep
                                  ? "border-amber-200 bg-white text-amber-700"
                                  : "border-stone-200 bg-white text-stone-600",
                            )}
                          >
                            {step.done ? "Done" : isNextStep ? "Next" : "Pending"}
                          </Badge>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                    {!step.done && (
                      <Button variant="outline" size="sm" onClick={step.onAction} className="w-full bg-white sm:w-auto">
                        <span className="inline-flex items-center gap-2">
                          {step.actionLabel}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )})}
            </div>

            {!steps.find((step) => step.key === "locations")?.done && canCreateLocation && (
              <div className="space-y-4 rounded-2xl border border-stone-200 bg-white/90 p-4 shadow-sm">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Add your first location</p>
                  <p className="text-xs text-muted-foreground">
                    Locations unlock processing, dispatch, and season reporting.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="onboarding-location-name">Location name</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Location name help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:text-stone-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                          </TooltipTrigger>
                          <TooltipContent>Use the same names your team uses at each location.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="onboarding-location-name"
                      placeholder="Main Estate, Block A, Wet Mill"
                      value={locationName}
                      onChange={(event) => onLocationNameChange(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="onboarding-location-code">Location code (optional)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Location code help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:text-stone-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                          </TooltipTrigger>
                          <TooltipContent>Short codes show up in export files and buyer reports.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="onboarding-location-code"
                      placeholder="MAIN-A"
                      value={locationCode}
                      onChange={(event) => onLocationCodeChange(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={onCreateLocation}
                      disabled={isCreatingLocation}
                      className="w-full bg-emerald-700 hover:bg-emerald-800"
                    >
                      {isCreatingLocation ? "Adding..." : "Add Location"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Keep names consistent with estate signage so traceability reports stay clean.
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
