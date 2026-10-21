import { neutraliseFormula } from "@/lib/csv-safe"
import { istDate } from "@/lib/date-utils"
import { buildPdfFromCsv, PDF_MIME_TYPE, type ReportPdfOrientation } from "@/lib/report-pdf"
import { describeReportPeriod, type ReportPeriod, type ReportPeriodId } from "@/lib/reports/report-periods"
import { buildXlsxArrayBufferFromCsv, XLSX_MIME_TYPE } from "@/lib/spreadsheet"

/**
 * ONE REPORT, THREE FORMATS, AND ONE PLACE THAT KNOWS HOW TO MAKE THEM.
 *
 * Before this, eleven tabs built their own download. Ten of the twenty-six tabs had none at all,
 * and the ten that did disagreed about everything a user has to learn: the Costs tab offered
 * "Export CSV", "Excel" and "Reference PDF"; Sales and Dispatch said "Export CSV"; Stock said
 * "Export"; the P&L offered only the browser's own print dialog; the Muster's spreadsheet hid
 * inside two sub-tabs. Learning where the download lived on one screen taught you nothing about
 * the next one.
 *
 * ⚠ THE DUPLICATION WAS NOT JUST UNTIDY -- IT MEANT EVERY TAB GOT TO BE WRONG SEPARATELY. Of the
 * ten hand-rolled exports, the formula neutralisation that stops a worker's note running as a
 * spreadsheet macro (`lib/csv-safe.ts`) was applied by some and not others, and only one tab had a
 * PDF at all. A tab now declares WHAT its report contains and gets the rest, so a fix here fixes
 * every screen at once.
 *
 * A tab therefore writes one function -- rows in, cells out -- and inherits CSV, Excel and PDF,
 * formula neutralisation, the estate name in the title, the period in the subtitle, and an IST
 * generation stamp in the footer.
 */

export type ReportFormat = "pdf" | "xlsx" | "csv"

export const REPORT_FORMATS: ReportFormat[] = ["pdf", "xlsx", "csv"]

export type ReportDefinition = {
  /**
   * Filename stem, no extension and no date -- `buildReportFilename` adds the period, so every
   * report an estate downloads sorts together in their Downloads folder.
   */
  slug: string
  /** What this report is, in estate language. Shown as the PDF banner and the sheet title. */
  title: string
  /** The estate (and block, if filtered). Prefixed to the title so a saved file identifies itself. */
  estateName?: string
  /** The period or filter these figures cover. A report without one is unauditable. */
  period?: string
  /**
   * Column headings, then one array per row, for the period the reader chose.
   *
   * Built lazily: a tab with four thousand muster rows should not serialise them on every render
   * just in case somebody opens the menu. Async is allowed, which is how a tab serves a period its
   * on-screen filter is not currently showing -- it re-queries for that range.
   */
  buildRows: (period: ReportPeriod) => ReportRows | Promise<ReportRows>
  /**
   * Which periods this tab can actually serve.
   *
   * ⚠ DEFAULTS TO `["current"]`, AND THAT DIRECTION IS DELIBERATE. A tab whose endpoint takes no
   * date range cannot answer "this month", and if the menu offered it anyway the tab would hand
   * back whatever it already had under a heading naming a period it does not cover -- a complete-
   * looking report of the wrong range, which is the failure mode this whole codebase is shaped
   * around. Opting in is a statement that `buildRows` reads its `period` argument.
   */
  periods?: ReportPeriodId[]
  /** Forced page orientation. Left alone, the PDF turns the page itself when the table is wide. */
  orientation?: ReportPdfOrientation
}

export type ReportRows = {
  headers: string[]
  rows: Array<Array<string | number | null | undefined>>
}

/**
 * CSV cell: quote everything, double internal quotes, and neutralise anything Excel would run.
 *
 * Numbers are passed through `neutraliseFormula` too and come out untouched -- it leaves plain
 * numbers and a lone "-" alone on purpose, so a negative amount stays numeric and still sums in
 * Excel. See tests/csv-formula-neutralised.test.ts.
 */
const csvCell = (value: string | number | null | undefined) =>
  `"${neutraliseFormula(String(value ?? "")).replace(/"/g, '""')}"`

export const buildReportCsv = ({ headers, rows }: ReportRows) =>
  [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n")

/** `labour-costs-2026-10-01-to-2026-10-22.pdf` -- period in the name, so two downloads differ. */
export const buildReportFilename = (
  definition: ReportDefinition,
  format: ReportFormat,
  period?: ReportPeriod,
) => {
  const covered = period ? describeReportPeriod(period, definition.period || "") : definition.period || ""
  const suffix = covered
    ? `-${covered.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    : ""
  return `${definition.slug}${suffix}.${format}`.slice(0, 180)
}

/** "HoneyFarm Estate -- Daily Labour", or just the report name when no estate is passed. */
export const buildReportTitle = (definition: ReportDefinition) =>
  definition.estateName ? `${definition.estateName} - ${definition.title}` : definition.title

/**
 * The generation stamp.
 *
 * ⚠ IST, VIA `istDate`, AND NEVER `toLocaleDateString`. A report is read at the estate and this
 * code runs on whatever device opened the tab, so an unzoned format would stamp an Indian
 * accountant's document with a date from the viewer's calendar. That is signature 6 of the
 * seven in tests/today-is-the-estates-today.test.ts.
 */
export const buildReportFooter = (definition: ReportDefinition, now: Date = new Date()) => {
  const where = definition.estateName ? `${definition.estateName}, via FarmFlow` : "FarmFlow"
  return `${where}. Generated ${istDate(now, { day: "numeric", month: "short", year: "numeric" })}.`
}

/** U+FEFF as an escape. An invisible literal in source is one editor save from vanishing. */
const UTF8_BOM = "\uFEFF"

export type BuiltReport = { blob: Blob; filename: string }

/** Turn a definition into a downloadable file. The only function that knows all three formats. */
export const buildReport = async (
  definition: ReportDefinition,
  format: ReportFormat,
  period: ReportPeriod = { id: "current", label: "", start: null, end: null },
): Promise<BuiltReport> => {
  const csv = buildReportCsv(await definition.buildRows(period))
  const filename = buildReportFilename(definition, format, period)
  const title = buildReportTitle(definition)
  /**
   * The subtitle names the period the ROWS cover, not the tab's filter. These differ the moment
   * somebody picks "this month" on a screen showing the financial year, and the document has to
   * say which one it is -- it outlives the screen that produced it.
   */
  const covered = describeReportPeriod(period, definition.period || "")

  if (format === "csv") {
    // Spelled as an escape rather than pasted as a literal -- an invisible character in source is
    // one stray editor save away from vanishing, and its absence only shows up as mojibake in
    // Excel on a Windows machine nobody here has. The BOM is what makes Excel read the file as
    // UTF-8 rather than the local codepage.
    return { blob: new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8" }), filename }
  }

  if (format === "xlsx") {
    const bytes = await buildXlsxArrayBufferFromCsv(csv, definition.title, {
      title,
      subtitle: covered,
    })
    return { blob: new Blob([bytes], { type: XLSX_MIME_TYPE }), filename }
  }

  const bytes = buildPdfFromCsv(csv, {
    title,
    subtitle: covered,
    footer: buildReportFooter(definition),
    orientation: definition.orientation,
  })
  return { blob: new Blob([bytes as BlobPart], { type: PDF_MIME_TYPE }), filename }
}
