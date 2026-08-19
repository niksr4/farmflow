"use client"

import React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  estate: string
  onShowAll: () => void
  /** Spend carrying no block at all, which therefore appears under every estate. */
  unattributed?: { amount: number; percent: number; rows: number } | null
}

// Mounted once in the shared shell above <Tabs> (see inventory-system.tsx), so it stays visible
// across every tab switch -- the header selector pill alone isn't sticky and scrolls out of view
// immediately, which is exactly how a silently-active filter on financial/record data goes
// unnoticed. Modeled on PreviewModeBanner: non-dismissible while the filter is active, since
// this is an ongoing view state (not a one-time notice) -- the way to end it is to actually
// clear the filter, same as "Exit preview" there.
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

export default function EstateFilterBanner({ estate, onShowAll, unattributed }: Props) {
  // Quantified, not just mentioned. "Records with no estate still show up" is true and useless;
  // "₹50,34,000 of what you are looking at is not assigned to any estate" is the same fact in a
  // form an owner can act on. HoneyFarm carry 48% of labour and 30% of expenses with no block, so
  // selecting MV shows MV's few records plus most of everyone else's -- a figure that reads as
  // MV's cost and mostly is not. Silence there is worse than no filter, because it looks like it
  // worked.
  const material = unattributed && unattributed.amount > 0
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/70">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Showing {estate} only</CardTitle>
          <CardDescription>
            {material ? (
              <>
                Every tab is filtered to this estate — but{" "}
                <strong className="font-semibold text-amber-900">
                  {inr(unattributed!.amount)} ({unattributed!.percent}%)
                </strong>{" "}
                of your spend has no block on it, so it shows under every estate including this
                one. Put a block on those {unattributed!.rows} entries and this figure becomes {estate}
                &apos;s alone.
              </>
            ) : (
              <>Every tab is filtered to this estate. Records with no estate assigned still show up either way.</>
            )}
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
