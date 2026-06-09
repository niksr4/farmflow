"use client"

import React from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import SimpleMarkdown from "@/components/ui/simple-markdown"

type Severity = "good" | "warning" | "info"

type Insight = {
  text: string
  severity: Severity
}

type Props = {
  loading: boolean
  error: string | null
  insights: Insight[] | null
}

export default function SmartInsightsCard({ loading, error, insights }: Props) {
  return (
    <Card className="border-black/5 bg-white/90">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Smart Insights</CardTitle>
          <CardDescription>What the data is telling you right now — without you having to ask.</CardDescription>
        </div>
        <Badge variant="outline" className="w-fit border-violet-200 bg-violet-50 text-violet-700">
          AI
        </Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading your data...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
            <p className="font-medium">Insights temporarily unavailable.</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : insights && insights.length > 0 ? (
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3",
                  insight.severity === "warning"
                    ? "border-amber-200 bg-amber-50/60"
                    : insight.severity === "good"
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-black/5 bg-white",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                    insight.severity === "warning"
                      ? "bg-amber-500"
                      : insight.severity === "good"
                        ? "bg-emerald-500"
                        : "bg-stone-400",
                  )}
                />
                <SimpleMarkdown content={insight.text} className="text-stone-800" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            All quiet — no anomalies or urgent signals detected right now.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
