"use client"

import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// These are loaded as dynamic imports in the parent; passed as components here to keep this file bundle-safe
type CropComponent = React.ComponentType<{ showDataToolsControls?: boolean }>

type ProcessingView = "coffee" | "pepper" | "rubber"

type Props = {
  canShowProcessing: boolean
  canShowPepper: boolean
  canShowRubber: boolean
  resolvedView: ProcessingView
  showDataToolsControls: boolean
  onViewChange: (view: ProcessingView) => void
  ProcessingTab: CropComponent
  PepperTab: CropComponent
  RubberTab: CropComponent
}

const VIEW_LABEL: Record<ProcessingView, string> = {
  coffee: "Coffee Pulping",
  pepper: "Pepper Processing",
  rubber: "Rubber Tapping",
}

const VIEW_DESCRIPTION: Record<ProcessingView, string> = {
  coffee: "Cherry intake, pulping, parchment, dry cherry, and daily output.",
  pepper: "Pepper picking, green-to-dry conversion, and location-wise pepper yield.",
  rubber: "Daily latex collection, coagulation, sheet production, and RSS grading.",
}

export default function ProcessingWorkspace({
  canShowProcessing,
  canShowPepper,
  canShowRubber,
  resolvedView,
  showDataToolsControls,
  onViewChange,
  ProcessingTab,
  PepperTab,
  RubberTab,
}: Props) {
  const activeCropTabs = [
    canShowProcessing && "coffee",
    canShowPepper && "pepper",
    canShowRubber && "rubber",
  ].filter(Boolean) as ProcessingView[]

  if (activeCropTabs.length === 1) {
    if (activeCropTabs[0] === "pepper") return <PepperTab />
    if (activeCropTabs[0] === "rubber") return <RubberTab />
    return <ProcessingTab showDataToolsControls={showDataToolsControls} />
  }

  return (
    <Tabs
      value={resolvedView}
      onValueChange={(value) => onViewChange(value as ProcessingView)}
      className="space-y-6"
    >
      <Card className="border-border/70 bg-white/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Post-Harvest Workspace</CardTitle>
          <CardDescription>
            Switch between crops in one workspace to keep records clean.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current View</p>
              <p className="text-2xl font-semibold text-foreground">{VIEW_LABEL[resolvedView]}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Use This For</p>
              <p className="text-sm font-semibold text-foreground">{VIEW_DESCRIPTION[resolvedView]}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Crop Flow</p>
            <TabsList
              className={`mt-3 grid w-full rounded-xl border border-border/60 bg-white p-1 shadow-none grid-cols-${activeCropTabs.length}`}
            >
              {activeCropTabs.includes("coffee") && (
                <TabsTrigger value="coffee" className="min-h-10 rounded-lg">Coffee</TabsTrigger>
              )}
              {activeCropTabs.includes("pepper") && (
                <TabsTrigger value="pepper" className="min-h-10 rounded-lg">Pepper</TabsTrigger>
              )}
              {activeCropTabs.includes("rubber") && (
                <TabsTrigger value="rubber" className="min-h-10 rounded-lg">Rubber</TabsTrigger>
              )}
            </TabsList>
            <p className="mt-3 text-xs text-muted-foreground">Switch between crops here when needed.</p>
          </div>
        </CardContent>
      </Card>

      {activeCropTabs.includes("coffee") && (
        <TabsContent value="coffee" className="space-y-6">
          <ProcessingTab showDataToolsControls={showDataToolsControls} />
        </TabsContent>
      )}
      {activeCropTabs.includes("pepper") && (
        <TabsContent value="pepper" className="space-y-6">
          <PepperTab />
        </TabsContent>
      )}
      {activeCropTabs.includes("rubber") && (
        <TabsContent value="rubber" className="space-y-6">
          <RubberTab />
        </TabsContent>
      )}
    </Tabs>
  )
}
