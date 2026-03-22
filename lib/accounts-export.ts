export type AccountsExportFormat = "csv" | "xlsx" | "qif"
export type LegacyAccountsExportFormat = AccountsExportFormat | "cif"

export const normalizeAccountsExportFormat = (value: unknown): AccountsExportFormat => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()

  if (normalized === "csv") return "csv"
  if (normalized === "xlsx" || normalized === "excel") return "xlsx"
  if (normalized === "qif" || normalized === "cif") return "qif"
  return "csv"
}

export const normalizeAccountsInterchangeFormat = (_value: unknown): "qif" => "qif"

export const buildAccountsExportDateSuffix = (startDate?: string, endDate?: string) =>
  startDate && endDate ? `${startDate}_to_${endDate}` : "all_entries"

export const buildAccountsCsvFilename = (startDate?: string, endDate?: string) =>
  `accounts_summary_${buildAccountsExportDateSuffix(startDate, endDate)}.csv`

export const buildAccountsXlsxFilename = (startDate?: string, endDate?: string) =>
  `accounts_summary_${buildAccountsExportDateSuffix(startDate, endDate)}.xlsx`

export const buildAccountsQifFilename = (startDate?: string, endDate?: string) =>
  `accounts_export_${buildAccountsExportDateSuffix(startDate, endDate)}.qif`
