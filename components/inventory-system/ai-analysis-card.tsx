"use client"

import React from "react"
import { Brain } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import SimpleMarkdown from "@/components/ui/simple-markdown"

type Props = {
  isAnalyzing: boolean
  error: string | null
  analysis: string | null
  onGenerate: () => void
}

export default function AiAnalysisCard({ isAnalyzing, error, analysis, onGenerate }: Props) {
  return (
    <Card className="border-border/70 bg-white/85">
      <CardHeader className="gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-emerald-700" />
            AI Inventory Analysis
          </CardTitle>
          <CardDescription>
            Run a broader one-shot review when you want a longer narrative on inventory, processing, costs, and season patterns.
          </CardDescription>
        </div>
        <Button onClick={onGenerate} disabled={isAnalyzing} className="bg-emerald-700 hover:bg-emerald-800">
          {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {analysis ? (
          <div className="max-h-[28rem] overflow-y-auto">
            <SimpleMarkdown content={analysis} className="text-foreground" />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Run the AI analysis to see a longer recommendation set grounded in the current fiscal year data.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
