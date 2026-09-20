/**
 * CSV assembly for the operations export.
 *
 * Moved out of app/api/exports/ops/route.ts verbatim — 190 lines of pure formatting ahead of the
 * loaders and the handler in a 997-line file. Nothing here touches the database.
 *
 * These produce a file an estate opens in Excel and reconciles against. Quoting is the boring
 * half (a comma in a buyer name splits a row; an unescaped quote corrupts every column after it)
 * and the two matrix builders are the interesting half — they RESHAPE data, and a reshape that
 * silently drops or overwrites a value looks exactly like an estate that never recorded it.
 */

/** Matches the route's own YYYY-MM-DD guard; the matrix skips anything that is not a plain date. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

export const toCsvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
export const toCsvLine = (values: unknown[]) => values.map((value) => toCsvCell(value)).join(",")
export const toCsv = (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return ""
  const headers = Object.keys(rows[0])
  const lines = [headers.map(toCsvCell).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => toCsvCell((row as any)[header])).join(","))
  }
  return lines.join("\n")
}
export const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatPepperPct = (numerator: number, denominator: number) =>
  denominator > 0 ? ((numerator / denominator) * 100).toFixed(2) : "0.00"

export const buildPepperByLocationCsv = (rows: Array<Record<string, unknown>>) => {
  const grouped = new Map<string, Array<Record<string, unknown>>>()
  rows.forEach((row) => {
    const location = String((row as any).location || "Unassigned").trim() || "Unassigned"
    const groupRows = grouped.get(location) || []
    groupRows.push(row)
    grouped.set(location, groupRows)
  })

  const locationLabels = [...grouped.keys()].sort((a, b) => a.localeCompare(b))
  const lines = [toCsvLine(["Location", "Date", "KG Picked", "Green Pepper (kg)", "Green %", "Dry Pepper (kg)", "Dry %", "Notes"])]
  const overallTotals = {
    kgPicked: 0,
    greenPepper: 0,
    dryPepper: 0,
  }

  locationLabels.forEach((locationLabel) => {
    const locationRows = [...(grouped.get(locationLabel) || [])].sort((a, b) =>
      String((a as any).process_date || "").localeCompare(String((b as any).process_date || "")),
    )
    const locationTotals = {
      kgPicked: 0,
      greenPepper: 0,
      dryPepper: 0,
    }

    locationRows.forEach((row) => {
      const kgPicked = toFiniteNumber((row as any).kg_picked)
      const greenPepper = toFiniteNumber((row as any).green_pepper)
      const dryPepper = toFiniteNumber((row as any).dry_pepper)
      const rowGreenPctValue = toFiniteNumber((row as any).green_pepper_percent)
      const rowDryPctValue = toFiniteNumber((row as any).dry_pepper_percent)
      const greenPct = rowGreenPctValue > 0 ? rowGreenPctValue : kgPicked > 0 ? (greenPepper / kgPicked) * 100 : 0
      const dryPct = rowDryPctValue > 0 ? rowDryPctValue : greenPepper > 0 ? (dryPepper / greenPepper) * 100 : 0

      locationTotals.kgPicked += kgPicked
      locationTotals.greenPepper += greenPepper
      locationTotals.dryPepper += dryPepper

      lines.push(
        toCsvLine([
          locationLabel,
          String((row as any).process_date || "").slice(0, 10),
          kgPicked.toFixed(2),
          greenPepper.toFixed(2),
          greenPct.toFixed(2),
          dryPepper.toFixed(2),
          dryPct.toFixed(2),
          String((row as any).notes || ""),
        ]),
      )
    })

    overallTotals.kgPicked += locationTotals.kgPicked
    overallTotals.greenPepper += locationTotals.greenPepper
    overallTotals.dryPepper += locationTotals.dryPepper

    lines.push(
      toCsvLine([
        `TOTAL - ${locationLabel}`,
        "",
        locationTotals.kgPicked.toFixed(2),
        locationTotals.greenPepper.toFixed(2),
        formatPepperPct(locationTotals.greenPepper, locationTotals.kgPicked),
        locationTotals.dryPepper.toFixed(2),
        formatPepperPct(locationTotals.dryPepper, locationTotals.greenPepper),
        "",
      ]),
    )
    lines.push("")
  })

  lines.push(
    toCsvLine([
      "TOTAL OF TOTALS",
      "",
      overallTotals.kgPicked.toFixed(2),
      overallTotals.greenPepper.toFixed(2),
      formatPepperPct(overallTotals.greenPepper, overallTotals.kgPicked),
      overallTotals.dryPepper.toFixed(2),
      formatPepperPct(overallTotals.dryPepper, overallTotals.greenPepper),
      "",
    ]),
  )

  return lines.join("\n")
}

export const buildRainfallMatrixCsv = (
  rows: Array<Record<string, unknown>>,
  startDate: string,
  endDate: string,
) => {
  const valuesByYear = new Map<number, Map<string, { display: string; value: number; n: number }>>()
  rows.forEach((row) => {
    const isoDate = String((row as any).record_date || "").slice(0, 10)
    if (!DATE_PATTERN.test(isoDate)) return

    const year = Number(isoDate.slice(0, 4))
    if (!Number.isFinite(year)) return

    const inchesRaw = Math.trunc(toFiniteNumber((row as any).inches))
    const centsRaw = Math.round(toFiniteNumber((row as any).cents))
    const inches = Math.max(0, inchesRaw)
    const cents = Math.max(0, Math.min(99, centsRaw))
    const value = inches + cents / 100
    const display = `${inches}.${String(cents).padStart(2, "0")}`
    const yearValues = valuesByYear.get(year) || new Map<string, { display: string; value: number; n: number }>()
    // Average the gauges. This was first-one-wins, which printed one estate's reading as the
    // property's and dropped the other without trace -- in a file somebody archives. A day x month
    // matrix has one cell per date, so the collapse has to happen here (scripts/147, lib/rainfall.ts).
    const prior = yearValues.get(isoDate)
    if (prior) {
      const n = prior.n + 1
      const mean = Math.round(((prior.value * prior.n + value) / n) * 100) / 100
      const whole = Math.trunc(mean)
      yearValues.set(isoDate, {
        display: `${whole}.${String(Math.round((mean - whole) * 100)).padStart(2, "0")}`,
        value: mean,
        n,
      })
    } else {
      yearValues.set(isoDate, { display, value, n: 1 })
    }
    valuesByYear.set(year, yearValues)
  })

  const rangeYears: number[] = []
  const startYear = Number(startDate.slice(0, 4))
  const endYear = Number(endDate.slice(0, 4))
  if (Number.isFinite(startYear) && Number.isFinite(endYear) && startYear <= endYear) {
    for (let year = startYear; year <= endYear; year++) {
      rangeYears.push(year)
    }
  }

  const dataYears = [...valuesByYear.keys()].sort((a, b) => a - b)
  const years = rangeYears.length ? rangeYears : dataYears.length ? dataYears : [new Date().getFullYear()]
  const csvRows: string[] = []

  years.forEach((year, index) => {
    const yearValues = valuesByYear.get(year) || new Map<string, { display: string; value: number }>()
    const monthlyTotals = Array.from({ length: 12 }, () => 0)
    csvRows.push(toCsvLine([`Year ${year}`]))
    csvRows.push(toCsvLine(["Day", ...MONTH_LABELS]))

    for (let day = 1; day <= 31; day++) {
      const row: string[] = [String(day)]
      for (let month = 0; month < 12; month++) {
        const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        const entry = yearValues.get(isoDate)
        row.push(entry?.display || "")
        if (entry) {
          monthlyTotals[month] += entry.value
        }
      }
      csvRows.push(toCsvLine(row))
    }

    csvRows.push(toCsvLine(["Monthly Total", ...monthlyTotals.map((total) => total.toFixed(2))]))
    const totalOfTotals = monthlyTotals.reduce((sum, total) => sum + total, 0)
    csvRows.push(toCsvLine(["Total of Totals", totalOfTotals.toFixed(2), ...Array.from({ length: 11 }, () => "")]))
    if (index < years.length - 1) {
      csvRows.push("")
    }
  })

  return csvRows.join("\n")
}
