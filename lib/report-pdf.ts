import { parseCsv } from "@/lib/spreadsheet"

/**
 * CSV TEXT IN, PRINTABLE PDF OUT -- the third format for the report every tab already builds.
 *
 * `lib/spreadsheet.ts` turns CSV into a styled .xlsx. CSV is therefore already this app's universal
 * report intermediate, and the cheapest honest way to give an estate a document it can hand to an
 * accountant, a bank or a buyer is to render that same text. One input, one set of column
 * decisions, three formats that cannot disagree with each other.
 *
 * ⚠ WHY THIS FILE EXISTS RATHER THAN A PDF LIBRARY. jspdf + autotable is ~350kB of client bundle
 * for a table of text. Every tab here is code-split and read on a phone over estate mobile data,
 * so that cost lands on the one screen somebody opens while standing in a field. This writes the
 * PDF by hand: Courier, which is one of the fourteen fonts every reader has built in, so there is
 * no font to embed either.
 *
 * ⚠ AND WHY THE ENCODING IS THE WHOLE RISK. The previous hand-rolled writer in
 * `lib/account-activity-suggestions.ts` UTF-8-encoded the finished file while Courier reads single
 * bytes, so `Rs1,62,397` written with the rupee sign was stored as the three bytes `e2 82 b9` and
 * rendered as two garbage glyphs. Measured, not assumed -- the string in the content stream read
 * literally `Picking \xe2\xb9 1,62,397 paid`. That is this codebase's own silent-failure class
 * aimed at the one figure a report exists to carry: nothing throws, the download works, and the
 * total is unreadable.
 *
 * So: every character is folded to a byte this font can actually draw (`toWinAnsi`), and any byte
 * over 127 is emitted as an OCTAL ESCAPE. The finished file is therefore pure ASCII, which makes
 * the UTF-8 encode at the end byte-exact and keeps the xref offsets honest. The alternative --
 * writing latin1 bytes directly -- works too, and silently breaks the moment somebody encodes the
 * output as UTF-8 somewhere downstream.
 */

/** Courier advance width is 600/1000 em for every glyph, which is what makes the columns exact. */
const COURIER_ADVANCE = 0.6
const FONT_SIZE = 8
const MIN_FONT_SIZE = 5.5
const LINE_HEIGHT_RATIO = 1.38
const MARGIN = 40
const GUTTER = 2
const TITLE_SIZE = 15
const SUBTITLE_SIZE = 9
const FOOTER_SIZE = 7.5
/** Height taken by the title block above the table, and by the footer line below it. */
const HEADER_BLOCK = 54
const FOOTER_BLOCK = 26

const PAGE = {
  portrait: { width: 612, height: 792 },
  landscape: { width: 792, height: 612 },
} as const

export type ReportPdfOrientation = "portrait" | "landscape" | "auto"

export type ReportPdfOptions = {
  /** Banner line: the estate name and what this report is. */
  title: string
  /** The period, the filter, the units -- whatever makes the figures below unambiguous. */
  subtitle?: string
  /**
   * Printed bottom-left on every page. Pass a wall clock already formatted in IST by the caller;
   * this module never asks the host what time it is, because the host is UTC and the reader is at
   * the estate. See the dates section of CLAUDE.md.
   */
  footer?: string
  /** `auto` (the default) turns landscape on when the table will not fit portrait. */
  orientation?: ReportPdfOrientation
}

/**
 * Characters the app really does emit that Courier cannot draw, folded to something a reader
 * recognises. `formatCurrency` in lib/format.ts produces the rupee sign on 170 call sites, which
 * is the one that matters; the rest are typographic punctuation that arrives via pasted text.
 */
const TRANSLITERATIONS: Array<[RegExp, string]> = [
  [/₹/g, "Rs"], // ₹ -- added to Unicode in 2010, so it is in no single-byte encoding at all
  [/[–—−]/g, "-"],
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/…/g, "..."],
  [/[    ]/g, " "],
  [/•/g, "*"],
  [/[✓✔]/g, "y"],
]

/**
 * Fold a string to bytes Courier/WinAnsi can draw.
 *
 * ⚠ AN UNREPRESENTABLE CHARACTER BECOMES `?`, VISIBLY, AND IS NOT DROPPED. A vanished character
 * is the silent version of this bug -- a worker's name one glyph short still looks like a name.
 * `?` is obviously wrong to whoever reads the page, which is the point.
 */
export const toWinAnsi = (value: unknown) => {
  let text = String(value ?? "")
  for (const [pattern, replacement] of TRANSLITERATIONS) text = text.replace(pattern, replacement)
  return text.replace(/[^\x20-\x7e\xa1-\xff]/g, "?")
}

/**
 * Escape for a PDF literal string, and push every high byte out as an octal escape so the finished
 * file stays ASCII. Callers must pass text that has already been through `toWinAnsi`.
 */
const pdfString = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\xa1-\xff]/g, (char) => `\\${char.charCodeAt(0).toString(8).padStart(3, "0")}`)

const encoder = new TextEncoder()

/** Right-align a cell when every value in its column reads as a number, the way money wants. */
const NUMERIC_CELL = /^[-(]?(?:Rs\s*)?\d[\d,]*(?:\.\d+)?\)?%?$/

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += Math.max(1, size)) {
    out.push(items.slice(index, index + Math.max(1, size)))
  }
  return out
}

/**
 * Lay a grid of cells out as fixed-width Courier lines.
 *
 * Column widths come from the widest cell, then every column is shaved proportionally if the table
 * is still too wide. Truncation ends a cell with `..` so a clipped value is visible as clipped --
 * a silently shortened figure is a wrong figure.
 */
const layOutColumns = (grid: string[][], availableChars: number) => {
  const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0)
  if (!columnCount) return { widths: [] as number[], untruncated: true }

  const widths = Array.from({ length: columnCount }, (_, column) =>
    grid.reduce((max, row) => Math.max(max, (row[column] ?? "").length), 1),
  )

  const totalWith = (values: number[]) => values.reduce((sum, w) => sum + w, 0) + GUTTER * (columnCount - 1)
  if (totalWith(widths) <= availableChars) return { widths, untruncated: true }

  // Shave the widest column repeatedly rather than scaling every column, so a narrow date column
  // keeps its width while a long free-text note gives up the room.
  const shaved = [...widths]
  let guard = 0
  while (totalWith(shaved) > availableChars && guard < 10_000) {
    const widest = shaved.indexOf(Math.max(...shaved))
    if (shaved[widest] <= 4) break
    shaved[widest] -= 1
    guard += 1
  }
  return { widths: shaved, untruncated: false }
}

const fitCell = (value: string, width: number, alignRight: boolean) => {
  const text = value.length > width ? `${value.slice(0, Math.max(1, width - 2))}..` : value
  return alignRight ? text.padStart(width, " ") : text.padEnd(width, " ")
}

/**
 * Render CSV text as a paginated PDF table.
 *
 * The first CSV row is treated as the header and repeated at the top of every page, because a
 * second page of unlabelled numbers is not a report. Returns the bytes; the caller wraps them in
 * a Blob.
 */
export const buildPdfFromCsv = (csv: string, options: ReportPdfOptions): Uint8Array => {
  const parsed = (csv.trim() ? parseCsv(csv) : []).map((row) => row.map(toWinAnsi))
  const [headerRow, ...bodyRows] = parsed.length ? parsed : [[]]
  const title = toWinAnsi(options.title)
  const subtitle = options.subtitle ? toWinAnsi(options.subtitle) : ""
  const footer = options.footer ? toWinAnsi(options.footer) : ""

  // Which columns read as numbers, so they can be right-aligned. A column is only numeric if every
  // non-blank body cell in it is -- one stray label and the whole column stays left-aligned, which
  // is the conservative direction.
  const columnCount = parsed.reduce((max, row) => Math.max(max, row.length), 0)
  const numericColumns = Array.from({ length: columnCount }, (_, column) => {
    const values = bodyRows.map((row) => (row[column] ?? "").trim()).filter(Boolean)
    return values.length > 0 && values.every((value) => NUMERIC_CELL.test(value))
  })

  // Pick the page box, then the font size, from what the table actually needs.
  const requestedOrientation = options.orientation ?? "auto"
  const charsAt = (size: number, width: number) => Math.floor((width - MARGIN * 2) / (size * COURIER_ADVANCE))

  /**
   * ⚠ THE TEST FOR "DOES IT FIT" IS "WAS NOTHING TRUNCATED", NOT "DID THE CHARACTERS FIT".
   *
   * The first version asked whether the shaved widths fit the page, which is true by construction:
   * shaving stops at 4 characters per column, so eighteen columns "fit" portrait as `12..` and the
   * page was never turned. Every cell was clipped and the layout reported success. Caught by the
   * orientation test, which is the only thing that could see it -- the PDF was perfectly valid.
   *
   * So the ladder is: upright at full size, then sideways, then smaller type, and only truncate
   * once none of those is enough.
   */
  const untruncatedUpright = layOutColumns(parsed, charsAt(FONT_SIZE, PAGE.portrait.width)).untruncated
  const orientation: "portrait" | "landscape" =
    requestedOrientation === "auto" ? (untruncatedUpright ? "portrait" : "landscape") : requestedOrientation
  const page = PAGE[orientation]

  let fontSize = FONT_SIZE
  let layout = layOutColumns(parsed, charsAt(fontSize, page.width))
  while (!layout.untruncated && fontSize > MIN_FONT_SIZE) {
    const smaller = Math.round((fontSize - 0.5) * 10) / 10
    const attempt = layOutColumns(parsed, charsAt(smaller, page.width))
    fontSize = smaller
    layout = attempt
  }

  const lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO * 10) / 10
  const bodyTop = page.height - MARGIN - HEADER_BLOCK
  const rowsPerPage = Math.max(1, Math.floor((bodyTop - MARGIN - FOOTER_BLOCK) / lineHeight) - 1)
  const pages = bodyRows.length ? chunk(bodyRows, rowsPerPage) : [[]]

  const renderRow = (row: string[]) =>
    layout.widths
      .map((width, column) => fitCell(row[column] ?? "", width, numericColumns[column] ?? false))
      .join(" ".repeat(GUTTER))
      .trimEnd()

  const headerLine = headerRow?.length ? renderRow(headerRow) : ""
  const rule = headerLine ? "-".repeat(headerLine.length) : ""

  // --- object assembly -------------------------------------------------------------------------
  // 1 catalog, 2 pages, 3 regular font, 4 bold font, then a page + content pair per page.
  const objects: string[] = []
  const REGULAR = 3
  const BOLD = 4
  const pageNumbers = pages.map((_, index) => 5 + index)
  const contentNumbers = pages.map((_, index) => 5 + pages.length + index)

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} ` +
    `/Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] >>`
  // ⚠ /WinAnsiEncoding is load-bearing. Without it Courier uses StandardEncoding, where the bytes
  // above 127 map to a different set of glyphs entirely and an accented name renders as symbols.
  objects[REGULAR] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"
  objects[BOLD] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>"

  pages.forEach((pageRows, index) => {
    const pageLabel = pages.length > 1 ? `Page ${index + 1} of ${pages.length}` : ""
    const commands: string[] = ["BT", `/F2 ${TITLE_SIZE} Tf`, `${MARGIN} ${page.height - MARGIN - 12} Td`, `(${pdfString(title)}) Tj`]

    if (subtitle) {
      commands.push(`/F1 ${SUBTITLE_SIZE} Tf`, `0 ${-(SUBTITLE_SIZE + 5)} Td`, `(${pdfString(subtitle)}) Tj`)
    }

    commands.push("ET")

    // Table header, repeated on every page.
    let cursor = bodyTop
    if (headerLine) {
      commands.push(
        "BT",
        `/F2 ${fontSize} Tf`,
        `${MARGIN} ${cursor} Td`,
        `(${pdfString(headerLine)}) Tj`,
        `0 ${-lineHeight} Td`,
        `(${pdfString(rule)}) Tj`,
        "ET",
      )
      cursor -= lineHeight * 2
    }

    if (pageRows.length) {
      commands.push("BT", `/F1 ${fontSize} Tf`, `${MARGIN} ${cursor} Td`)
      pageRows.forEach((row, rowIndex) => {
        if (rowIndex > 0) commands.push(`0 ${-lineHeight} Td`)
        commands.push(`(${pdfString(renderRow(row))}) Tj`)
      })
      commands.push("ET")
    } else {
      commands.push("BT", `/F1 ${fontSize} Tf`, `${MARGIN} ${cursor} Td`, `(${pdfString("No rows for this period.")}) Tj`, "ET")
    }

    if (footer || pageLabel) {
      commands.push("BT", `/F1 ${FOOTER_SIZE} Tf`, `${MARGIN} ${MARGIN - 8} Td`, `(${pdfString(footer)}) Tj`, "ET")
      if (pageLabel) {
        const labelX = page.width - MARGIN - pageLabel.length * FOOTER_SIZE * COURIER_ADVANCE
        commands.push("BT", `/F1 ${FOOTER_SIZE} Tf`, `${Math.round(labelX)} ${MARGIN - 8} Td`, `(${pdfString(pageLabel)}) Tj`, "ET")
      }
    }

    const stream = commands.join("\n")
    objects[pageNumbers[index]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Resources << /Font << /F1 ${REGULAR} 0 R /F2 ${BOLD} 0 R >> >> ` +
      `/Contents ${contentNumbers[index]} 0 R >>`
    objects[contentNumbers[index]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })

  // --- file assembly ---------------------------------------------------------------------------
  // Everything above is ASCII by construction (pdfString octal-escapes the rest), so a character
  // index IS a byte offset and the xref table below is exact.
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = [0]
  for (let number = 1; number < objects.length; number += 1) {
    if (!objects[number]) continue
    offsets[number] = pdf.length
    pdf += `${number} 0 obj\n${objects[number]}\nendobj\n`
  }

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let number = 1; number < objects.length; number += 1) {
    pdf += `${String(offsets[number] || 0).padStart(10, "0")} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return encoder.encode(pdf)
}

export const PDF_MIME_TYPE = "application/pdf"
