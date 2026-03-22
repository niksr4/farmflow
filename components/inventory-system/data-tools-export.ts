import {
  datasetTemplateCsv,
  EXPORT_DATASETS,
  EXPORT_DATASET_MAP,
  IMPORT_DATASET_MAP,
  type ExportDatasetConfig,
  type ExportDatasetId,
  type ImportDatasetConfig,
} from "@/lib/data-tools"

export type DataToolsSelection = {
  exportConfig: ExportDatasetConfig
  templateConfig: ImportDatasetConfig | null
  importHref: string
}

const resolveTemplateConfig = (dataset: ExportDatasetId): ImportDatasetConfig | null => {
  if (!(dataset in IMPORT_DATASET_MAP)) return null
  return IMPORT_DATASET_MAP[dataset as keyof typeof IMPORT_DATASET_MAP]
}

export const getDataToolsSelection = (dataset: ExportDatasetId): DataToolsSelection => {
  const exportConfig = EXPORT_DATASET_MAP[dataset] || EXPORT_DATASETS[0]
  const templateConfig = resolveTemplateConfig(dataset)
  const importHref = templateConfig ? `/settings/import?dataset=${templateConfig.id}` : "/settings/import"
  return {
    exportConfig,
    templateConfig,
    importHref,
  }
}

const triggerFileDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const resolveErrorMessage = (payload: unknown) => {
  if (typeof payload !== "object" || !payload) return "Export failed"
  if (!("error" in payload)) return "Export failed"
  const error = (payload as { error?: unknown }).error
  return typeof error === "string" && error.trim() ? error : "Export failed"
}

export const downloadDataToolsTemplate = (templateConfig: ImportDatasetConfig) => {
  const templateCsv = datasetTemplateCsv(templateConfig.id)
  const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" })
  triggerFileDownload(blob, `${templateConfig.id}-template.csv`)
}

export type ExportOpsCsvInput = {
  dataset: ExportDatasetId
  exportConfig: ExportDatasetConfig
  format?: "csv" | "xlsx"
  startDate: string
  endDate: string
  isPreviewMode: boolean
  previewTenantId?: string | null
  fetchImpl?: typeof fetch
}

export type ExportOpsCsvResult = {
  wasTruncated: boolean
  maxRows: number
  returnedRows: number
  filename: string
  label: string
}

export const exportOpsCsv = async ({
  dataset,
  exportConfig,
  format = "csv",
  startDate,
  endDate,
  isPreviewMode,
  previewTenantId,
  fetchImpl = fetch,
}: ExportOpsCsvInput): Promise<ExportOpsCsvResult> => {
  const params = new URLSearchParams({
    dataset,
    format,
  })

  if (dataset !== "inventory") {
    params.set("startDate", startDate)
    params.set("endDate", endDate)
  }

  if (isPreviewMode && previewTenantId) {
    params.set("tenantId", previewTenantId)
  }

  const response = await fetchImpl(`/api/exports/ops?${params.toString()}`, { cache: "no-store" })
  if (!response.ok) {
    let errorMessage = "Export failed"
    try {
      const payload = (await response.json()) as unknown
      errorMessage = resolveErrorMessage(payload)
    } catch {
      // Keep generic message if response body is not JSON.
    }
    throw new Error(errorMessage)
  }

  const wasTruncated = response.headers.get("x-export-truncated") === "1"
  const maxRows = Number(response.headers.get("x-export-max-rows") || "0")
  const returnedRows = Number(response.headers.get("x-export-returned-rows") || "0")

  const blob = await response.blob()
  const contentDisposition = response.headers.get("content-disposition") || ""
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
  const fallbackName =
    dataset === "inventory" ? `${dataset}-snapshot.${format}` : `${dataset}-${startDate}-to-${endDate}.${format}`
  const filename = filenameMatch?.[1] || fallbackName

  triggerFileDownload(blob, filename)

  return {
    wasTruncated,
    maxRows,
    returnedRows,
    filename,
    label: exportConfig.label,
  }
}
