"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { formatCurrency, formatNumber } from "@/lib/format"
import { formatDateOnly } from "@/lib/date-utils"
import { getAvailableFiscalYears, getCurrentFiscalYear, getFiscalYearDateRange, type FiscalYear } from "@/lib/fiscal-year-utils"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"
import { Pencil, Save, Trash2 } from "lucide-react"

type LocationOption = {
  id: string
  name: string
  code?: string | null
}

type OtherSalesRecord = {
  id: number
  sale_date: string
  location_id: string | null
  location_name?: string | null
  location_code?: string | null
  asset_type: string
  sale_mode: "per_kg" | "contract"
  kgs_sold: number | null
  rate_per_kg: number | null
  contract_amount: number | null
  revenue: number
  buyer_name: string | null
  bank_account: string | null
  notes: string | null
}

type Totals = {
  totalRevenue: number
  perKgRevenue: number
  contractRevenue: number
  totalKgsSold: number
}

type AssetSummary = {
  assetType: string
  revenue: number
  kgsSold: number
  count: number
}

const ASSET_OPTIONS = ["Pepper", "Arecanut", "Avocado", "Coconut", "Other"] as const
const MODE_OPTIONS = [
  { value: "per_kg", label: "Sale per KG" },
  { value: "contract", label: "Contract" },
] as const

const emptyTotals: Totals = {
  totalRevenue: 0,
  perKgRevenue: 0,
  contractRevenue: 0,
  totalKgsSold: 0,
}

const newDefaultForm = () => ({
  sale_date: new Date().toISOString().slice(0, 10),
  location_id: "",
  asset_type: "Pepper",
  sale_mode: "per_kg" as "per_kg" | "contract",
  kgs_sold: "",
  rate_per_kg: "",
  contract_amount: "",
  buyer_name: "",
  bank_account: "",
  notes: "",
})

export default function OtherSalesTab() {
  const { toast } = useToast()
  const { user } = useAuth()
  const canDelete = user?.role === "admin" || user?.role === "owner"
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()

  const [locations, setLocations] = useState<LocationOption[]>([])
  const [records, setRecords] = useState<OtherSalesRecord[]>([])
  const [totals, setTotals] = useState<Totals>(emptyTotals)
  const [byAsset, setByAsset] = useState<AssetSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingRecord, setEditingRecord] = useState<OtherSalesRecord | null>(null)
  const [form, setForm] = useState(newDefaultForm())
  const [locationFilter, setLocationFilter] = useState<string>("all")

  const selectedFiscalRange = useMemo(() => getFiscalYearDateRange(selectedFiscalYear), [selectedFiscalYear])

  const blockInvalidNumberKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isBlockedNumericKey(event.key)) {
      event.preventDefault()
    }
  }

  const handleNonNegativeChange = (field: "kgs_sold" | "rate_per_kg" | "contract_amount") => (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    if (!canAcceptNonNegative(nextValue)) return
    setForm((prev) => ({ ...prev, [field]: nextValue }))
  }

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) return
      const loaded = Array.isArray(data.locations) ? data.locations : []
      setLocations(loaded)
      setForm((prev) => {
        if (prev.location_id || loaded.length === 0) return prev
        return { ...prev, location_id: loaded[0].id }
      })
    } catch (error) {
      console.error("Error loading locations:", error)
    }
  }, [])

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: selectedFiscalRange.startDate,
        endDate: selectedFiscalRange.endDate,
        all: "true",
      })
      if (locationFilter !== "all") {
        params.set("locationId", locationFilter)
      }
      const response = await fetch(`/api/other-sales?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load other sales records")
      }
      const normalizedRecords: OtherSalesRecord[] = Array.isArray(data.records)
        ? data.records.map((row: any) => ({
            id: Number(row.id) || 0,
            sale_date: String(row.sale_date || ""),
            location_id: row.location_id ? String(row.location_id) : null,
            location_name: row.location_name ? String(row.location_name) : null,
            location_code: row.location_code ? String(row.location_code) : null,
            asset_type: String(row.asset_type || "Other"),
            sale_mode: String(row.sale_mode || "per_kg").toLowerCase() === "contract" ? "contract" : "per_kg",
            kgs_sold:
              row.kgs_sold === null || row.kgs_sold === undefined || row.kgs_sold === ""
                ? null
                : Number(row.kgs_sold) || 0,
            rate_per_kg:
              row.rate_per_kg === null || row.rate_per_kg === undefined || row.rate_per_kg === ""
                ? null
                : Number(row.rate_per_kg) || 0,
            contract_amount:
              row.contract_amount === null || row.contract_amount === undefined || row.contract_amount === ""
                ? null
                : Number(row.contract_amount) || 0,
            revenue: Number(row.revenue) || 0,
            buyer_name: row.buyer_name ? String(row.buyer_name) : null,
            bank_account: row.bank_account ? String(row.bank_account) : null,
            notes: row.notes ? String(row.notes) : null,
          }))
        : []
      setRecords(normalizedRecords)
      setTotals({
        totalRevenue: Number(data.totals?.totalRevenue) || 0,
        perKgRevenue: Number(data.totals?.perKgRevenue) || 0,
        contractRevenue: Number(data.totals?.contractRevenue) || 0,
        totalKgsSold: Number(data.totals?.totalKgsSold) || 0,
      })
      setByAsset(Array.isArray(data.byAsset) ? data.byAsset : [])
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load records",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [locationFilter, selectedFiscalRange.endDate, selectedFiscalRange.startDate, toast])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const selectedLocationLabel = useMemo(() => {
    const location = locations.find((loc) => loc.id === form.location_id)
    if (location) return location.name || location.code || "Estate"
    return "Estate"
  }, [form.location_id, locations])

  const computedRevenue = useMemo(() => {
    if (form.sale_mode === "contract") {
      const contractAmount = Number(form.contract_amount) || 0
      return Number(contractAmount.toFixed(2))
    }
    const kgs = Number(form.kgs_sold) || 0
    const rate = Number(form.rate_per_kg) || 0
    return Number((kgs * rate).toFixed(2))
  }, [form.contract_amount, form.kgs_sold, form.rate_per_kg, form.sale_mode])

  const resetForm = () => {
    setEditingRecord(null)
    setForm((prev) => {
      const next = newDefaultForm()
      if (prev.location_id) {
        next.location_id = prev.location_id
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!form.sale_date) {
      toast({ title: "Missing date", description: "Sale date is required.", variant: "destructive" })
      return
    }
    if (!form.location_id) {
      toast({ title: "Missing estate", description: "Select an estate/location.", variant: "destructive" })
      return
    }

    if (form.sale_mode === "per_kg") {
      const kgs = Number(form.kgs_sold)
      const rate = Number(form.rate_per_kg)
      if (!Number.isFinite(kgs) || kgs <= 0) {
        toast({ title: "Invalid KGs", description: "KGs sold must be greater than 0.", variant: "destructive" })
        return
      }
      if (!Number.isFinite(rate) || rate < 0) {
        toast({ title: "Invalid rate", description: "Rate per KG must be 0 or more.", variant: "destructive" })
        return
      }
    } else {
      const contractAmount = Number(form.contract_amount)
      if (!Number.isFinite(contractAmount) || contractAmount < 0) {
        toast({
          title: "Invalid contract value",
          description: "Contract value must be 0 or more.",
          variant: "destructive",
        })
        return
      }
    }

    setIsSaving(true)
    try {
      const payload = {
        sale_date: form.sale_date,
        location_id: form.location_id,
        asset_type: form.asset_type,
        sale_mode: form.sale_mode,
        kgs_sold: form.sale_mode === "per_kg" ? Number(form.kgs_sold || 0) : null,
        rate_per_kg: form.sale_mode === "per_kg" ? Number(form.rate_per_kg || 0) : null,
        contract_amount: form.sale_mode === "contract" ? Number(form.contract_amount || 0) : null,
        revenue: computedRevenue,
        buyer_name: form.buyer_name.trim() || null,
        bank_account: form.bank_account.trim() || null,
        notes: form.notes.trim() || null,
      }
      const response = await fetch("/api/other-sales", {
        method: editingRecord ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRecord ? { ...payload, id: editingRecord.id } : payload),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save record")
      }

      toast({
        title: editingRecord ? "Record updated" : "Record saved",
        description: `${form.asset_type} sale recorded for ${selectedLocationLabel}.`,
      })
      resetForm()
      await loadRecords()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save record",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (record: OtherSalesRecord) => {
    setEditingRecord(record)
    setForm({
      sale_date: record.sale_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      location_id: record.location_id || "",
      asset_type: record.asset_type || "Pepper",
      sale_mode: record.sale_mode || "per_kg",
      kgs_sold: record.kgs_sold !== null && record.kgs_sold !== undefined ? String(record.kgs_sold) : "",
      rate_per_kg: record.rate_per_kg !== null && record.rate_per_kg !== undefined ? String(record.rate_per_kg) : "",
      contract_amount:
        record.contract_amount !== null && record.contract_amount !== undefined ? String(record.contract_amount) : "",
      buyer_name: record.buyer_name || "",
      bank_account: record.bank_account || "",
      notes: record.notes || "",
    })
  }

  const handleDelete = async (record: OtherSalesRecord) => {
    if (!canDelete) {
      toast({ title: "Insufficient role", description: "Only admin/owner can delete sales records.", variant: "destructive" })
      return
    }
    if (!window.confirm("Delete this record?")) return

    try {
      const response = await fetch(`/api/other-sales?id=${record.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete record")
      }
      toast({ title: "Deleted", description: "Other sale record removed." })
      if (editingRecord?.id === record.id) {
        resetForm()
      }
      await loadRecords()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete record",
        variant: "destructive",
      })
    }
  }

  const resolveLocationLabel = (record: OtherSalesRecord) => {
    if (record.location_name) return record.location_name
    if (record.location_code) return record.location_code
    return "Unassigned"
  }

  return (
    <div className="space-y-6">
      <Card className="border-emerald-100 bg-emerald-50/40">
        <CardHeader>
          <CardTitle>Other Sales</CardTitle>
          <CardDescription>
            Capture Pepper, Arecanut, Avocado, Coconut, and Other sales using either per-kg or contract mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total revenue</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Per-kg revenue</p>
            <p className="text-lg font-semibold text-emerald-700">{formatCurrency(totals.perKgRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contract revenue</p>
            <p className="text-lg font-semibold text-amber-700">{formatCurrency(totals.contractRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">KGs sold</p>
            <p className="text-lg font-semibold">{formatNumber(totals.totalKgsSold, 2)} kg</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingRecord ? "Edit Other Sale" : "Record Other Sale"}</CardTitle>
          <CardDescription>
            Example: one location can use contract mode while another uses per-kg mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.sale_date}
              onChange={(event) => setForm((prev) => ({ ...prev, sale_date: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={form.location_id || undefined} onValueChange={(value) => setForm((prev) => ({ ...prev, location_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name || location.code || "Location"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Asset</Label>
            <Select value={form.asset_type} onValueChange={(value) => setForm((prev) => ({ ...prev, asset_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select asset" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_OPTIONS.map((asset) => (
                  <SelectItem key={asset} value={asset}>
                    {asset}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sale mode</Label>
            <Select
              value={form.sale_mode}
              onValueChange={(value: "per_kg" | "contract") =>
                setForm((prev) => ({
                  ...prev,
                  sale_mode: value,
                  ...(value === "per_kg"
                    ? { contract_amount: "" }
                    : { kgs_sold: "", rate_per_kg: "" }),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.sale_mode === "per_kg" ? (
            <>
              <div className="space-y-2">
                <Label>KGs sold</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.kgs_sold}
                  onKeyDown={blockInvalidNumberKey}
                  onChange={handleNonNegativeChange("kgs_sold")}
                  placeholder="Enter KGs sold"
                />
              </div>
              <div className="space-y-2">
                <Label>Rate / KG (Rs)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.rate_per_kg}
                  onKeyDown={blockInvalidNumberKey}
                  onChange={handleNonNegativeChange("rate_per_kg")}
                  placeholder="Enter rate per KG"
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Contract value (Rs)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.contract_amount}
                onKeyDown={blockInvalidNumberKey}
                onChange={handleNonNegativeChange("contract_amount")}
                placeholder="Enter contract value"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Revenue (Auto)</Label>
            <Input value={formatCurrency(computedRevenue)} readOnly />
          </div>

          <div className="space-y-2">
            <Label>Buyer</Label>
            <Input
              value={form.buyer_name}
              onChange={(event) => setForm((prev) => ({ ...prev, buyer_name: event.target.value }))}
              placeholder="Buyer name"
            />
          </div>

          <div className="space-y-2">
            <Label>Bank Account</Label>
            <Input
              value={form.bank_account}
              onChange={(event) => setForm((prev) => ({ ...prev, bank_account: event.target.value }))}
              placeholder="Bank account"
            />
          </div>

          <div className="space-y-2 md:col-span-2 xl:col-span-4">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Optional notes"
              className="min-h-[90px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-4">
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : editingRecord ? "Update Record" : "Save Record"}
            </Button>
            {editingRecord && (
              <Button variant="outline" onClick={resetForm} disabled={isSaving}>
                Cancel edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Other Sales Records</CardTitle>
            <CardDescription>
              {isLoading ? "Loading..." : `${records.length} record(s) in ${selectedFiscalYear.label}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedFiscalYear.label}
              onValueChange={(value) => {
                const nextYear = availableFiscalYears.find((fy) => fy.label === value) || getCurrentFiscalYear()
                setSelectedFiscalYear(nextYear)
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFiscalYears.map((fy) => (
                  <SelectItem key={fy.label} value={fy.label}>
                    {fy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter estate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All estates</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name || location.code || "Estate"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {byAsset.map((asset) => (
              <div key={asset.assetType} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{asset.assetType}</p>
                <p className="text-sm font-semibold">{formatCurrency(asset.revenue)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(asset.kgsSold, 2)} kg · {asset.count} record(s)
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Estate</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">KGs Sold</TableHead>
                  <TableHead className="text-right">Rate/KG</TableHead>
                  <TableHead className="text-right">Contract</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-sm text-muted-foreground">
                      No records yet for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{formatDateOnly(record.sale_date)}</TableCell>
                      <TableCell>{resolveLocationLabel(record)}</TableCell>
                      <TableCell>{record.asset_type}</TableCell>
                      <TableCell>{record.sale_mode === "contract" ? "Contract" : "Per KG"}</TableCell>
                      <TableCell className="text-right">
                        {record.kgs_sold !== null && record.kgs_sold !== undefined ? formatNumber(record.kgs_sold, 2) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.rate_per_kg !== null && record.rate_per_kg !== undefined
                          ? formatCurrency(record.rate_per_kg, 2)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.contract_amount !== null && record.contract_amount !== undefined
                          ? formatCurrency(record.contract_amount, 2)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(record.revenue, 2)}</TableCell>
                      <TableCell>{record.buyer_name || "-"}</TableCell>
                      <TableCell>{record.bank_account || "-"}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{record.notes || "-"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(record)} aria-label="Edit record">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(record)}
                            disabled={!canDelete}
                            aria-label="Delete record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
