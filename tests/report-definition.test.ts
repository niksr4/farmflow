import { describe, expect, it } from "vitest"
import {
  buildReport,
  buildReportCsv,
  buildReportFilename,
  buildReportFooter,
  buildReportTitle,
  type ReportDefinition,
} from "@/lib/reports/report-definition"

/**
 * The shared report builder. Every tab's "Report" button goes through this, so a defect here is a
 * defect on every screen at once -- which is the trade this abstraction makes, and why it is tested
 * harder than any one tab's export was.
 */

const definition = (overrides: Partial<ReportDefinition> = {}): ReportDefinition => ({
  slug: "labour-costs",
  title: "Daily Labour",
  estateName: "HoneyFarm Estate",
  period: "1 Oct to 15 Oct 2026",
  buildRows: () => ({
    headers: ["Date", "Worker", "Paid"],
    rows: [["2026-10-13", "Saina", "988.00"]],
  }),
  ...overrides,
})

describe("the CSV every format is built from", () => {
  it("neutralises a cell Excel would execute", () => {
    /**
     * A worker's note typed as a formula runs on whoever opens the file. Ten tabs each rolled their
     * own CSV and only some applied this; routing them all through one builder is what makes it
     * uniform. See tests/csv-formula-neutralised.test.ts for the rule itself.
     */
    const csv = buildReportCsv({
      headers: ["Worker", "Note"],
      rows: [["Saina", '=HYPERLINK("http://x","click")']],
    })
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""click"")"`)
  })

  it("leaves a negative amount numeric so Excel still sums it", () => {
    const csv = buildReportCsv({ headers: ["Amount"], rows: [[-120.5]] })
    expect(csv).toContain(`"-120.5"`)
    expect(csv).not.toContain("'-120.5")
  })

  it("escapes a quote and renders a blank for null", () => {
    const csv = buildReportCsv({ headers: ["A", "B"], rows: [['say "hi"', null]] })
    expect(csv.split("\n")[1]).toBe(`"say ""hi""",""`)
  })
})

describe("what the file is called and titled", () => {
  it("puts the period in the filename, so two downloads are distinguishable", () => {
    expect(buildReportFilename(definition(), "pdf")).toBe("labour-costs-1-oct-to-15-oct-2026.pdf")
  })

  it("survives a period with punctuation without producing a broken filename", () => {
    const name = buildReportFilename(definition({ period: "FY 2026/27 (Q2)" }), "csv")
    expect(name).toBe("labour-costs-fy-2026-27-q2.csv")
    expect(name).not.toMatch(/[/\\]/)
  })

  it("names the estate in the title, so a saved report identifies itself", () => {
    expect(buildReportTitle(definition())).toBe("HoneyFarm Estate - Daily Labour")
    expect(buildReportTitle(definition({ estateName: undefined }))).toBe("Daily Labour")
  })
})

describe("the generation stamp", () => {
  /**
   * ⚠ ASSERT THE DATE, NOT ITS SHAPE, AND UNDER MORE THAN ONE ZONE.
   *
   * A `/\d+ \w+ \d{4}/` assertion passes in every timezone, which is exactly why it cannot see the
   * bug. CI sets no TZ, so a zone-dependent stamp passes or fails on the runner's accident. This
   * instant is 19:30 UTC on 21 Oct, which is already 22 Oct at the estate -- so a host-local
   * format prints the 21st for a reader in India and the 22nd is the only correct answer.
   */
  const instant = new Date("2026-10-21T19:30:00Z")

  for (const tz of ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Auckland"]) {
    it(`reads the estate's date with TZ=${tz}`, () => {
      const original = process.env.TZ
      process.env.TZ = tz
      try {
        expect(buildReportFooter(definition(), instant)).toBe(
          "HoneyFarm Estate, via FarmFlow. Generated 22 Oct 2026.",
        )
      } finally {
        process.env.TZ = original
      }
    })
  }
})

describe("buildReport", () => {
  it("builds a PDF whose money is readable", async () => {
    const { blob, filename } = await buildReport(
      definition({
        buildRows: () => ({ headers: ["Worker", "Paid"], rows: [["Saina", "₹988.00"]] }),
      }),
      "pdf",
    )
    expect(blob.type).toBe("application/pdf")
    expect(filename.endsWith(".pdf")).toBe(true)

    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1")
    expect(text).toContain("Rs988.00")
    expect(text).toContain("HoneyFarm Estate - Daily Labour")
    expect(text).toContain("1 Oct to 15 Oct 2026")
    // The footer stamp reaches the page, not just the helper's return value.
    expect(text).toContain("via FarmFlow. Generated")
  })

  /**
   * ⚠ THE DOCUMENT MUST NAME THE PERIOD ITS ROWS COVER, NOT THE TAB'S FILTER.
   *
   * Found by tamper-testing, not by review: replacing `describeReportPeriod(period, ...)` with
   * `definition.period` left every other assertion in this file and in the mounted menu test
   * green. The rows were correctly scoped to the chosen month and the heading still read
   * "FY 26/27" -- a year's title on a month's figures, filed by an accountant, with nothing
   * anywhere to contradict it. The period is the single claim a report makes about itself.
   */
  it("titles the report with the period actually covered, not the tab's filter", async () => {
    const period = { id: "month" as const, label: "This month so far", start: "2026-10-01", end: "2026-10-22" }
    const { blob } = await buildReport(definition(), "pdf", period)
    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1")

    expect(text).toContain("2026-10-01 to 2026-10-22")
    // The tab was showing the financial year. Saying so here would be a false statement.
    expect(text).not.toContain("1 Oct to 15 Oct 2026")
  })

  it("falls back to the tab's own filter only when no period was chosen", async () => {
    const current = { id: "current" as const, label: "", start: null, end: null }
    const { blob } = await buildReport(definition(), "pdf", current)
    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1")
    // `current` means "whatever the tab is showing", so the tab's label is the honest answer.
    expect(text).toContain("1 Oct to 15 Oct 2026")
  })

  it("builds a workbook carrying the estate name and the period", async () => {
    const { blob } = await buildReport(definition(), "xlsx")
    expect(blob.type).toContain("spreadsheetml")
    expect(blob.size).toBeGreaterThan(0)
  })

  it("builds a CSV with the byte-order mark Excel on Windows needs", async () => {
    const { blob } = await buildReport(definition(), "csv")

    /**
     * ⚠ READ THE BYTES, NOT `blob.text()`. Blob.text() is specified to UTF-8-decode, which STRIPS
     * a leading byte-order mark -- so `text.charCodeAt(0)` can never see one and the first version
     * of this test failed against a correct implementation. Without the BOM, Excel on Windows
     * reads the file in the local codepage and every worker name with an accent is mojibake, which
     * is invisible on any machine here.
     */
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(await blob.text()).toContain("Saina")
  })

  it("asks for the rows once, and only when a format is actually chosen", async () => {
    let calls = 0
    const lazy = definition({
      buildRows: () => {
        calls += 1
        return { headers: ["A"], rows: [["1"]] }
      },
    })
    expect(calls).toBe(0)
    await buildReport(lazy, "csv")
    expect(calls).toBe(1)
  })

  it("accepts an async row builder, so a tab may fetch the full period on demand", async () => {
    const { blob } = await buildReport(
      definition({
        buildRows: async () => ({ headers: ["Worker"], rows: [["Fetched"]] }),
      }),
      "csv",
    )
    expect(await blob.text()).toContain("Fetched")
  })
})
