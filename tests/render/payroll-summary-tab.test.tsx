import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readTable, rowWidths } from "./table"

/**
 * Payroll, mounted and read back — the screen an estate counts cash from.
 *
 * THE BUG THIS SUITE IS THE ANSWER TO, from components/payroll-summary-tab.tsx's own comment:
 *
 *   "The header grew them and the footer grew them; every worker row stayed at nine cells against
 *    a twelve-cell header. HTML does not complain — it just packs the cells left, so each worker's
 *    NET PAYABLE rendered underneath the heading 'Overtime', and the three columns to its right
 *    were blank."
 *
 * It shipped, and it was found by eye. The guard written afterwards —
 * tests/payroll-table-reconciles.test.ts — counts `<TableCell>` tags in the source, and its own
 * comment is honest about the compromise: "That makes it a weaker test than mounting the
 * component — it can be fooled by a cell built in a helper."
 *
 * ── WHAT THIS FILE ADDS OVER THAT ONE, demonstrated rather than asserted ──────────────────────
 *
 * Swap the body's Overtime and Retention cells with each other and change nothing else. The
 * column COUNT is identical, so the source-counting guard passes all seven of its tests. This
 * file fails with:
 *
 *     puts net payable under Net Payable, not under Overtime
 *     → expected '-₹840' to be '+₹180'
 *
 * Retention money printed under the heading "Overtime". Counting cells can prove a row is the
 * right LENGTH; only rendering it can prove a figure is under the right WORD, and the word is the
 * whole reason the column exists. Both guards stay — the source one pins the defect to the three
 * JSX regions that caused it, this one describes what a person would see.
 */

vi.mock("@/hooks/use-tenant-settings", () => ({
  useTenantSettings: () => ({ settings: { estateName: "Medappa Estates", bagWeightKg: 50 } }),
}))

const toastError = vi.fn()
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }))

import PayrollSummaryTab from "@/components/payroll-summary-tab"

/**
 * A week at Medappa, with the rules on.
 *
 * Manoj's line is the one that matters: he is the worker who carries every rule at once —
 * overtime, retention and an advance instalment — so his row is the only one where a
 * three-column shift is arithmetically visible rather than just cosmetically wrong.
 *
 * The figures reconcile on purpose: 4,200 + 642 + 250 + 180 − 300 − 840 − 500 = 3,632. A fixture
 * whose columns do not sum to its own net cannot be used to prove the footer sums to anything.
 */
const MANOJ = {
  id: "w-manoj",
  name: "Manoj",
  workerType: "permanent",
  dailyRate: 700,
  daysPresent: 6,
  attendanceEarnings: 4200,
  pickingKg: 128.5,
  pickingEarnings: 642,
  deductions: 300,
  deductionsTaken: 300,
  deductionShortfall: 0,
  adjustments: 250,
  overtime: 180,
  retention: 840,
  advanceRecovered: 500,
  advanceShortfall: 0,
  heldAfter: 3360,
  owedAfter: 1500,
  netPayable: 3632,
  missingDailyRate: false,
  monthlyWage: null,
  missingMonthlyWage: false,
  fromSalary: false,
  onRoster: true,
}

const CHANDRA = {
  ...MANOJ,
  id: "w-chandra",
  name: "Chandra",
  workerType: "casual",
  dailyRate: 420,
  daysPresent: 5,
  attendanceEarnings: 2100,
  pickingKg: 0,
  pickingEarnings: 0,
  deductions: 0,
  deductionsTaken: 0,
  adjustments: 0,
  overtime: 0,
  retention: 0,
  advanceRecovered: 0,
  heldAfter: 0,
  owedAfter: 0,
  netPayable: 2100,
}

const TOTALS = {
  daysPresent: 11,
  attendanceEarnings: 6300,
  pickingEarnings: 642,
  pickingKg: 128.5,
  deductions: 300,
  deductionShortfall: 0,
  adjustments: 250,
  overtime: 180,
  retention: 840,
  advanceRecovered: 500,
  advanceShortfall: 0,
  netPayable: 5732,
}

function mockPayroll(payload: Record<string, unknown>) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ success: true, workers: [MANOJ, CHANDRA], totals: TOTALS, ...payload }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** Fills the screen the way an admin does: pick nothing, press Generate, wait for figures. */
async function generate() {
  const user = userEvent.setup()
  const { container } = render(<PayrollSummaryTab />)
  await user.click(screen.getByRole("button", { name: /generate/i }))
  const table = await screen.findByRole("table")
  await waitFor(() => expect(within(table).getByText("Manoj")).toBeInTheDocument())

  /**
   * Both layouts are in the document at once — jsdom has no CSS, so `md:hidden` and `hidden
   * md:block` hide nothing and every figure appears twice. That is a nuisance for querying and a
   * gift for the parity check: it means one render can be asked whether the phone and the desktop
   * agree, which is the thing nothing structurally enforces.
   */
  const phone = container.querySelector("div.md\\:hidden")
  expect(phone, "the phone layout must be in the tree").not.toBeNull()
  return { user, table: table as HTMLTableElement, phone: phone as HTMLElement }
}

beforeEach(() => {
  toastError.mockClear()
})

describe("the wage table's columns line up", () => {
  it("every row is exactly as wide as the header, with the rule columns on", async () => {
    mockPayroll({ usesRules: true })
    const { table } = await generate()

    /**
     * THE ASSERTION THE SEPTEMBER BUG WOULD HAVE FAILED. Header 12, body rows 9, footer 12 — and
     * the only visible symptom was money under the wrong word.
     */
    const widths = rowWidths(table)
    const header = widths[0].width
    expect(header).toBe(12)
    expect(widths.every((row) => row.width === header)).toBe(true)
  })

  it("puts net payable under Net Payable, not under Overtime", async () => {
    mockPayroll({ usesRules: true })
    const { table } = await generate()
    const sheet = readTable(table)

    // Read exactly as a person reads it: find the heading, look down the column.
    expect(sheet.cell(0, "Net Payable")).toBe("₹3,632")
    expect(sheet.cell(0, "Overtime")).toBe("+₹180")
    expect(sheet.cell(0, "Retention")).toBe("-₹840")
    expect(sheet.cell(0, "Advance")).toBe("-₹500")

    // And the pre-rules columns have not shifted either.
    expect(sheet.cell(0, "Days")).toBe("6")
    expect(sheet.cell(0, "Attendance")).toBe("₹4,200")
    expect(sheet.cell(0, "Picking kg")).toBe("128.5")
    expect(sheet.cell(0, "Bonus")).toBe("+₹250")
    expect(sheet.cell(0, "Deductions")).toBe("-₹300")
  })

  it("a worker with no rule amounts still fills all twelve columns", async () => {
    // The short row was not short because the data was missing — it was short because the cells
    // were not written. Chandra has zeroes everywhere and must still occupy every column.
    mockPayroll({ usesRules: true })
    const { table } = await generate()
    const sheet = readTable(table)

    expect(sheet.cell(1, "Net Payable")).toBe("₹2,100")
    expect(sheet.cell(1, "Overtime")).toBe("—")
    expect(sheet.cell(1, "Retention")).toBe("—")
    expect(sheet.cell(1, "Advance")).toBe("—")
  })

  it("the footer's colSpan arithmetic lands the total under Net Payable", async () => {
    /**
     * The footer opens `colSpan={2}`, so its cell count is one fewer than the header's while
     * describing the same twelve columns. Counting cells would call that a bug; counting columns
     * is what makes the real shift detectable.
     */
    mockPayroll({ usesRules: true })
    const { table } = await generate()
    const sheet = readTable(table)

    expect(sheet.footerCell("Net Payable")).toBe("₹5,732")
    expect(sheet.footerCell("Days")).toBe("11")
    expect(sheet.footerCell("Overtime")).toBe("+₹180")
    expect(sheet.footerCell("Retention")).toBe("-₹840")
  })

  it("the footer is the sum of the rows above it", async () => {
    // A total that does not sum is the failure this screen cannot afford, whatever the columns do.
    mockPayroll({ usesRules: true })
    const { table } = await generate()
    const sheet = readTable(table)

    const rupees = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0
    const rowNets = [0, 1].map((i) => rupees(sheet.cell(i, "Net Payable")))
    expect(rowNets.reduce((a, b) => a + b, 0)).toBe(rupees(sheet.footerCell("Net Payable")))
  })
})

describe("an estate that has set no rules sees the table it always had", () => {
  it("drops the three columns from header, body and footer together", async () => {
    /**
     * Three of the four live tenants are in this state. Dropping a column from the header alone is
     * the same defect as adding one to the header alone, in the other direction — and it is the
     * likelier mistake, because `showRuleColumns` is read in three separate places.
     */
    mockPayroll({ usesRules: false })
    const { table } = await generate()
    const sheet = readTable(table)

    expect(sheet.headers).not.toContain("Overtime")
    expect(sheet.headers).not.toContain("Retention")
    expect(sheet.headers).not.toContain("Advance")

    const widths = rowWidths(table)
    expect(widths[0].width).toBe(9)
    expect(widths.every((row) => row.width === 9)).toBe(true)

    expect(sheet.cell(0, "Net Payable")).toBe("₹3,632")
    expect(sheet.footerCell("Net Payable")).toBe("₹5,732")
  })
})

describe("the phone card and the desktop table say the same thing", () => {
  /**
   * Layouts may differ; the data shown must not. Nothing structural enforces that — they are two
   * independent blocks of JSX over one payload — so it is enforced here.
   */
  it("itemises the same rule lines in the totals card as in the footer", async () => {
    mockPayroll({ usesRules: true })
    const { table, phone } = await generate()

    const card = within(phone).getByText(/^Total \(2 workers\)$/).closest("div.rounded-lg")
    expect(card, "the phone totals card must exist").not.toBeNull()
    const mobile = within(card as HTMLElement)

    for (const label of ["Overtime", "Retention held", "Advance recovered"]) {
      expect(mobile.getByText(label), `phone total is missing ${label}`).toBeInTheDocument()
    }
    expect(mobile.getByText("₹5,732")).toBeInTheDocument()
    expect(mobile.getByText("+₹180")).toBeInTheDocument()
    expect(mobile.getByText("-₹840")).toBeInTheDocument()

    // Same three figures, same period, other layout.
    const sheet = readTable(table)
    expect(sheet.footerCell("Overtime")).toBe("+₹180")
    expect(sheet.footerCell("Retention")).toBe("-₹840")
  })
})

describe("the exported sheet reconciles with the screen", () => {
  /**
   * From the component's own note: "once rules landed, Net Payable stopped being the sum of the
   * columns beside it. Overtime, retention and advance recovery were all applied and none were
   * exported, so a wage sheet handed to somebody counting cash showed a net that could not be
   * arrived at from the figures on the page."
   *
   * A CSV is a table too, and it can go short in exactly the same way — with no rendering to
   * betray it, because nobody looks at a CSV until they are already reconciling.
   */
  async function csvFrom(usesRules: boolean) {
    mockPayroll({ usesRules })
    const { user } = await generate()

    let captured = ""
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      void (blob as Blob).text().then((text) => {
        captured = text
      })
      return "blob:payroll"
    })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    await user.click(screen.getByRole("button", { name: /^csv$/i }))
    await waitFor(() => expect(captured).not.toBe(""))
    return captured.split("\n").map((line) => line.split(","))
  }

  it("every line has as many fields as the header, rules on", async () => {
    const rows = await csvFrom(true)
    const width = rows[0].length
    expect(width).toBe(16)
    expect(rows.every((row) => row.length === width)).toBe(true)
  })

  it("carries the rule columns, so the net can be arrived at from the figures beside it", async () => {
    const rows = await csvFrom(true)
    const header = rows[0]
    const manoj = rows[1]
    const at = (name: string) => Number(manoj[header.indexOf(name)])

    expect(header).toContain("Overtime (₹)")
    expect(header).toContain("Retention Held (₹)")
    expect(header).toContain("Advance Recovered (₹)")

    const reconciled =
      at("Attendance Earnings (₹)") +
      at("Picking Earnings (₹)") +
      at("Adjustments (₹)") +
      at("Overtime (₹)") -
      at("Deductions (₹)") -
      at("Retention Held (₹)") -
      at("Advance Recovered (₹)")
    expect(reconciled).toBe(at("Net Payable (₹)"))
  })

  it("and goes back to the narrow sheet, byte for byte, when the estate uses no rules", async () => {
    const rows = await csvFrom(false)
    expect(rows[0].length).toBe(10)
    expect(rows[0]).not.toContain("Overtime (₹)")
    expect(rows.every((row) => row.length === 10)).toBe(true)
    // The TOTAL line is still there, and still last.
    expect(rows.at(-1)?.[0]).toBe("TOTAL")
  })
})

describe("what the screen says when the numbers cannot be trusted", () => {
  it("names how many workers have no daily rate", async () => {
    mockPayroll({ usesRules: false, workers: [{ ...MANOJ, missingDailyRate: true, dailyRate: null }] })
    await generate()
    expect(screen.getByText(/1 worker have no daily rate set/)).toBeInTheDocument()
  })

  it("names monthly staff with no salary, which used to pay ₹0 in silence", async () => {
    // Laxmi's two carry ₹17,000 and ₹16,000 in the roster.
    mockPayroll({
      usesRules: false,
      workers: [{ ...MANOJ, missingMonthlyWage: true, monthlyWage: null, fromSalary: true }],
    })
    await generate()
    expect(screen.getByText(/1 monthly-paid worker has no salary/)).toBeInTheDocument()
  })

  it("marks a worker who has left the roster rather than dropping their final settlement", async () => {
    mockPayroll({ usesRules: false, workers: [{ ...MANOJ, onRoster: false }] })
    const { table } = await generate()
    expect(within(table).getAllByText("left").length).toBeGreaterThan(0)
    expect(readTable(table).cell(0, "Net Payable")).toBe("₹3,632")
  })
})
