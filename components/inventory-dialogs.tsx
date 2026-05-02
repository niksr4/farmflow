"use client"

/**
 * All four inventory modal dialogs extracted from inventory-system.tsx.
 * Each dialog is fully controlled — open state, form data, and handlers are passed as props.
 */

import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import { LOCATION_UNASSIGNED, UNASSIGNED_LABEL } from "@/components/inventory-system/constants"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import type { LocationOption } from "@/components/inventory-system/types"

// ── Shared types ─────────────────────────────────────────────────────────────

type NewItemForm = {
  name: string
  unit: string
  locationId: string
  quantity: string
  price: string
  notes: string
}

type InventoryEditForm = { name: string; unit: string; quantity: string }

type DialogProps = {
  isMobile: boolean
  locations: LocationOption[]
  preventNegativeKey: (e: React.KeyboardEvent<HTMLInputElement>) => void
  preventNumberScrollChange: (e: React.WheelEvent<HTMLInputElement>) => void
  coerceNonNegativeNumber: (v: string) => number | string | null

  // New item dialog
  isNewItemDialogOpen: boolean
  newItemForm: NewItemForm
  isSavingNewItem: boolean
  setIsNewItemDialogOpen: (open: boolean) => void
  setNewItemForm: React.Dispatch<React.SetStateAction<NewItemForm>>
  resetNewItemForm: () => void
  handleCreateNewItem: () => void

  // Edit transaction dialog
  isEditDialogOpen: boolean
  editingTransaction: Transaction | null
  isSavingTransactionEdit: boolean
  setIsEditDialogOpen: (open: boolean) => void
  setEditingTransaction: (tx: Transaction | null) => void
  handleEditTransactionChange: (field: keyof Transaction, value: unknown) => void
  handleUpdateTransaction: () => void
  handleDeleteConfirm: () => void

  // Inventory edit dialog
  isInventoryEditDialogOpen: boolean
  editingInventoryItem: InventoryItem | null
  inventoryEditForm: InventoryEditForm
  isSavingInventoryEdit: boolean
  inventoryEditLocationId: string
  setIsInventoryEditDialogOpen: (open: boolean) => void
  setEditingInventoryItem: (item: InventoryItem | null) => void
  setInventoryEditForm: React.Dispatch<React.SetStateAction<InventoryEditForm>>
  setInventoryEditLocationId: (id: string) => void
  handleSaveInventoryEdit: () => void

  // Delete confirm dialog
  deleteConfirmDialogOpen: boolean
  setDeleteConfirmDialogOpen: (open: boolean) => void
  setTransactionToDelete: (id: number | null) => void
  handleDeleteTransaction: () => void
}

// Shared overlay wrapper
function DialogOverlay({
  isMobile,
  onClickOutside,
  maxWidth = "max-w-xl",
  children,
}: {
  isMobile: boolean
  onClickOutside: () => void
  maxWidth?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/40",
        isMobile ? "flex items-end justify-center p-0" : "flex items-center justify-center p-4",
      )}
      onClick={onClickOutside}
    >
      <div
        className={cn(
          "w-full bg-white shadow-xl",
          isMobile
            ? "max-h-[92vh] rounded-t-2xl overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
            : `${maxWidth} rounded-lg p-6`,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// Reusable tooltip-label combo
function FieldLabel({ htmlFor, label, tooltip }: { htmlFor: string; label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label} help`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function InventoryDialogs(p: DialogProps) {
  const { isMobile, locations } = p

  return (
    <>
      {/* ── New inventory item ── */}
      {p.isNewItemDialogOpen && (
        <DialogOverlay
          isMobile={isMobile}
          onClickOutside={() => { p.setIsNewItemDialogOpen(false); p.resetNewItemForm() }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Add Inventory Item</h3>
            <Button variant="ghost" size="sm" onClick={() => { p.setIsNewItemDialogOpen(false); p.resetNewItemForm() }}>
              Close
            </Button>
          </div>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-item-name">Item Name</Label>
                <Input
                  id="new-item-name"
                  value={p.newItemForm.name}
                  placeholder="e.g., MOP, Urea, Parchment bags"
                  onChange={(e) => p.setNewItemForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-item-unit">Unit</Label>
                <Select value={p.newItemForm.unit} onValueChange={(v) => p.setNewItemForm((prev) => ({ ...prev, unit: v }))}>
                  <SelectTrigger id="new-item-unit" className="w-full"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="bags">bags</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="units">units</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-item-location">Location</Label>
              <Select value={p.newItemForm.locationId} onValueChange={(v) => p.setNewItemForm((prev) => ({ ...prev, locationId: v }))}>
                <SelectTrigger id="new-item-location" className="w-full"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent className="max-h-[40vh] overflow-y-auto">
                  <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name || loc.code || "Unnamed location"}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Choose where this item is stored.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-item-qty">Initial Quantity (optional)</Label>
                <Input id="new-item-qty" type="number" min={0} step="0.01" value={p.newItemForm.quantity} onKeyDown={p.preventNegativeKey} onChange={(e) => p.setNewItemForm((prev) => ({ ...prev, quantity: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-item-price">Unit Price (optional)</Label>
                <Input id="new-item-price" type="number" min={0} step="0.01" value={p.newItemForm.price} onKeyDown={p.preventNegativeKey} onChange={(e) => p.setNewItemForm((prev) => ({ ...prev, price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-item-notes">Notes (optional)</Label>
              <Textarea id="new-item-notes" value={p.newItemForm.notes} placeholder="Supplier, batch number, or usage notes" onChange={(e) => p.setNewItemForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
            <Button variant="outline" onClick={() => { p.setIsNewItemDialogOpen(false); p.resetNewItemForm() }}>Cancel</Button>
            <Button onClick={p.handleCreateNewItem} disabled={p.isSavingNewItem}>{p.isSavingNewItem ? "Saving..." : "Add Item"}</Button>
          </div>
        </DialogOverlay>
      )}

      {/* ── Edit transaction ── */}
      {p.isEditDialogOpen && p.editingTransaction && (
        <DialogOverlay
          isMobile={isMobile}
          maxWidth="max-w-2xl"
          onClickOutside={() => { p.setIsEditDialogOpen(false); p.setEditingTransaction(null) }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Edit Transaction</h3>
            <Button variant="ghost" size="sm" onClick={() => { p.setIsEditDialogOpen(false); p.setEditingTransaction(null) }}>Close</Button>
          </div>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="edit-transaction-item" label="Item Type" tooltip="Choose the inventory item tied to this transaction." />
                <Input id="edit-transaction-item" value={p.editingTransaction.item_type} onChange={(e) => p.handleEditTransactionChange("item_type", e.target.value)} />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="edit-transaction-type" label="Transaction Type" tooltip="Restocking adds stock, depleting reduces it." />
                <Select value={p.editingTransaction.transaction_type} onValueChange={(v) => p.handleEditTransactionChange("transaction_type", v)}>
                  <SelectTrigger id="edit-transaction-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="restock">Restocking</SelectItem>
                    <SelectItem value="deplete">Depleting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="edit-transaction-location" label="Location" tooltip="Location ties the transaction to an estate block." />
              <Select value={p.editingTransaction.location_id ?? LOCATION_UNASSIGNED} onValueChange={(v) => p.handleEditTransactionChange("location_id", v === LOCATION_UNASSIGNED ? null : v)}>
                <SelectTrigger id="edit-transaction-location" className="w-full"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent className="max-h-[40vh] overflow-y-auto">
                  <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name || loc.code || "Unnamed location"}</SelectItem>)}
                </SelectContent>
              </Select>
              {!p.editingTransaction.location_id && (
                <p className="text-xs text-muted-foreground">Legacy transaction (no location). Keep Unassigned (legacy) or assign a location.</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="edit-transaction-qty" label="Quantity" tooltip="Adjusting quantity will recalc inventory totals." />
                <Input
                  id="edit-transaction-qty" type="number" min={0} step="0.01"
                  value={p.editingTransaction.quantity ?? ""}
                  onKeyDown={p.preventNegativeKey}
                  onWheel={p.preventNumberScrollChange}
                  onChange={(e) => { const v = p.coerceNonNegativeNumber(e.target.value); if (v === null) return; p.handleEditTransactionChange("quantity", v) }}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="edit-transaction-price" label="Unit Price" tooltip="Used to compute total cost for this transaction." />
                <Input id="edit-transaction-price" type="number" value={p.editingTransaction.price ?? ""} onChange={(e) => p.handleEditTransactionChange("price", Number(e.target.value))} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Total Cost: {formatCurrency(Number(p.editingTransaction.total_cost || 0))}</div>
            <div className="space-y-2">
              <FieldLabel htmlFor="edit-transaction-notes" label="Notes" tooltip="Capture buyer refs, processing notes, or extra context." />
              <Textarea id="edit-transaction-notes" value={p.editingTransaction.notes ?? ""} onChange={(e) => p.handleEditTransactionChange("notes", e.target.value)} />
            </div>
          </div>
          <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
            <Button variant="outline" onClick={() => { p.setIsEditDialogOpen(false); p.setEditingTransaction(null) }}>Cancel</Button>
            <Button onClick={p.handleUpdateTransaction} disabled={p.isSavingTransactionEdit}>{p.isSavingTransactionEdit ? "Saving..." : "Save changes"}</Button>
          </div>
        </DialogOverlay>
      )}

      {/* ── Edit inventory item ── */}
      {p.isInventoryEditDialogOpen && p.editingInventoryItem && (
        <DialogOverlay
          isMobile={isMobile}
          onClickOutside={() => { p.setIsInventoryEditDialogOpen(false); p.setEditingInventoryItem(null) }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Edit Inventory Item</h3>
            <Button variant="ghost" size="sm" onClick={() => { p.setIsInventoryEditDialogOpen(false); p.setEditingInventoryItem(null) }}>Close</Button>
          </div>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="edit-item-name" label="Item Name" tooltip="Use clear names (e.g., Arabica Cherry, Dry Parch)." />
                <Input id="edit-item-name" value={p.inventoryEditForm.name} onChange={(e) => p.setInventoryEditForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="edit-item-unit" label="Unit" tooltip="Common units are kg, bags, or liters." />
                <Input id="edit-item-unit" value={p.inventoryEditForm.unit} onChange={(e) => p.setInventoryEditForm((prev) => ({ ...prev, unit: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="edit-item-location" label="Adjustment Location" tooltip="Choose where the correction should be applied." />
              <Select value={p.inventoryEditLocationId} onValueChange={p.setInventoryEditLocationId}>
                <SelectTrigger id="edit-item-location" className="w-full"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent className="max-h-[40vh] overflow-y-auto">
                  <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name || loc.code || "Unnamed location"}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Inventory adjustments are recorded against this location.</p>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="edit-item-qty" label="Quantity" tooltip="Updating quantity adds a correction transaction." />
              <Input
                id="edit-item-qty" type="number" min={0} step="0.01"
                value={p.inventoryEditForm.quantity}
                onKeyDown={p.preventNegativeKey}
                onWheel={p.preventNumberScrollChange}
                onChange={(e) => {
                  const next = e.target.value
                  const numeric = p.coerceNonNegativeNumber(next)
                  if (numeric === null && next !== "") return
                  p.setInventoryEditForm((prev) => ({ ...prev, quantity: next }))
                }}
              />
              <p className="text-xs text-muted-foreground">Changing quantity adds a correction transaction to keep history consistent.</p>
            </div>
          </div>
          <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
            <Button variant="outline" onClick={() => { p.setIsInventoryEditDialogOpen(false); p.setEditingInventoryItem(null) }}>Cancel</Button>
            <Button onClick={p.handleSaveInventoryEdit} disabled={p.isSavingInventoryEdit}>{p.isSavingInventoryEdit ? "Saving..." : "Save changes"}</Button>
          </div>
        </DialogOverlay>
      )}

      {/* ── Delete transaction confirm ── */}
      {p.deleteConfirmDialogOpen && (
        <DialogOverlay
          isMobile={isMobile}
          maxWidth="max-w-md"
          onClickOutside={() => { p.setDeleteConfirmDialogOpen(false); p.setTransactionToDelete(null) }}
        >
          <h3 className="text-lg font-semibold">Delete transaction?</h3>
          <p className="mt-2 text-sm text-muted-foreground">This will remove the transaction and recalculate inventory totals.</p>
          <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
            <Button variant="outline" onClick={() => { p.setDeleteConfirmDialogOpen(false); p.setTransactionToDelete(null) }}>Cancel</Button>
            <Button variant="destructive" onClick={p.handleDeleteTransaction}>Delete</Button>
          </div>
        </DialogOverlay>
      )}
    </>
  )
}
