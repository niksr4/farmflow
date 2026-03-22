import { describe, expect, it } from "vitest"
import {
  buildAccountsCsvFilename,
  buildAccountsExportDateSuffix,
  buildAccountsQifFilename,
  buildAccountsXlsxFilename,
  normalizeAccountsExportFormat,
  normalizeAccountsInterchangeFormat,
} from "../lib/accounts-export"

describe("accounts export helpers", () => {
  it("maps legacy CIF requests to QIF", () => {
    expect(normalizeAccountsExportFormat("cif")).toBe("qif")
    expect(normalizeAccountsInterchangeFormat("cif")).toBe("qif")
  })

  it("keeps CSV requests as CSV", () => {
    expect(normalizeAccountsExportFormat("csv")).toBe("csv")
  })

  it("keeps XLSX requests as XLSX", () => {
    expect(normalizeAccountsExportFormat("xlsx")).toBe("xlsx")
  })

  it("builds date suffix and filenames consistently", () => {
    expect(buildAccountsExportDateSuffix("2026-01-01", "2026-01-31")).toBe("2026-01-01_to_2026-01-31")
    expect(buildAccountsCsvFilename("2026-01-01", "2026-01-31")).toBe("accounts_summary_2026-01-01_to_2026-01-31.csv")
    expect(buildAccountsXlsxFilename("2026-01-01", "2026-01-31")).toBe("accounts_summary_2026-01-01_to_2026-01-31.xlsx")
    expect(buildAccountsQifFilename("2026-01-01", "2026-01-31")).toBe("accounts_export_2026-01-01_to_2026-01-31.qif")
  })

  it("falls back to all_entries when no date range is provided", () => {
    expect(buildAccountsExportDateSuffix("", "")).toBe("all_entries")
    expect(buildAccountsCsvFilename("", "")).toBe("accounts_summary_all_entries.csv")
    expect(buildAccountsXlsxFilename("", "")).toBe("accounts_summary_all_entries.xlsx")
    expect(buildAccountsQifFilename("", "")).toBe("accounts_export_all_entries.qif")
  })
})
