"use client"

import React from "react"
import Link from "next/link"
import { Coins, Download, FileText, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  EXPORT_DATASETS,
  isExportDatasetId,
  type ExportDatasetConfig,
  type ExportDatasetId,
  type ImportDatasetConfig,
} from "@/lib/data-tools"
import type { AccountsExportFormat } from "@/lib/accounts-export"

type OpsExportFailure = {
  dataset: ExportDatasetId
  message: string
  occurredAt: number
}

type Props = {
  dataToolsDataset: ExportDatasetId
  onDatasetChange: (dataset: ExportDatasetId) => void
  isExporting: boolean
  exportConfig: ExportDatasetConfig
  templateConfig: ImportDatasetConfig | null
  importHref: string
  canShowAccounts: boolean
  onExport: (format: "csv" | "xlsx") => void
  onAccountsExport: (format: AccountsExportFormat) => void
  onDownloadTemplate: () => void
  exportFailure: OpsExportFailure | null
  exportFailureLabel: string
  onDismissFailure: () => void
  onRetryExport: () => void
}

export default function DataToolsPanel({
  dataToolsDataset,
  onDatasetChange,
  isExporting,
  exportConfig,
  templateConfig,
  importHref,
  canShowAccounts,
  onExport,
  onAccountsExport,
  onDownloadTemplate,
  exportFailure,
  exportFailureLabel,
  onDismissFailure,
  onRetryExport,
}: Props) {
  return (
    <Card className="mb-6 border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white/95">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Exports & Import</CardTitle>
            <CardDescription>
              One clear export hub: CSV and XLSX for operations, plus CSV, XLSX, and QIF for accounts.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-emerald-200 bg-white text-emerald-700">
            Mobile-first export hub
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-3">
          <Label className="text-xs uppercase tracking-[0.16em] text-stone-500">Operations export</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Select
                value={dataToolsDataset}
                onValueChange={(value) => {
                  if (isExportDatasetId(value)) onDatasetChange(value)
                }}
              >
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[40vh] overflow-y-auto">
                  {EXPORT_DATASETS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{exportConfig.description}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={() => void onExport("csv")} disabled={isExporting}>
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exporting…" : "CSV"}
              </Button>
              <Button variant="outline" className="bg-white" onClick={() => void onExport("xlsx")} disabled={isExporting}>
                <Download className="mr-2 h-4 w-4" />
                XLSX
              </Button>
            </div>
          </div>
          {templateConfig && (
            <p className="text-xs text-muted-foreground">
              Columns: {templateConfig.template.join(", ")}
            </p>
          )}
        </div>

        {canShowAccounts ? (
          <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-2">
            <Label className="text-xs uppercase tracking-[0.16em] text-stone-500">Accounts export</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="bg-white" onClick={() => onAccountsExport("csv")}>
                <FileText className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" className="bg-white" onClick={() => onAccountsExport("xlsx")}>
                <FileText className="mr-2 h-4 w-4" />
                XLSX
              </Button>
              <Button variant="outline" className="bg-white" onClick={() => onAccountsExport("qif")}>
                <Coins className="mr-2 h-4 w-4" />
                QIF
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-2 text-xs text-muted-foreground">
            Accounts module is disabled for this tenant.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onDownloadTemplate} disabled={!templateConfig} className="bg-white" size="sm">
            <FileText className="mr-2 h-4 w-4" />
            Download template
          </Button>
          <Button asChild variant="outline" className="bg-white" size="sm">
            <Link href={importHref}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Link>
          </Button>
        </div>

        {exportFailure && (
          <div data-testid="ops-export-failure-banner" className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm">
            <p className="font-medium text-amber-900">Ops export failed</p>
            <p className="mt-1 text-xs text-amber-800">
              {exportFailureLabel || "Selected dataset"}: {exportFailure.message}
              {exportFailure.occurredAt > 0
                ? ` (at ${new Date(exportFailure.occurredAt).toLocaleTimeString()})`
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="bg-white" onClick={onRetryExport}>
                Retry export
              </Button>
              <Button size="sm" variant="ghost" className="text-amber-700" onClick={onDismissFailure}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
