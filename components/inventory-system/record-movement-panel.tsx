"use client"

import { Check, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { LOCATION_UNASSIGNED, UNASSIGNED_LABEL_PICKER } from "@/components/inventory-system/constants"
import type { Transaction } from "@/lib/inventory-types"
import type { LocationOption } from "@/components/inventory-system/types"

type TransactionWriteFailureSnapshot = {
  message: string
  occurredAt: number
  locationId: string | null
  transaction: Transaction
}

type RecordMovementPanelProps = {
  // state
  newTransaction: Partial<Transaction> | null
  transactionLocationId: string
  lastTransactionWriteFailure: TransactionWriteFailureSnapshot | null
  hasMovementItemTypes: boolean
  allItemTypesForDropdown: string[]
  selectedMovementUnit: string
  locations: LocationOption[]
  canShowAccounts: boolean
  // handlers
  onClose: () => void
  onFieldChange: (field: keyof Transaction, value: unknown) => void
  onLocationChange: (locationId: string) => void
  onRecordTransaction: () => void
  onRetryTransaction: () => void
  onDismissFailure: () => void
  // utilities
  transactionDateToInputValue: (date: string | null | undefined) => string
  getTodayDateInputValue: () => string
  buildTransactionDateFromInput: (value: string) => string
  resolveInventoryUnitForItemType: (itemType: string, unit?: string) => string
  coerceNonNegativeNumber: (value: string) => number | "" | null
  preventNegativeKey: (event: React.KeyboardEvent<HTMLInputElement>) => void
  preventNumberScrollChange: (event: React.WheelEvent<HTMLInputElement>) => void
}

export default function RecordMovementPanel({
  newTransaction,
  transactionLocationId,
  lastTransactionWriteFailure,
  hasMovementItemTypes,
  allItemTypesForDropdown,
  selectedMovementUnit,
  locations,
  canShowAccounts,
  onClose,
  onFieldChange,
  onLocationChange,
  onRecordTransaction,
  onRetryTransaction,
  onDismissFailure,
  transactionDateToInputValue,
  getTodayDateInputValue,
  buildTransactionDateFromInput,
  resolveInventoryUnitForItemType,
  coerceNonNegativeNumber,
  preventNegativeKey,
  preventNumberScrollChange,
}: RecordMovementPanelProps) {
  return (
    <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_46%,#fafaf8_100%)] p-6 shadow-[0_24px_80px_-45px_rgba(14,93,82,0.35)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Record inventory movement</h3>
          <p className="text-xs text-neutral-500">
            Restock, deplete, or correct stock without leaving the inventory workspace.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">Audit trail</Badge>
        <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">Backdated entries</Badge>
        <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">Estate linked</Badge>
      </div>
      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
        Record restocks when stock arrives. Record depletions when stock is used, lost, or corrected.
      </div>
      <div className="mt-6 space-y-5">
        {lastTransactionWriteFailure && (
          <div
            data-testid="transaction-write-failure-banner"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm"
          >
            <p className="font-medium text-rose-900">Last transaction did not save</p>
            <p className="mt-1 text-xs text-rose-800">
              {lastTransactionWriteFailure.message}
              {lastTransactionWriteFailure.occurredAt > 0
                ? ` (at ${new Date(lastTransactionWriteFailure.occurredAt).toLocaleTimeString()})`
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="bg-white" onClick={onRetryTransaction}>
                Retry last transaction
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-700" onClick={onDismissFailure}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Item type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Item / crop</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Item type help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Select the crop or inventory item being adjusted.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select
            disabled={!hasMovementItemTypes}
            value={newTransaction?.item_type || ""}
            onValueChange={(value) => {
              onFieldChange("item_type", value)
              onFieldChange("unit", resolveInventoryUnitForItemType(value))
            }}
          >
            <SelectTrigger data-testid="movement-item-type-select" className="w-full h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
              <SelectValue placeholder={hasMovementItemTypes ? "Select item type" : "No items yet"} />
            </SelectTrigger>
            <SelectContent className="z-[70] max-h-[40vh] overflow-y-auto">
              {hasMovementItemTypes ? (
                allItemTypesForDropdown.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))
              ) : (
                <SelectItem value="__no_items" disabled>Add an inventory item first</SelectItem>
              )}
            </SelectContent>
          </Select>
          {!hasMovementItemTypes && (
            <p className="text-xs text-neutral-500">No inventory item types yet. Add an inventory item or restock first.</p>
          )}
          {newTransaction?.item_type && (
            <p className="text-xs text-neutral-500">
              Current inventory unit: <span className="font-medium text-neutral-700">{selectedMovementUnit}</span>
            </p>
          )}
        </div>

        {/* Location */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Estate block</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Location help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Tag by estate block for traceability and yield accuracy.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select value={transactionLocationId} onValueChange={onLocationChange}>
            <SelectTrigger className="w-full h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
              <SelectValue placeholder={locations.length ? "Select location" : "No locations yet"} />
            </SelectTrigger>
            <SelectContent className="z-[70] max-h-[40vh] overflow-y-auto">
              <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL_PICKER}</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name || loc.code || "Unnamed location"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-500">Tag transactions to a location for accurate inventory usage.</p>
        </div>

        {/* Date + Quantity */}
        <div className="grid gap-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-neutral-700">Movement Date</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Movement date help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Choose when the movement actually happened, including backfilled entries.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="date"
              value={transactionDateToInputValue(newTransaction?.transaction_date)}
              max={getTodayDateInputValue()}
              onChange={(e) => onFieldChange("transaction_date", buildTransactionDateFromInput(e.target.value))}
              className="h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
            />
            <p className="text-xs text-neutral-500">Defaults to today, but you can record movements from earlier dates.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-neutral-700">Quantity</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Quantity help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Enter the exact kg or unit amount for this movement.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="relative">
              <Input
                data-testid="movement-quantity-input"
                type="number"
                min={0}
                step="0.01"
                placeholder="Enter quantity"
                value={newTransaction?.quantity ?? ""}
                onKeyDown={preventNegativeKey}
                onWheel={preventNumberScrollChange}
                onChange={(e) => {
                  const next = coerceNonNegativeNumber(e.target.value)
                  if (next === null) return
                  onFieldChange("quantity", next)
                }}
                className="h-11 rounded-xl border-black/5 bg-white pr-12 focus-visible:ring-2 focus-visible:ring-emerald-200"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500 text-sm">
                {selectedMovementUnit}
              </div>
            </div>
          </div>
        </div>

        {/* Transaction type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Transaction Type</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Transaction type help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Restocking adds stock when goods arrive. Depleting records stock used, issued, lost, or corrected.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <RadioGroup
            value={newTransaction?.transaction_type === "restock" ? "Restocking" : "Depleting"}
            onValueChange={(value: "Depleting" | "Restocking") =>
              onFieldChange("transaction_type", value === "Restocking" ? "restock" : "deplete")
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <label
              htmlFor="restocking"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                newTransaction?.transaction_type === "restock"
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-black/5 bg-white hover:border-emerald-200 hover:bg-neutral-50",
              )}
            >
              <RadioGroupItem value="Restocking" id="restocking" className="mt-1 h-4 w-4" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-900">Restocking</p>
                <p className="text-xs leading-relaxed text-neutral-500">Goods received, replenishment, or transfers in.</p>
              </div>
            </label>
            <label
              htmlFor="depleting"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                newTransaction?.transaction_type !== "restock"
                  ? "border-amber-200 bg-amber-50/80"
                  : "border-black/5 bg-white hover:border-amber-200 hover:bg-neutral-50",
              )}
            >
              <RadioGroupItem value="Depleting" id="depleting" className="mt-1 h-4 w-4" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-900">Depleting</p>
                <p className="text-xs leading-relaxed text-neutral-500">Used, issued, lost, or corrected stock.</p>
              </div>
            </label>
          </RadioGroup>
          {newTransaction?.transaction_type !== "restock" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {canShowAccounts ? (
                <>
                  Use this when you only need stock tracking. If the same usage should also appear in Accounts and P&amp;L, record it in{" "}
                  <strong>Accounts → Other Expenses</strong> instead.
                </>
              ) : (
                "Use this for regular stock usage, losses, or corrections."
              )}
            </p>
          )}
        </div>

        {/* Price per unit — only meaningful for restocks; drives weighted average cost */}
        {newTransaction?.transaction_type === "restock" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-neutral-700">Unit Price</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Unit price help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[230px] text-xs leading-relaxed">
                    Enter the price you paid per unit for this batch. FarmFlow uses weighted average costing — each restock recalculates the average as total spend ÷ total quantity. Depletions are then valued at that running average, so a missing price here corrupts the cost basis going forward.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 60 for ₹60/kg"
              value={newTransaction?.price ?? ""}
              onKeyDown={preventNegativeKey}
              onWheel={preventNumberScrollChange}
              onChange={(e) => {
                const next = coerceNonNegativeNumber(e.target.value)
                if (next === null) return
                onFieldChange("price", next)
              }}
              className="h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
            />
            <p className="text-xs text-neutral-500">
              Required — restocking at ₹0 silently drags the average cost toward zero for every future depletion.
            </p>
          </div>
        )}

        {newTransaction?.transaction_type !== "restock" && (
          <p className="text-xs text-neutral-600 bg-neutral-50 border border-black/5 rounded-lg px-3 py-2">
            Depleted stock is valued at the <strong>weighted average cost</strong> on record — total spend divided by current quantity.
          </p>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Notes (Optional)</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Notes help" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Use notes for processing stage, buyer references, or extra context.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Textarea
            placeholder="Add any additional details"
            value={newTransaction?.notes ?? ""}
            onChange={(e) => onFieldChange("notes", e.target.value)}
            className="min-h-[110px] rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
          />
        </div>

        {newTransaction?.transaction_type === "restock" && !(Number(newTransaction?.price) > 0) && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Add the unit price above to save — restocks need a price greater than ₹0.
          </p>
        )}

        <Button
          type="button"
          data-testid="movement-record-transaction"
          onClick={onRecordTransaction}
          className="w-full h-11 text-base bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
        >
          <Check className="mr-2 h-5 w-5" /> Record movement
        </Button>
      </div>
    </div>
  )
}
