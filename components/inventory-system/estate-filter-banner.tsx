"use client"

import React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  estate: string
  onShowAll: () => void
}

// Mounted once in the shared shell above <Tabs> (see inventory-system.tsx), so it stays visible
// across every tab switch -- the header selector pill alone isn't sticky and scrolls out of view
// immediately, which is exactly how a silently-active filter on financial/record data goes
// unnoticed. Modeled on PreviewModeBanner: non-dismissible while the filter is active, since
// this is an ongoing view state (not a one-time notice) -- the way to end it is to actually
// clear the filter, same as "Exit preview" there.
export default function EstateFilterBanner({ estate, onShowAll }: Props) {
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/70">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Showing {estate} only</CardTitle>
          <CardDescription>
            Every tab is filtered to this estate. Records with no estate assigned still show up either way.
          </CardDescription>
        </div>
        <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
          Filtered
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
        <span>Switch back any time from the estate selector, or:</span>
        <Button size="sm" variant="outline" className="bg-white" onClick={onShowAll}>
          Show all estates
        </Button>
      </CardContent>
    </Card>
  )
}
