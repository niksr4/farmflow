import { describe, expect, it } from "vitest"
import { getDataToolsSelection, exportOpsCsv } from "@/components/inventory-system/data-tools-export"

describe("getDataToolsSelection", () => {
  it("resolves both the export config and the matching import template for a dataset with one", () => {
    const selection = getDataToolsSelection("processing")
    expect(selection.exportConfig.id).toBe("processing")
    expect(selection.templateConfig?.id).toBe("processing")
    expect(selection.importHref).toBe("/settings/import?dataset=processing")
  })

  it("has no import template for an export-only dataset (reconciliation, receivables-aging, pnl-monthly)", () => {
    const selection = getDataToolsSelection("reconciliation")
    expect(selection.templateConfig).toBeNull()
    // No dataset id in the query string when there's nothing to import against.
    expect(selection.importHref).toBe("/settings/import")
  })

  it("falls back to the first export dataset for an id not in the export map", () => {
    // isExportDatasetId in the panel guards against this in practice, but the resolver itself
    // should still degrade gracefully rather than returning undefined.
    const selection = getDataToolsSelection("not-a-real-dataset" as never)
    expect(selection.exportConfig).toBeDefined()
  })
})

describe("exportOpsCsv", () => {
  const baseInput = {
    dataset: "processing" as const,
    exportConfig: { id: "processing" as const, label: "Processing Records", description: "" },
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    isPreviewMode: false,
  }

  it("surfaces the server's error message when the export fails", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "No processing records in range" }), { status: 500 })
    await expect(exportOpsCsv({ ...baseInput, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      "No processing records in range",
    )
  })

  it("falls back to a generic message when the failure response isn't JSON", async () => {
    const fetchImpl = async () => new Response("<html>502</html>", { status: 502 })
    await expect(exportOpsCsv({ ...baseInput, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      "Export failed",
    )
  })

  it("falls back to a generic message when the JSON body has no usable error field", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ ok: false }), { status: 400 })
    await expect(exportOpsCsv({ ...baseInput, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      "Export failed",
    )
  })

  it("omits the date range params for the inventory dataset, which is a point-in-time snapshot", async () => {
    let capturedUrl: string | null = null
    const fetchImpl = async (url: string | URL) => {
      capturedUrl = String(url)
      return new Response("<html>502</html>", { status: 502 })
    }
    await exportOpsCsv({
      ...baseInput,
      dataset: "inventory",
      fetchImpl: fetchImpl as typeof fetch,
    }).catch(() => {
      // We only care about the request that was made, not the (expected) failure.
    })
    expect(capturedUrl).not.toBeNull()
    expect(capturedUrl).not.toContain("startDate")
    expect(capturedUrl).not.toContain("endDate")
  })

  it("includes the preview tenant id only when in preview mode with a tenant selected", async () => {
    let capturedUrl: string | null = null
    const fetchImpl = async (url: string | URL) => {
      capturedUrl = String(url)
      return new Response("<html>502</html>", { status: 502 })
    }
    await exportOpsCsv({
      ...baseInput,
      isPreviewMode: true,
      previewTenantId: "tenant-123",
      fetchImpl: fetchImpl as typeof fetch,
    }).catch(() => {})
    expect(capturedUrl).toContain("tenantId=tenant-123")
  })
})
