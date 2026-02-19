"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { parseCsv } from "@/lib/csv"
import { apiRequest } from "@/lib/api-client"
import { ArrowLeft } from "lucide-react"

const DATASETS = [
  {
    id: "processing",
    label: "Processing Records",
    description: "Import daily coffee processing by location.",
    template: [
      "process_date",
      "location",
      "coffee_type",
      "crop_today",
      "ripe_today",
      "green_today",
      "float_today",
      "wet_parchment",
      "dry_parch",
      "dry_cherry",
      "moisture_pct",
      "lot_id",
      "notes",
    ],
    tips: "Location can be HF/MV/PG or full name. Coffee type: Arabica/Robusta.",
  },
  {
    id: "dispatch",
    label: "Dispatch Records",
    description: "Import dispatches (bags sent and KGs received).",
    template: [
      "dispatch_date",
      "location",
      "coffee_type",
      "bag_type",
      "bags_dispatched",
      "kgs_received",
      "lot_id",
      "notes",
    ],
    tips: "Bag type: Dry Parchment or Dry Cherry.",
  },
  {
    id: "sales",
    label: "Sales Records",
    description: "Import sales (bags sold and pricing).",
    template: [
      "sale_date",
      "location",
      "coffee_type",
      "bag_type",
      "bags_sold",
      "price_per_bag",
      "buyer_name",
      "batch_no",
      "lot_id",
      "notes",
    ],
    tips: "You can use price_per_kg instead of price_per_bag.",
  },
  {
    id: "pepper",
    label: "Pepper Records",
    description: "Import pepper processing by location.",
    template: ["process_date", "location", "kg_picked", "green_pepper", "dry_pepper", "notes"],
    tips: "If % columns are omitted, they are calculated from picked KGs.",
  },
  {
    id: "rainfall",
    label: "Rainfall Records",
    description: "Import rainfall measurements.",
    template: ["record_date", "inches", "notes"],
    tips: "You can also use mm or millimeters columns.",
  },
  {
    id: "transactions",
    label: "Inventory Transactions",
    description: "Import inventory transactions (restock/deplete).",
    template: ["transaction_date", "item_type", "transaction_type", "quantity", "price", "notes"],
    tips: "Transaction type can be restock or deplete.",
  },
  {
    id: "inventory",
    label: "Opening Inventory",
    description: "Import opening inventory balances.",
    template: ["item_type", "unit", "quantity", "price", "notes"],
    tips: "Creates a restock transaction for each item.",
  },
  {
    id: "labor",
    label: "Labor Deployments",
    description: "Import labor deployments and costs.",
    template: [
      "deployment_date",
      "location",
      "code",
      "hf_laborers",
      "hf_cost_per_laborer",
      "outside_laborers",
      "outside_cost_per_laborer",
      "total_cost",
      "notes",
    ],
    tips: "total_cost is optional and will be computed if missing.",
  },
  {
    id: "expenses",
    label: "Other Expenses",
    description: "Import expense entries.",
    template: ["entry_date", "location", "code", "total_amount", "notes"],
    tips: "Use the account activity code for `code`.",
  },
]

export default function ImportPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [dataset, setDataset] = useState<string>(DATASETS[0].id)
  const [csvText, setCsvText] = useState<string>("")
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<any>(null)

  const datasetConfig = useMemo(() => DATASETS.find((item) => item.id === dataset) || DATASETS[0], [dataset])
  const preview = useMemo(() => {
    if (!csvText.trim()) return null
    try {
      return parseCsv(csvText)
    } catch {
      return null
    }
  }, [csvText])

  const templateCsv = useMemo(() => `${datasetConfig.template.join(",")}` + "\n", [datasetConfig])

  const handleFile = (file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result || ""))
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast({ title: "CSV required", description: "Paste or upload CSV before importing." })
      return
    }
    if (!user) {
      toast({ title: "Session missing", description: "Please sign in again." })
      return
    }

    setIsImporting(true)
    setResult(null)
    try {
      const data = await apiRequest<{ success: boolean; imported: number; skipped: number; errors?: any[] }>(
        "/api/import-bulk",
        {
          method: "POST",
          body: JSON.stringify({ dataset, csv: csvText }),
        },
      )
      setResult(data)
      toast({ title: "Import complete", description: `${data.imported || 0} rows imported.` })
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message || "Failed to import CSV", variant: "destructive" })
    } finally {
      setIsImporting(false)
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
          <CardDescription>Upload CSV data to onboard a new tenant faster.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
            <div className="space-y-2">
              <Label>Dataset</Label>
              <Select value={dataset} onValueChange={setDataset}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose dataset" />
                </SelectTrigger>
                <SelectContent>
                  {DATASETS.map((item) => (
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
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(templateCsv)
                  toast({ title: "Template copied", description: "Paste it into Excel or Google Sheets." })
                }}
              >
                Copy Template Headers
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="csv">CSV content</Label>
              <Textarea
                id="csv"
                rows={8}
                placeholder={templateCsv}
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
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

          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? "Importing..." : "Run Import"}
          </Button>
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

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Import Summary</CardTitle>
            <CardDescription>Review imported rows and any issues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Imported: {result.imported || 0}</div>
            <div className="text-sm">Skipped: {result.skipped || 0}</div>
            {result.errors?.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Errors (first 10)</div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {result.errors.slice(0, 10).map((err: any) => (
                    <li key={`${err.row}-${err.message}`}>Row {err.row}: {err.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No errors reported.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
