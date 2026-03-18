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

type SalesAggregate = { txCount: number; bags: number; kgs: number; revenue: number }

const createEmptyAggregate = (): SalesAggregate => ({ txCount: 0, bags: 0, kgs: 0, revenue: 0 })

export const buildSalesCsv = (recordsInput: SalesExportRecord[], bagWeightKg: number) => {
  const records = [...recordsInput]
  records.sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime())

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

  const detailRows = records.map((record) => [
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
  ])

  const estateSummary = new Map<SalesExportEstateCode, SalesAggregate>(
    SALES_EXPORT_ESTATE_ORDER.map((code) => [code, createEmptyAggregate()]),
  )
  const typeSummary = new Map<SalesExportCoffeeCode, SalesAggregate>(
    SALES_EXPORT_TYPE_ORDER.map((code) => [code, createEmptyAggregate()]),
  )

  records.forEach((record) => {
    const estateCode = resolveSalesEstateCode(record)
    if (estateCode) {
      const current = estateSummary.get(estateCode) || createEmptyAggregate()
      current.txCount += 1
      current.bags += toNumber(record.bags_sold)
      current.kgs += resolveSalesKgs(record, bagWeightKg)
      current.revenue += toNumber(record.revenue)
      estateSummary.set(estateCode, current)
    }

    const typeCode = resolveSalesCoffeeCode(record)
    if (typeCode) {
      const current = typeSummary.get(typeCode) || createEmptyAggregate()
      current.txCount += 1
      current.bags += toNumber(record.bags_sold)
      current.kgs += resolveSalesKgs(record, bagWeightKg)
      current.revenue += toNumber(record.revenue)
      typeSummary.set(typeCode, current)
    }
  })

  const estateRows = SALES_EXPORT_ESTATE_ORDER.map((code) => {
    const values = estateSummary.get(code) || createEmptyAggregate()
    return [
      code,
      values.txCount.toString(),
      values.bags.toFixed(2),
      values.kgs.toFixed(2),
      values.revenue.toFixed(2),
      values.bags > 0 ? (values.revenue / values.bags).toFixed(2) : "0.00",
    ]
  })

  const typeRows = SALES_EXPORT_TYPE_ORDER.map((code) => {
    const values = typeSummary.get(code) || createEmptyAggregate()
    return [
      code,
      SALES_EXPORT_TYPE_LABELS[code],
      values.txCount.toString(),
      values.bags.toFixed(2),
      values.kgs.toFixed(2),
      values.revenue.toFixed(2),
      values.bags > 0 ? (values.revenue / values.bags).toFixed(2) : "0.00",
    ]
  })

  const csvLines: string[] = []

  csvLines.push(csvRow(["1. Sales by Date"]))
  csvLines.push(csvRow(detailHeaders))
  detailRows.forEach((row) => csvLines.push(csvRow(row)))
  csvLines.push("")

  csvLines.push(csvRow(["2. Segregated by Estate"]))
  csvLines.push(csvRow(["Estate", "Transactions", "Bags Sold", "KGs Sold", "Revenue", "Avg Price / Bag"]))
  estateRows.forEach((row) => csvLines.push(csvRow(row)))
  csvLines.push("")

  csvLines.push(csvRow(["3. Segregated by Coffee Type"]))
  csvLines.push(csvRow(["Type Code", "Type Label", "Transactions", "Bags Sold", "KGs Sold", "Revenue", "Avg Price / Bag"]))
  typeRows.forEach((row) => csvLines.push(csvRow(row)))

  return csvLines.join("\n")
}
