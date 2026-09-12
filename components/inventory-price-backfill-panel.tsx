"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/format"
import { LOCATION_UNASSIGNED } from "@/components/inventory-system/constants"

/**
 * "Some restocks have no price" — the panel that fixes it, inside the item edit dialog.
 *
 * WHY IT SITS HERE. The estate only finds out an average is wrong by looking at the item, and the
 * item edit dialog is where they look. Putting the fix behind a separate screen means knowing to
 * go there, which means knowing the problem has a name.
 *
 * IT RENDERS NOTHING when the item has no unpriced restocks — which is most items, most of the
 * time. A permanently-visible control for a rare repair teaches people to ignore that part of the
 * dialog, and then they ignore it on the day it matters.
 *
 * Self-contained on purpose: it fetches its own preview and posts its own change, so wiring it in
 * costs the 5,000-line shell one prop rather than six pieces of state. See
 * lib/inventory-price-backfill.ts for why this fills only the unpriced rows.
 */

type Balance = { quantity: number; totalCost: number; avgPrice: number }

type Preview = {
  rowCount: number
  quantity: number
  pricedPurchaseCount: number
  suggestedRate: number | null
  preview: { rowCount: number; quantity: number; costAdded: number; before: Balance; after: Balance } | null
}

export default function InventoryPriceBackfillPanel({
  itemType,
  locationId,
  unit,
  onApplied,
}: {
  itemType: string
  locationId: string
  unit: string
  onApplied?: () => void
}) {
  const [state, setState] = useState<Preview | null>(null)
  const [rate, setRate] = useState("")
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const locationParam = locationId === LOCATION_UNASSIGNED ? "" : locationId
  const typedRate = Number(rate)
  const rateIsUsable = Number.isFinite(typedRate) && typedRate > 0

  // Read, so it is abortable: switching items in the dialog must cancel the previous slot's
  // fetch rather than let it land and describe the wrong item. Mutations below are not aborted.
  useEffect(() => {
    if (!itemType) return
    const controller = new AbortController()
    const query = new URLSearchParams({ itemType, locationId: locationParam })
    if (rateIsUsable) query.set("rate", String(typedRate))

    fetch(`/api/inventory-price-backfill?${query}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (controller.signal.aborted) return
        if (!data?.success) return setState(null)
        setState(data)
        // Offer the suggestion once, and never overwrite what the estate has typed over it.
        setRate((current) => (current === "" && data.suggestedRate ? String(data.suggestedRate) : current))
      })
      .catch(() => {
        if (!controller.signal.aborted) setState(null)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-previews on rate, not on every keystroke's identity
  }, [itemType, locationParam, rateIsUsable ? typedRate : 0])

  if (!state || state.rowCount === 0) return null

  const apply = async () => {
    setApplying(true)
    setError(null)
    try {
      const response = await fetch("/api/inventory-price-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, locationId: locationParam, rate: typedRate }),
      })
      const data = await response.json()
      if (!response.ok || !data?.success) {
        setError(data?.message || "Could not price these restocks.")
        return
      }
      setDone(
        `Priced ${data.rowsUpdated} restock${data.rowsUpdated === 1 ? "" : "s"} — ` +
          `average is now ${formatCurrency(data.after?.avgPrice ?? 0)} per ${unit || "unit"}.`,
      )
      onApplied?.()
    } catch {
      setError("Could not price these restocks.")
    } finally {
      setApplying(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">{done}</div>
    )
  }

  const after = state.preview?.after

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {state.rowCount} restock{state.rowCount === 1 ? "" : "s"} went in without a price
        </p>
        <p className="text-xs text-muted-foreground">
          {/* The quantity is the persuasive number, not the row count — "13 rows" is abstract and
              "489 L" is the diesel in the shed. */}
          That is {state.quantity} {unit || "units"} the ledger is carrying at nothing, which drags the
          average down for everything taken out since. Put a rate on those and the rest stay as they are.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="backfill-rate" className="text-xs">
            Price per {unit || "unit"}
          </Label>
          <Input
            id="backfill-rate"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="w-36"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
          />
        </div>
        <Button size="sm" onClick={apply} disabled={!rateIsUsable || applying}>
          {applying ? "Pricing…" : `Price ${state.rowCount} restock${state.rowCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {state.suggestedRate
          ? `Suggested from the ${state.pricedPurchaseCount} purchase${state.pricedPurchaseCount === 1 ? "" : "s"} of this item that do have a price. Change it if you know better.`
          : "This item has never been bought at a recorded price, so there is nothing to suggest — type what it cost."}
      </p>

      {after && state.preview ? (
        <p className="text-xs">
          {/* Quantity is stated explicitly BECAUSE it does not change. The fear this answers is
              "will this move my stock count", and the answer has to be visible before they click. */}
          Average goes from <strong>{formatCurrency(state.preview.before.avgPrice)}</strong> to{" "}
          <strong>{formatCurrency(after.avgPrice)}</strong> per {unit || "unit"}. Stock stays at{" "}
          {after.quantity} {unit || "units"} — only what it cost changes.
        </p>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
