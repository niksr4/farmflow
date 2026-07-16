"use client"

import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"

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
      {/* Compact crop switcher — the entry form is the point of this tab, not the chrome */}
      <Card className="border-border/70 bg-white/90">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <TabsList
            className={`grid w-full rounded-xl border border-border/60 bg-white p-1 shadow-none sm:w-auto sm:min-w-[280px] ${
              activeCropTabs.length === 3 ? "grid-cols-3" : "grid-cols-2"
            }`}
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
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{VIEW_LABEL[resolvedView]}</span>
            {" — "}
            {VIEW_DESCRIPTION[resolvedView]}
          </p>
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
