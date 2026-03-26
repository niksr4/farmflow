import { format } from "date-fns"

import { resolveSalesKgs } from "./sales-math"

type NumberLike = number | string | null | undefined

export type SalesExportRecord = {
  sale_date: string
  batch_no?: string | null
  location?: string | null
  location_name?: string | null
  location_code?: string | null
  estate?: string | null
  lot_id?: string | null
  coffee_type?: string | null
  bag_type?: string | null
  buyer_name?: string | null
  bags_sold?: NumberLike
  price_per_bag?: NumberLike
  revenue?: NumberLike
  sold_kgs?: NumberLike
  kgs_received?: NumberLike
  kgs?: NumberLike
  weight_kgs?: NumberLike
  kgs_sent?: NumberLike
  bank_account?: string | null
  notes?: string | null
}

export const SALES_EXPORT_ESTATE_ORDER = ["MV", "HFA", "HFB", "HFC"] as const
export type SalesExportEstateCode = (typeof SALES_EXPORT_ESTATE_ORDER)[number]

export const SALES_EXPORT_TYPE_ORDER = ["AP", "AC", "RP", "RC"] as const
export type SalesExportCoffeeCode = (typeof SALES_EXPORT_TYPE_ORDER)[number]

const SALES_EXPORT_TYPE_LABELS: Record<SalesExportCoffeeCode, string> = {
  AP: "Arabica Parchment",
  AC: "Arabica Cherry",
  RP: "Robusta Parchment",
  RC: "Robusta Cherry",
}

const SALES_EXPORT_ESTATE_ALIASES: Record<SalesExportEstateCode, string[]> = {
  MV: ["MV", "MAINVILLA"],
  HFA: ["HFA", "HONEYFARMA"],
  HFB: ["HFB", "HONEYFARMB"],
  HFC: ["HFC", "HONEYFARMC"],
}

const toNumber = (value: NumberLike) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeToken = (value: string | null | undefined) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")

const normalizeCoffeeType = (value: string | null | undefined) => {
  const normalized = String(value || "").toLowerCase()
  if (normalized.includes("arabica")) return "arabica"
  if (normalized.includes("robusta")) return "robusta"
  return "other"
}

const normalizeBagType = (value: string | null | undefined) =>
  String(value || "").toLowerCase().includes("cherry") ? "cherry" : "parchment"

const formatBagTypeLabel = (value: string | null | undefined) =>
  normalizeBagType(value) === "cherry" ? "Dry Cherry" : "Dry Parchment"

const csvEscape = (value: string | number | null | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`
const csvRow = (values: Array<string | number | null | undefined>) => values.map(csvEscape).join(",")

const getEstateTokens = (record: SalesExportRecord) =>
  [record.location_code, record.location_name, record.location, record.estate].map(normalizeToken).filter(Boolean)

export const resolveSalesEstateCode = (record: SalesExportRecord): SalesExportEstateCode | null => {
  const candidates = getEstateTokens(record)
  for (const candidate of candidates) {
    if (SALES_EXPORT_ESTATE_ORDER.includes(candidate as SalesExportEstateCode)) {
      return candidate as SalesExportEstateCode
    }
    for (const code of SALES_EXPORT_ESTATE_ORDER) {
      if (SALES_EXPORT_ESTATE_ALIASES[code].some((alias) => candidate === alias || candidate.startsWith(alias))) {
        return code
      }
    }
  }
  return null
}

const resolveSalesEstateDisplay = (record: SalesExportRecord) => resolveSalesEstateCode(record) || getEstateTokens(record)[0] || "UNASSIGNED"

const resolveSalesCoffeeCode = (record: SalesExportRecord): SalesExportCoffeeCode | null => {
  const coffee = normalizeCoffeeType(record.coffee_type)
  const bag = normalizeBagType(record.bag_type)
  if (coffee === "arabica" && bag === "parchment") return "AP"
  if (coffee === "arabica" && bag === "cherry") return "AC"
  if (coffee === "robusta" && bag === "parchment") return "RP"
  if (coffee === "robusta" && bag === "cherry") return "RC"
  return null
}


const ESTATE_SORT_ORDER: Record<string, number> = Object.fromEntries(
  SALES_EXPORT_ESTATE_ORDER.map((code, i) => [code, i]),
)
const TYPE_SORT_ORDER: Record<string, number> = Object.fromEntries(
  SALES_EXPORT_TYPE_ORDER.map((code, i) => [code, i]),
)

export const buildSalesCsv = (recordsInput: SalesExportRecord[], bagWeightKg: number) => {
  const records = [...recordsInput]

  const detailHeaders = [
    "Date",
    "Batch Reference",
    "Estate",
    "Coffee Type",
    "Bags Sold",
    "Bag Type",
    "KGs Sold",
    "Buyer",
    "Price/Bag",
    "Revenue",
    "Bank Account",
    "Notes",
  ]

  const toDetailRow = (record: SalesExportRecord) => [
    format(new Date(record.sale_date), "yyyy-MM-dd"),
    record.batch_no || "",
    resolveSalesEstateDisplay(record),
    record.coffee_type || "",
    toNumber(record.bags_sold).toString(),
    formatBagTypeLabel(record.bag_type),
    resolveSalesKgs(record, bagWeightKg).toFixed(2),
    record.buyer_name || "",
    toNumber(record.price_per_bag).toString(),
    toNumber(record.revenue).toString(),
    record.bank_account || "",
    record.notes || "",
  ]

  // Section 1: sorted by date
  const byDate = [...records].sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime())

  // Section 2: sorted by estate (C column), then date
  const byEstate = [...records].sort((a, b) => {
    const ea = ESTATE_SORT_ORDER[resolveSalesEstateCode(a) ?? ""] ?? 999
    const eb = ESTATE_SORT_ORDER[resolveSalesEstateCode(b) ?? ""] ?? 999
    if (ea !== eb) return ea - eb
    return new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime()
  })

  // Section 3: sorted by coffee type code (AP/AC/RP/RC — derived from coffee type + bag type), then date
  const byType = [...records].sort((a, b) => {
    const ta = TYPE_SORT_ORDER[resolveSalesCoffeeCode(a) ?? ""] ?? 999
    const tb = TYPE_SORT_ORDER[resolveSalesCoffeeCode(b) ?? ""] ?? 999
    if (ta !== tb) return ta - tb
    return new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime()
  })

  const csvLines: string[] = []

  csvLines.push(csvRow(["1. All Transactions — by Date"]))
  csvLines.push(csvRow(detailHeaders))
  byDate.forEach((r) => csvLines.push(csvRow(toDetailRow(r))))
  csvLines.push("")

  csvLines.push(csvRow(["2. All Transactions — by Estate (HFA, HFB, HFC, MV)"]))
  csvLines.push(csvRow(detailHeaders))
  byEstate.forEach((r) => csvLines.push(csvRow(toDetailRow(r))))
  csvLines.push("")

  csvLines.push(csvRow(["3. All Transactions — by Coffee Type (AP, AC, RP, RC)"]))
  csvLines.push(csvRow(detailHeaders))
  byType.forEach((r) => csvLines.push(csvRow(toDetailRow(r))))

  return csvLines.join("\n")
}
