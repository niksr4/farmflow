"use client"

import { Check, ChevronDown, ChevronUp, Clock, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  if (!isVisible) return null

  const nextPendingStep = steps.find((step) => !step.done) || null

  return (
    <Card className="border-2 border-emerald-100 bg-emerald-50/40">
      <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Estate Launch Checklist</CardTitle>
              <CardDescription>Complete these steps to unlock traceability and season reporting.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                {completedCount}/{totalCount} complete
              </Badge>
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
          {!isExpanded && nextPendingStep && (
            <p className="text-xs text-muted-foreground">
              Next step: <span className="font-medium text-foreground">{nextPendingStep.title}</span>
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {canManageEstateDefaults && (
              <div className="space-y-3 rounded-lg border bg-white/80 p-4">
                <div>
                  <p className="text-sm font-medium">Confirm estate defaults</p>
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
                    <Button onClick={onSaveEstateDefaults} disabled={isSavingEstateDefaults} className="w-full bg-green-700 hover:bg-green-800">
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
              {steps.map((step) => (
                <div
                  key={step.key}
                  className="flex flex-col gap-3 rounded-lg border bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border",
                        step.done
                          ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-500",
                      )}
                    >
                      {step.done ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                  {!step.done && (
                    <Button variant="outline" size="sm" onClick={step.onAction} className="bg-transparent">
                      {step.actionLabel}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!steps.find((step) => step.key === "locations")?.done && canCreateLocation && (
              <div className="space-y-3 rounded-lg border bg-white/80 p-4">
                <div>
                  <p className="text-sm font-medium">Add your first location</p>
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
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
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
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
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
                      className="w-full bg-green-700 hover:bg-green-800"
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
