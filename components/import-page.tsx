"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { parseCsv } from "@/lib/csv"
import { apiRequest } from "@/lib/api-client"
import { datasetTemplateCsv, IMPORT_DATASETS, IMPORT_DATASET_MAP, isImportDatasetId, type ImportDatasetId } from "@/lib/data-tools"

interface ImportIssue {
  row: number
  message: string
}

interface ImportBulkResponse {
  success: boolean
  mode: "validate" | "commit"
  valid?: boolean
  rowCount?: number
  imported: number
  skipped: number
  errors?: ImportIssue[]
  validationToken?: string | null
  expiresAt?: string | null
}

const formatExpiry = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export default function ImportPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [dataset, setDataset] = useState<ImportDatasetId>(IMPORT_DATASETS[0].id)
  const [csvText, setCsvText] = useState<string>("")
  const [isValidating, setIsValidating] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [validationResult, setValidationResult] = useState<ImportBulkResponse | null>(null)
  const [commitResult, setCommitResult] = useState<ImportBulkResponse | null>(null)
  const [validationToken, setValidationToken] = useState<string | null>(null)
  const [validationExpiresAt, setValidationExpiresAt] = useState<string | null>(null)
  const [validatedDataset, setValidatedDataset] = useState<ImportDatasetId | null>(null)

  const resetValidationState = useCallback(() => {
    setValidationToken(null)
    setValidationExpiresAt(null)
    setValidationResult(null)
    setCommitResult(null)
    setValidatedDataset(null)
  }, [])

  useEffect(() => {
    const requestedDataset = searchParams.get("dataset")
    if (isImportDatasetId(requestedDataset)) {
      setDataset(requestedDataset)
      resetValidationState()
    }
  }, [resetValidationState, searchParams])

  const datasetConfig = useMemo(() => IMPORT_DATASET_MAP[dataset] || IMPORT_DATASETS[0], [dataset])
  const preview = useMemo(() => {
    if (!csvText.trim()) return null
    try {
      return parseCsv(csvText)
    } catch {
      return null
    }
  }, [csvText])

  const templateCsv = useMemo(() => datasetTemplateCsv(dataset), [dataset])
  const expiresAtLabel = useMemo(() => formatExpiry(validationExpiresAt), [validationExpiresAt])
  const canCommit = Boolean(validationToken && validatedDataset === dataset && !isValidating && !isCommitting)

  const handleFile = (file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result || ""))
      resetValidationState()
    }
    reader.readAsText(file)
  }

  const handleValidate = async () => {
    if (!csvText.trim()) {
      toast({ title: "CSV required", description: "Paste or upload CSV before validating." })
      return
    }
    if (!user) {
      toast({ title: "Session missing", description: "Please sign in again." })
      return
    }

    setIsValidating(true)
    setCommitResult(null)
    try {
      const data = await apiRequest<ImportBulkResponse>("/api/import-bulk", {
        method: "POST",
        body: JSON.stringify({ dataset, csv: csvText, mode: "validate" }),
      })

      setValidationResult(data)
      if (data.valid && data.validationToken) {
        setValidationToken(data.validationToken)
        setValidationExpiresAt(data.expiresAt || null)
        setValidatedDataset(dataset)
        toast({
          title: "Validation passed",
          description: `${data.rowCount || 0} rows are ready to import.`,
        })
      } else {
        setValidationToken(null)
        setValidationExpiresAt(null)
        setValidatedDataset(null)
        toast({
          title: "Validation failed",
          description: `${(data.errors || []).length} row(s) need fixes before import.`,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      setValidationToken(null)
      setValidationExpiresAt(null)
      setValidatedDataset(null)
      toast({ title: "Validation failed", description: error.message || "Failed to validate CSV", variant: "destructive" })
    } finally {
      setIsValidating(false)
    }
  }

  const handleCommit = async () => {
    if (!canCommit || !validationToken) {
      toast({ title: "Validate first", description: "Run CSV validation before committing import." })
      return
    }
    if (!user) {
      toast({ title: "Session missing", description: "Please sign in again." })
      return
    }

    setIsCommitting(true)
    try {
      const data = await apiRequest<ImportBulkResponse>("/api/import-bulk", {
        method: "POST",
        body: JSON.stringify({ dataset, mode: "commit", validationToken }),
      })
      setCommitResult(data)
      toast({ title: "Import complete", description: `${data.imported || 0} rows imported.` })
      setValidationToken(null)
      setValidationExpiresAt(null)
      setValidatedDataset(null)
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message || "Failed to import CSV", variant: "destructive" })
    } finally {
      setIsCommitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-start">
        <Button asChild variant="outline" size="sm" className="bg-white/80">
          <Link href="/dashboard" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Data Import</CardTitle>
          <CardDescription>Validate first, then commit to safely onboard tenant data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>Dataset</Label>
              <Select
                value={dataset}
                onValueChange={(value) => {
                  if (isImportDatasetId(value)) {
                    setDataset(value)
                    resetValidationState()
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose dataset" />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_DATASETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{datasetConfig.description}</p>
              <p className="text-xs text-muted-foreground">{datasetConfig.tips}</p>
            </div>
            <div className="flex items-end">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(templateCsv)
                    toast({ title: "Template copied", description: "Paste it into Excel or Google Sheets." })
                  }}
                >
                  Copy Template Headers
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" })
                    const link = document.createElement("a")
                    link.href = URL.createObjectURL(blob)
                    link.download = `${dataset}-template.csv`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    URL.revokeObjectURL(link.href)
                  }}
                >
                  Download Template
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="csv">CSV content</Label>
              <Textarea
                id="csv"
                rows={8}
                placeholder={templateCsv}
                value={csvText}
                onChange={(event) => {
                  setCsvText(event.target.value)
                  resetValidationState()
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-file">Or upload file</Label>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleValidate} disabled={isValidating || isCommitting}>
              {isValidating ? "Validating..." : "Validate CSV"}
            </Button>
            <Button onClick={handleCommit} disabled={!canCommit}>
              {isCommitting ? "Importing..." : "Commit Import"}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Commit is enabled only after successful validation for the current dataset and CSV.
            {validationToken ? (
              <span className="block">
                Validation token ready{expiresAtLabel ? ` (expires: ${expiresAtLabel})` : ""}.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>First few rows from your CSV.</CardDescription>
        </CardHeader>
        <CardContent>
          {preview?.headers?.length ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, index) => (
                    <tr key={`row-${index}`} className="border-t">
                      {preview.headers.map((_, cellIndex) => (
                        <td key={`cell-${index}-${cellIndex}`} className="px-3 py-2">
                          {row[cellIndex]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Paste CSV to see a preview.</div>
          )}
        </CardContent>
      </Card>

      {validationResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Validation Summary</CardTitle>
            <CardDescription>Fix errors before committing import.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Rows checked: {validationResult.rowCount || 0}</div>
            <div className="text-sm">Invalid rows: {validationResult.skipped || 0}</div>
            <div className="text-sm">Status: {validationResult.valid ? "Valid" : "Needs fixes"}</div>
            {validationResult.errors?.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Errors (first 10)</div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {validationResult.errors.slice(0, 10).map((err) => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No validation issues found.</div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {commitResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Import Summary</CardTitle>
            <CardDescription>Committed rows and import issues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Imported: {commitResult.imported || 0}</div>
            <div className="text-sm">Skipped: {commitResult.skipped || 0}</div>
            {commitResult.errors?.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Errors (first 10)</div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {commitResult.errors.slice(0, 10).map((err) => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No errors reported.</div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
