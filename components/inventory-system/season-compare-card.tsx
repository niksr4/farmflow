"use client"

import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type SeasonCompareCardProps = {
  loading: boolean
  narrative: string | null
  error: string | null
  fyLabels: { prev: string; curr: string } | null
}

export default function SeasonCompareCard({ loading, narrative, error, fyLabels }: SeasonCompareCardProps) {
  return (
    <Card className="border-black/5 bg-white/90">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Season Comparison</CardTitle>
          <CardDescription>
            {fyLabels
              ? `${fyLabels.prev} vs ${fyLabels.curr} — year-on-year view`
              : "Year-on-year season overview"}
          </CardDescription>
        </div>
        <Badge variant="outline" className="w-fit border-violet-200 bg-violet-50 text-violet-700">AI</Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Comparing seasons...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
            <p className="font-medium">Season comparison temporarily unavailable.</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : narrative ? (
          <p className="text-sm leading-relaxed text-neutral-700">{narrative}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
