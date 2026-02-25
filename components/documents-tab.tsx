"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, FileUp, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const MAX_FILE_BYTES = 10 * 1024 * 1024

type LocationOption = {
  id: string
  name: string
  code?: string | null
}

type DocumentRecord = {
  id: string
  document_type: string
  title: string | null
  file_name: string
  mime_type: string
  file_size_bytes: number
  lot_id: string | null
  buyer_name: string | null
  dispatch_record_id: number | null
  sales_record_id: number | null
  receivable_id: number | null
  document_date: string | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
  location_id: string | null
  location_name: string | null
  location_code: string | null
}

const documentTypeOptions = [
  { value: "invoice", label: "Invoice" },
  { value: "dispatch_slip", label: "Dispatch Slip" },
  { value: "buyer_confirmation", label: "Buyer Confirmation" },
  { value: "weighbridge_slip", label: "Weighbridge Slip" },
  { value: "lab_report", label: "Lab Report" },
  { value: "quality_sheet", label: "Quality Sheet" },
  { value: "other", label: "Other" },
]

const typeLabel = (value: string) => documentTypeOptions.find((option) => option.value === value)?.label || value

const formatDate = (value: string | null | undefined) => {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

const formatBytes = (bytes: number) => {
  const size = Number(bytes) || 0
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

export default function DocumentsTab() {
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [records, setRecords] = useState<DocumentRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState("")

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState("invoice")
  const [title, setTitle] = useState("")
  const [uploadLocationId, setUploadLocationId] = useState("all")
  const [documentDate, setDocumentDate] = useState("")
  const [lotId, setLotId] = useState("")
  const [buyerName, setBuyerName] = useState("")
  const [dispatchRecordId, setDispatchRecordId] = useState("")
  const [salesRecordId, setSalesRecordId] = useState("")
  const [receivableId, setReceivableId] = useState("")
  const [notes, setNotes] = useState("")
  const [uploadError, setUploadError] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  const [query, setQuery] = useState("")
  const [listTypeFilter, setListTypeFilter] = useState("all")
  const [listLocationFilter, setListLocationFilter] = useState("all")

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) return
      const rows = Array.isArray(payload.locations) ? payload.locations : []
      setLocations(
        rows.map((row: any) => ({
          id: String(row.id || ""),
          name: String(row.name || row.code || "Unnamed"),
          code: row.code ? String(row.code) : null,
        })),
      )
    } catch {
      // no-op: document upload works without location list
    }
  }, [])

  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setLoadError("")
    try {
      const params = new URLSearchParams()
      params.set("limit", "80")
      if (listTypeFilter !== "all") params.set("documentType", listTypeFilter)
      if (listLocationFilter !== "all") params.set("locationId", listLocationFilter)
      if (query.trim()) params.set("q", query.trim())

      const response = await fetch(`/api/documents?${params.toString()}`, { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load documents")
      }
      const rows = Array.isArray(payload.records) ? payload.records : []
      setRecords(rows as DocumentRecord[])
    } catch (error: any) {
      setLoadError(error?.message || "Failed to load documents")
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [listLocationFilter, listTypeFilter, query])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const selectedFileLabel = useMemo(() => {
    if (!selectedFile) return "No file selected"
    return `${selectedFile.name} (${formatBytes(selectedFile.size)})`
  }, [selectedFile])

  const handleUpload = async () => {
    setUploadError("")
    if (!selectedFile) {
      setUploadError("Please select a file to upload.")
      return
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      setUploadError("File exceeds 10 MB. Please upload a smaller document.")
      return
    }

    setIsUploading(true)
    try {
      const body = new FormData()
      body.append("file", selectedFile)
      body.append("documentType", documentType)
      if (title.trim()) body.append("title", title.trim())
      if (uploadLocationId !== "all") body.append("locationId", uploadLocationId)
      if (documentDate) body.append("documentDate", documentDate)
      if (lotId.trim()) body.append("lotId", lotId.trim())
      if (buyerName.trim()) body.append("buyerName", buyerName.trim())
      if (dispatchRecordId.trim()) body.append("dispatchRecordId", dispatchRecordId.trim())
      if (salesRecordId.trim()) body.append("salesRecordId", salesRecordId.trim())
      if (receivableId.trim()) body.append("receivableId", receivableId.trim())
      if (notes.trim()) body.append("notes", notes.trim())

      const response = await fetch("/api/documents", { method: "POST", body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Upload failed")
      }

      setSelectedFile(null)
      setTitle("")
      setDocumentDate("")
      setLotId("")
      setBuyerName("")
      setDispatchRecordId("")
      setSalesRecordId("")
      setReceivableId("")
      setNotes("")
      await loadDocuments()
    } catch (error: any) {
      setUploadError(error?.message || "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-emerald-700" />
            Document Upload Trail
          </CardTitle>
          <CardDescription>
            Upload invoices, dispatch slips, weighbridge receipts, and quality documents with tenant-safe tagging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="doc-file">File</Label>
              <Input
                id="doc-file"
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,.doc,.docx,.txt"
              />
              <p className="text-xs text-muted-foreground">{selectedFileLabel}</p>
            </div>

            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-title">Title (optional)</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="April dispatch invoice"
              />
            </div>

            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Select value={uploadLocationId} onValueChange={setUploadLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tenant-wide / Unassigned</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                      {location.code ? ` (${location.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-date">Document date (optional)</Label>
              <Input id="doc-date" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-lot">Lot ID (optional)</Label>
              <Input id="doc-lot" value={lotId} onChange={(event) => setLotId(event.target.value)} placeholder="LOT-24-APR-017" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-buyer">Buyer (optional)</Label>
              <Input id="doc-buyer" value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Buyer name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-dispatch-id">Dispatch record ID (optional)</Label>
              <Input
                id="doc-dispatch-id"
                inputMode="numeric"
                value={dispatchRecordId}
                onChange={(event) => setDispatchRecordId(event.target.value)}
                placeholder="123"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-sales-id">Sales record ID (optional)</Label>
              <Input
                id="doc-sales-id"
                inputMode="numeric"
                value={salesRecordId}
                onChange={(event) => setSalesRecordId(event.target.value)}
                placeholder="456"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-receivable-id">Receivable ID (optional)</Label>
              <Input
                id="doc-receivable-id"
                inputMode="numeric"
                value={receivableId}
                onChange={(event) => setReceivableId(event.target.value)}
                placeholder="789"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-notes">Notes (optional)</Label>
            <Textarea
              id="doc-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Any context that helps auditing and reconciliation"
            />
          </div>

          {uploadError && <p className="text-sm text-rose-600">{uploadError}</p>}

          <Button
            onClick={handleUpload}
            disabled={isUploading || !selectedFile}
            className="w-full bg-emerald-700 hover:bg-emerald-800 sm:w-auto"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <FileUp className="mr-2 h-4 w-4" />
                Upload Document
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Search and download records linked to lots, buyers, and dispatch/sales entries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search by file, lot, buyer, or notes"
              />
            </div>
            <Select value={listTypeFilter} onValueChange={setListTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All document types</SelectItem>
                {documentTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={listLocationFilter} onValueChange={setListLocationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                    {location.code ? ` (${location.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadError && <p className="text-sm text-rose-600">{loadError}</p>}

          {isLoading ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">Loading documents...</div>
          ) : records.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">No documents found for current filters.</div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div key={record.id} className="rounded-xl border border-border/60 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{record.title || record.file_name}</p>
                        <Badge variant="outline">{typeLabel(record.document_type)}</Badge>
                        <Badge variant="outline">{formatBytes(record.file_size_bytes)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{record.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded {formatDate(record.created_at)} by {record.uploaded_by || "system"}
                        {record.location_name ? ` · ${record.location_name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.lot_id ? `Lot: ${record.lot_id}` : "Lot: -"} · {record.buyer_name ? `Buyer: ${record.buyer_name}` : "Buyer: -"}
                      </p>
                      {(record.dispatch_record_id || record.sales_record_id || record.receivable_id) && (
                        <p className="text-xs text-muted-foreground">
                          {record.dispatch_record_id ? `Dispatch #${record.dispatch_record_id}` : ""}
                          {record.sales_record_id ? ` · Sales #${record.sales_record_id}` : ""}
                          {record.receivable_id ? ` · Receivable #${record.receivable_id}` : ""}
                        </p>
                      )}
                      {record.notes && <p className="text-xs text-muted-foreground">{record.notes}</p>}
                    </div>
                    <Button asChild variant="outline" className="w-full bg-white md:w-auto">
                      <a href={`/api/documents/${record.id}/file`}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
