"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { TrendingUp, Users, Plus, Phone, Mail, IndianRupee } from "lucide-react"
import { formatDateOnly } from "@/lib/date-utils"

interface Buyer {
  id: string
  name: string
  type: string
  contact_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
  created_at: string
}

interface PriceRecord {
  id: string
  buyer_id: string | null
  buyer_name: string | null
  grade: string | null
  variety: string | null
  price_per_kg: string
  quantity_kg: string | null
  record_date: string
  notes: string | null
}

const BUYER_TYPE_LABELS: Record<string, string> = {
  cooperative: "Cooperative",
  trader: "Trader",
  exporter: "Exporter",
  processor: "Processor",
}

const BUYER_TYPE_COLORS: Record<string, string> = {
  cooperative: "bg-blue-50 text-blue-700 border-blue-200",
  trader: "bg-amber-50 text-amber-700 border-amber-200",
  exporter: "bg-emerald-50 text-emerald-700 border-emerald-200",
  processor: "bg-purple-50 text-purple-700 border-purple-200",
}

export default function MarketPricingTab() {
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [priceRecords, setPriceRecords] = useState<PriceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [buyerDialogOpen, setBuyerDialogOpen] = useState(false)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [buyerForm, setBuyerForm] = useState({
    name: "",
    buyerType: "trader",
    contact_name: "",
    phone: "",
    email: "",
    notes: "",
  })
  const [priceForm, setPriceForm] = useState({
    buyer_id: "",
    grade: "",
    variety: "",
    price_per_kg: "",
    quantity_kg: "",
    record_date: new Date().toISOString().split("T")[0],
    notes: "",
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/market-pricing")
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Failed to load market pricing data")
      setBuyers(data.buyers)
      setPriceRecords(data.priceRecords)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddBuyer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buyerForm.name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/market-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "buyer", ...buyerForm }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setBuyerDialogOpen(false)
      setBuyerForm({ name: "", buyerType: "trader", contact_name: "", phone: "", email: "", notes: "" })
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add buyer")
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddPriceRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!priceForm.price_per_kg || !priceForm.record_date) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/market-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "price_record",
          ...priceForm,
          buyer_id: priceForm.buyer_id || null,
          price_per_kg: parseFloat(priceForm.price_per_kg),
          quantity_kg: priceForm.quantity_kg ? parseFloat(priceForm.quantity_kg) : null,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setPriceDialogOpen(false)
      setPriceForm({
        buyer_id: "",
        grade: "",
        variety: "",
        price_per_kg: "",
        quantity_kg: "",
        record_date: new Date().toISOString().split("T")[0],
        notes: "",
      })
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add price record")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const activeBuyers = buyers.filter((b) => b.active)
  const recentPrices = priceRecords.slice(0, 5)
  const avgPrice =
    priceRecords.length > 0
      ? priceRecords.reduce((sum, r) => sum + parseFloat(r.price_per_kg), 0) / priceRecords.length
      : null

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="border-border/70">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeBuyers.length}</p>
                <p className="text-xs text-muted-foreground">Active Buyers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                <IndianRupee className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {avgPrice != null ? `₹${avgPrice.toFixed(0)}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Price/kg</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
                <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">{priceRecords.length}</p>
                <p className="text-xs text-muted-foreground">Price Records</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Buyers */}
      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-blue-600" />
            Buyers
          </CardTitle>
          <Dialog open={buyerDialogOpen} onOpenChange={setBuyerDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add Buyer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <div className="pb-1">
                <DialogTitle>Add Buyer</DialogTitle>
              </div>
              <form onSubmit={handleAddBuyer} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input
                    value={buyerForm.name}
                    onChange={(e) => setBuyerForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Coorg Coffee Coop"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={buyerForm.buyerType}
                    onValueChange={(v) => setBuyerForm((f) => ({ ...f, buyerType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cooperative">Cooperative</SelectItem>
                      <SelectItem value="trader">Trader</SelectItem>
                      <SelectItem value="exporter">Exporter</SelectItem>
                      <SelectItem value="processor">Processor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Contact Name</Label>
                    <Input
                      value={buyerForm.contact_name}
                      onChange={(e) => setBuyerForm((f) => ({ ...f, contact_name: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      value={buyerForm.phone}
                      onChange={(e) => setBuyerForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    value={buyerForm.notes}
                    onChange={(e) => setBuyerForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Payment history, reliability, preferences…"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setBuyerDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-emerald-700 hover:bg-emerald-800">
                    {submitting ? "Saving…" : "Save Buyer"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {activeBuyers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No buyers added yet. Add your traders, cooperatives, and exporters.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {activeBuyers.map((buyer) => (
                <div key={buyer.id} className="flex items-start justify-between py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{buyer.name}</p>
                    {buyer.contact_name && (
                      <p className="text-xs text-muted-foreground">{buyer.contact_name}</p>
                    )}
                    <div className="flex items-center gap-3">
                      {buyer.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {buyer.phone}
                        </span>
                      )}
                      {buyer.email && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {buyer.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-medium ${BUYER_TYPE_COLORS[buyer.type] ?? ""}`}
                  >
                    {BUYER_TYPE_LABELS[buyer.type] ?? buyer.type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price Records */}
      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Price Records
          </CardTitle>
          <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Log Price
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <div className="pb-1">
                <DialogTitle>Log Price</DialogTitle>
              </div>
              <form onSubmit={handleAddPriceRecord} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Buyer</Label>
                  <Select
                    value={priceForm.buyer_id}
                    onValueChange={(v) => setPriceForm((f) => ({ ...f, buyer_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select buyer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {buyers.filter((b) => b.active).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Grade</Label>
                    <Input
                      value={priceForm.grade}
                      onChange={(e) => setPriceForm((f) => ({ ...f, grade: e.target.value }))}
                      placeholder="e.g. AB, PB, AA"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Variety</Label>
                    <Input
                      value={priceForm.variety}
                      onChange={(e) => setPriceForm((f) => ({ ...f, variety: e.target.value }))}
                      placeholder="e.g. Arabica"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Price / kg (₹) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={priceForm.price_per_kg}
                      onChange={(e) => setPriceForm((f) => ({ ...f, price_per_kg: e.target.value }))}
                      placeholder="e.g. 180.00"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantity (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={priceForm.quantity_kg}
                      onChange={(e) => setPriceForm((f) => ({ ...f, quantity_kg: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={priceForm.record_date}
                    onChange={(e) => setPriceForm((f) => ({ ...f, record_date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    value={priceForm.notes}
                    onChange={(e) => setPriceForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Negotiation notes, conditions…"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setPriceDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-emerald-700 hover:bg-emerald-800">
                    {submitting ? "Saving…" : "Save Record"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {priceRecords.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No price records yet. Log prices quoted by buyers to track trends over time.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Date</th>
                    <th className="pb-2 text-left font-medium">Buyer</th>
                    <th className="pb-2 text-left font-medium">Grade</th>
                    <th className="pb-2 text-right font-medium">₹/kg</th>
                    <th className="pb-2 text-right font-medium">Qty (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {priceRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 text-muted-foreground">{formatDateOnly(r.record_date)}</td>
                      <td className="py-2.5 font-medium">{r.buyer_name ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {[r.grade, r.variety].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        ₹{parseFloat(r.price_per_kg).toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {r.quantity_kg ? parseFloat(r.quantity_kg).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {priceRecords.length > 5 && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Showing {priceRecords.length} records
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
