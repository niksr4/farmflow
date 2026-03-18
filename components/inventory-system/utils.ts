import { formatDateForDisplay } from "@/lib/date-utils"
import type { ExportDatasetId } from "@/lib/data-tools"
import { IMPORT_DATASET_MAP } from "@/lib/data-tools"
import type { Transaction } from "@/lib/inventory-types"

export const supportsImportTemplate = (dataset: ExportDatasetId): dataset is keyof typeof IMPORT_DATASET_MAP =>
  dataset in IMPORT_DATASET_MAP

export function parseCustomDateString(dateString: string | undefined | null): Date | null {
  if (!dateString || typeof dateString !== "string") return null
  const iso = Date.parse(dateString)
  if (!isNaN(iso)) return new Date(iso)

  const parts = dateString.split(" ")
  const dateParts = parts[0].split("/")
  const timeParts = parts[1] ? parts[1].split(":") : ["00", "00"]

  if (dateParts.length !== 3) return null

  const day = Number.parseInt(dateParts[0], 10)
  const month = Number.parseInt(dateParts[1], 10) - 1
  const year = Number.parseInt(dateParts[2], 10)
  const hour = Number.parseInt(timeParts[0], 10)
  const minute = Number.parseInt(timeParts[1], 10)

  if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) {
    return null
  }

  return new Date(year, month, day, hour, minute)
}

export const formatDate = (dateString?: string | null) => {
  if (!dateString) return ""
  const parsed = parseCustomDateString(dateString)
  return formatDateForDisplay(parsed ?? dateString)
}

export const safeGet = <T,>(value: T | null | undefined, fallback: T): T => {
  return value !== null && value !== undefined ? value : fallback
}

export const parseJsonResponse = async (res: Response) => {
  const text = await res.text()
  if (!text) {
    return { json: null as any, text: "" }
  }
  try {
    return { json: JSON.parse(text), text }
  } catch {
    return { json: null as any, text }
  }
}

export const createDefaultTransaction = (): Transaction => {
  return {
    item_type: "",
    quantity: "",
    transaction_type: "deplete",
    notes: "",
    transaction_date: new Date().toISOString(),
    user_id: "unknown",
    price: 0,
    total_cost: 0,
    unit: "kg",
    location_id: null,
    id: undefined as any,
  } as Transaction
}
