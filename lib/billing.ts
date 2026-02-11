export type GstState = {
  code: string
  name: string
}

export const GST_STATES: GstState[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh (New)" },
  { code: "38", name: "Ladakh" },
]

export type InvoiceLineInput = {
  description: string
  hsn?: string | null
  quantity: number
  unitPrice: number
  taxRate: number
}

export type InvoiceTotals = {
  subtotal: number
  taxTotal: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  total: number
  isInterState: boolean
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const isInterStateSupply = (supplyState?: string | null, placeOfSupply?: string | null) => {
  if (!supplyState || !placeOfSupply) return false
  return supplyState.trim() !== placeOfSupply.trim()
}

export const computeInvoiceTotals = (
  lines: InvoiceLineInput[],
  supplyState?: string | null,
  placeOfSupply?: string | null,
): InvoiceTotals => {
  const isInterState = isInterStateSupply(supplyState, placeOfSupply)
  let subtotal = 0
  let taxTotal = 0
  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0

  lines.forEach((line) => {
    const lineSubtotal = line.quantity * line.unitPrice
    const lineTax = (lineSubtotal * (line.taxRate || 0)) / 100
    subtotal += lineSubtotal
    taxTotal += lineTax
    if (isInterState) {
      igstAmount += lineTax
    } else {
      const splitTax = lineTax / 2
      cgstAmount += splitTax
      sgstAmount += splitTax
    }
  })

  subtotal = roundMoney(subtotal)
  taxTotal = roundMoney(taxTotal)
  cgstAmount = roundMoney(cgstAmount)
  sgstAmount = roundMoney(sgstAmount)
  igstAmount = roundMoney(igstAmount)
  const total = roundMoney(subtotal + taxTotal)

  return {
    subtotal,
    taxTotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    total,
    isInterState,
  }
}

export const formatInvoiceNumber = (tenantId?: string | null) => {
  const date = new Date()
  const pad = (value: number) => value.toString().padStart(2, "0")
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const suffix = Math.floor(Math.random() * 9000) + 1000
  const tenantSuffix = tenantId ? tenantId.slice(0, 4).toUpperCase() : "FF"
  return `INV-${tenantSuffix}-${stamp}-${suffix}`
}
