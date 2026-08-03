import { describe, expect, it } from "vitest"
import {
  IMPORT_DATASETS,
  EXPORT_DATASETS,
  IMPORT_DATASET_MAP,
  EXPORT_DATASET_MAP,
  TAB_DEFAULT_EXPORT_DATASET,
  isImportDatasetId,
  isExportDatasetId,
  datasetTemplateCsv,
} from "@/lib/data-tools"

describe("isImportDatasetId / isExportDatasetId", () => {
  it("accepts every declared import dataset id", () => {
    for (const dataset of IMPORT_DATASETS) {
      expect(isImportDatasetId(dataset.id)).toBe(true)
    }
  })

  it("accepts every declared export dataset id", () => {
    for (const dataset of EXPORT_DATASETS) {
      expect(isExportDatasetId(dataset.id)).toBe(true)
    }
  })

  it("rejects unknown, null, and empty values", () => {
    expect(isImportDatasetId("not-a-real-dataset")).toBe(false)
    expect(isImportDatasetId(null)).toBe(false)
    expect(isImportDatasetId(undefined)).toBe(false)
    expect(isImportDatasetId("")).toBe(false)
    expect(isExportDatasetId("not-a-real-dataset")).toBe(false)
    expect(isExportDatasetId(null)).toBe(false)
  })
})

describe("dataset maps", () => {
  it("keys IMPORT_DATASET_MAP by each dataset's own id", () => {
    for (const dataset of IMPORT_DATASETS) {
      expect(IMPORT_DATASET_MAP[dataset.id]).toBe(dataset)
    }
  })

  it("keys EXPORT_DATASET_MAP by each dataset's own id", () => {
    for (const dataset of EXPORT_DATASETS) {
      expect(EXPORT_DATASET_MAP[dataset.id]).toBe(dataset)
    }
  })

  it("every import dataset id also has an export dataset entry", () => {
    // ExportDatasetId is a superset of ImportDatasetId per the type, but the two arrays are
    // maintained by hand — verify that hasn't drifted.
    for (const dataset of IMPORT_DATASETS) {
      expect(EXPORT_DATASET_MAP[dataset.id]).toBeTruthy()
    }
  })
})

describe("TAB_DEFAULT_EXPORT_DATASET", () => {
  it("only maps to dataset ids that actually exist in EXPORT_DATASET_MAP", () => {
    for (const datasetId of Object.values(TAB_DEFAULT_EXPORT_DATASET)) {
      expect(EXPORT_DATASET_MAP[datasetId as keyof typeof EXPORT_DATASET_MAP]).toBeTruthy()
    }
  })
})

describe("datasetTemplateCsv", () => {
  it("builds a one-line, comma-joined, newline-terminated header row", () => {
    const csv = datasetTemplateCsv("rainfall")
    expect(csv).toBe("record_date,inches,notes\n")
  })

  it("produces a header matching the dataset's declared template for every dataset", () => {
    for (const dataset of IMPORT_DATASETS) {
      const csv = datasetTemplateCsv(dataset.id)
      expect(csv).toBe(`${dataset.template.join(",")}\n`)
    }
  })
})
