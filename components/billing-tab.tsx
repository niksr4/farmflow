"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { GST_STATES, computeInvoiceTotals } from "@/lib/billing"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/components/ui/use-toast"
import TaskGuideCard from "@/components/task-guide-card"

type LineItem = {
  description: string
  hsn: string
  quantity: number
  unitPrice: number
  taxRate: number
}

type InvoiceRow = {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string | null
  bill_to_name: string
  bill_to_gstin: string | null
  bill_to_state: string | null
  place_of_supply_state: string | null
  supply_state: string | null
  is_inter_state: boolean
  subtotal: number
  tax_total: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  total: number
  status: string
  currency: string
  created_at: string
  updated_at: string
  irn: string | null
  irn_ack_no: string | null
  irn_ack_date: string | null
}

const defaultLineItem = (): LineItem => ({
  description: "",
  hsn: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 5,
})

type BillingTabProps = {
  showDataToolsControls?: boolean
}

export default function BillingTab({ showDataToolsControls = false }: BillingTabProps) {
  const { user } = useAuth()
  const canEdit = user?.role === "admin" || user?.role === "owner" || user?.role === "user"
  const [loading, setLoading] = useState(false)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [billToName, setBillToName] = useState("")
  const [billToGstin, setBillToGstin] = useState("")
  const [billToAddress, setBillToAddress] = useState("")
  const [billToState, setBillToState] = useState("")
  const [placeOfSupply, setPlaceOfSupply] = useState("")
  const [supplyState, setSupplyState] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<LineItem[]>([defaultLineItem()])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totals = useMemo(() => computeInvoiceTotals(items, supplyState, placeOfSupply || billToState), [
    items,
    supplyState,
    placeOfSupply,
    billToState,
  ])
  const billingSaveBlockers = useMemo(() => {
    const blockers: string[] = []
    if (!billToName.trim()) blockers.push("Add the customer name.")
    if (!supplyState) blockers.push("Select your GST supply state.")
    if (!(placeOfSupply || billToState)) blockers.push("Choose place of supply or bill-to state.")
    if (!items.length || items.some((item) => !item.description.trim())) blockers.push("Add a description for every line item.")
    if (items.some((item) => Number(item.quantity || 0) <= 0)) blockers.push("Each line item needs quantity above 0.")
    return blockers
  }, [billToName, billToState, items, placeOfSupply, supplyState])
  const invoiceReady = billingSaveBlockers.length === 0
  const scrollToEntryForm = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/billing/invoices")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load invoices")
      }
      setInvoices(data.invoices || [])
    } catch (error: any) {
      toast({
        title: "Billing list not loaded",
        description: error.message || "Invoices could not be loaded. No billing data was changed.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  const updateItem = (index: number, next: Partial<LineItem>) => {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...next } : item)))
  }

  const addItem = () => {
    setItems((prev) => [...prev, defaultLineItem()])
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const resetForm = () => {
    setBillToName("")
    setBillToGstin("")
    setBillToAddress("")
    setBillToState("")
    setPlaceOfSupply("")
    setSupplyState("")
    setInvoiceDate(new Date().toISOString().slice(0, 10))
    setDueDate("")
    setNotes("")
    setItems([defaultLineItem()])
  }

  const submitInvoice = async () => {
    if (billingSaveBlockers.length > 0) {
      toast({
        title: "Draft not saved",
        description: billingSaveBlockers[0],
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceDate,
          dueDate: dueDate || null,
          currency: "INR",
          billToName: billToName.trim(),
          billToGstin: billToGstin.trim() || null,
          billToAddress: billToAddress.trim() || null,
          billToState: billToState || null,
          placeOfSupplyState: placeOfSupply || billToState || null,
          supplyState,
          notes: notes.trim() || null,
          items: items.map((item) => ({
            description: item.description,
            hsn: item.hsn || null,
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            taxRate: Number(item.taxRate || 0),
          })),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create invoice")
      }
      toast({ title: "Invoice created", description: "Draft invoice saved. You can review it below." })
      resetForm()
      await loadInvoices()
    } catch (error: any) {
      toast({
        title: "Draft not saved",
        description: error.message || "The invoice draft could not be saved.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const exportInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to export invoice")
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `invoice-${invoiceId}.json`
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "The invoice export could not be generated. The stored invoice was not changed.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <TaskGuideCard
        eyebrow="Billing guide"
        title="Use this tab when you need a clean invoice record"
        description="Billing is for draft invoices that match a real sale. Keep the customer name, state selection, and line descriptions clear enough for accounts and follow-up."
        bullets={[
          "Save only real invoice drafts, not placeholders for future deals.",
          "Supply state and place of supply decide the GST split, so double-check them.",
          "Line item descriptions should be understandable to the buyer and accountant.",
        ]}
        tip="This screen saves draft invoices inside FarmFlow. It does not submit IRN or full e-invoicing yet."
        tone="finance"
        actions={
          <>
            <Button variant="outline" className="bg-white" onClick={scrollToEntryForm}>
              Go to form
            </Button>
            <Button asChild variant="outline" className="bg-white">
              <Link href="/manuals">Manuals</Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>GST Billing & Invoicing</CardTitle>
          <CardDescription>
            Generate GST-ready invoices with IGST or CGST+SGST split. IRN fields are ready for e-invoicing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={invoiceReady ? "border-emerald-200 bg-white text-emerald-700" : "border-amber-200 bg-white text-amber-700"}>
                  {invoiceReady ? "Ready to save" : `${billingSaveBlockers.length} item${billingSaveBlockers.length === 1 ? "" : "s"} to finish`}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  Draft only
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                Most billing mistakes come from wrong state selection or vague line descriptions. Fix those before saving.
              </p>
              {!invoiceReady ? (
                <ul className="ml-4 mt-3 list-disc space-y-1 text-xs text-slate-700">
                  {billingSaveBlockers.slice(0, 4).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-emerald-700">
                  Required fields look complete enough for a first draft. Review totals once before saving.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">What happens after save</p>
              <ul className="ml-4 mt-3 list-disc space-y-1 text-xs text-slate-600">
                <li>FarmFlow stores the invoice as a draft record.</li>
                <li>The invoice appears in the recent invoices list below.</li>
                <li>No IRN or government submission happens automatically yet.</li>
              </ul>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Bill-to name</Label>
              <Input value={billToName} onChange={(event) => setBillToName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bill-to GSTIN (optional)</Label>
              <Input value={billToGstin} onChange={(event) => setBillToGstin(event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Bill-to address</Label>
              <Input value={billToAddress} onChange={(event) => setBillToAddress(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bill-to state</Label>
              <Select value={billToState} onValueChange={setBillToState}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {GST_STATES.map((state) => (
                    <SelectItem key={state.code} value={state.code}>
                      {state.name} ({state.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Place of supply</Label>
              <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {GST_STATES.map((state) => (
                    <SelectItem key={state.code} value={state.code}>
                      {state.name} ({state.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supply state (your GST state)</Label>
              <Select value={supplyState} onValueChange={setSupplyState}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {GST_STATES.map((state) => (
                    <SelectItem key={state.code} value={state.code}>
                      {state.name} ({state.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Invoice date</Label>
              <Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Due date (optional)</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Line items</p>
              <Button variant="outline" size="sm" onClick={addItem}>
                Add line
              </Button>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>HSN</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit price</TableHead>
                    <TableHead>GST %</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={`${item.description}-${index}`}>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(event) => updateItem(index, { description: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={item.hsn} onChange={(event) => updateItem(index, { hsn: event.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.taxRate}
                          onChange={(event) => updateItem(index, { taxRate: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        {items.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-emerald-100 bg-emerald-50/40">
              <CardHeader>
                <CardTitle className="text-lg">Totals</CardTitle>
                <CardDescription>Calculated GST split</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>CGST</span>
                  <span>{formatCurrency(totals.cgstAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>SGST</span>
                  <span>{formatCurrency(totals.sgstAmount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>IGST</span>
                  <span>{formatCurrency(totals.igstAmount)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="md:col-span-2 border-slate-200 bg-white/80">
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
                <CardDescription>Include payment or delivery terms.</CardDescription>
              </CardHeader>
              <CardContent>
                <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={submitInvoice} disabled={isSubmitting || !canEdit || !invoiceReady}>
              {isSubmitting ? "Saving..." : "Create Draft Invoice"}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              Clear form
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {canEdit
              ? "IRN/e-invoicing fields are stored for future integrations once IRN submission is enabled."
              : "You have read-only access to billing. Contact an admin to create invoices."}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription>Generated GST invoices for this tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-5 text-sm">
              <p className="font-semibold text-foreground">No invoices created yet</p>
              <p className="mt-2 text-muted-foreground">
                Start when a real sale needs a buyer-facing invoice. Fill customer details, review the GST split, then save the draft.
              </p>
              <ul className="ml-4 mt-3 list-disc space-y-1 text-muted-foreground">
                <li>Enter the buyer name and state details first.</li>
                <li>Add one line item with a clear description and price.</li>
                <li>Check the total once, then save the draft invoice.</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={scrollToEntryForm}>Create first draft</Button>
                <Button asChild variant="outline" className="bg-white">
                  <Link href="/manuals">Open manuals</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Bill to</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>{formatDateOnly(invoice.invoice_date)}</TableCell>
                      <TableCell>{invoice.bill_to_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{invoice.status}</Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(invoice.total || 0))}</TableCell>
                      <TableCell>
                        {showDataToolsControls ? (
                          <Button variant="outline" size="sm" onClick={() => exportInvoice(invoice.id)}>
                            Export JSON
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
