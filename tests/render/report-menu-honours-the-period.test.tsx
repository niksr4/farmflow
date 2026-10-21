import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ReportMenu } from "@/components/ui/report-menu"
import { Toaster } from "@/components/ui/toaster"
import type { ReportDefinition } from "@/lib/reports/report-definition"

/**
 * THE PERIOD THE READER PICKS IS THE PERIOD THE REPORT COVERS.
 *
 * `tests/every-tab-reports-the-same-way.test.ts` checks that a tab offering a period selector reads
 * the period it is handed. It cannot check the other half -- that the MENU passes the right period
 * down -- because that is a three-way interaction between a radio group, a dropdown that closes on
 * select, and an async build. A source scan sees `buildReport(definition, format, selectedPeriod)`
 * and is satisfied whether `selectedPeriod` tracks the radio group or is stuck on its initial
 * value.
 *
 * And "stuck on its initial value" is the plausible bug: `current` is the default, so a broken
 * selector hands back exactly what the screen shows. The download works, the file opens, the
 * figures are real, and the heading names a month whose rows were never fetched. Nothing throws.
 *
 * So this mounts the control, picks a period, downloads, and asserts on the period `buildRows`
 * actually received.
 */

const ORIGINAL_CREATE = globalThis.URL.createObjectURL
const ORIGINAL_REVOKE = globalThis.URL.revokeObjectURL

beforeEach(() => {
  // jsdom implements neither. Without these the click throws and the test fails for the wrong
  // reason -- which would look like the assertion below working.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:report")
  globalThis.URL.revokeObjectURL = vi.fn()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // A fixed estate clock, so "this month" is a known range rather than whenever CI runs.
  vi.setSystemTime(new Date("2026-10-22T06:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
  globalThis.URL.createObjectURL = ORIGINAL_CREATE
  globalThis.URL.revokeObjectURL = ORIGINAL_REVOKE
  vi.restoreAllMocks()
})

const renderMenu = (overrides: Partial<ReportDefinition> = {}) => {
  const buildRows = vi.fn((_period: { id: string; start: string | null; end: string | null }) => ({
    headers: ["Date", "Paid"],
    rows: [["2026-10-13", "988.00"]],
  }))

  const definition: ReportDefinition = {
    slug: "daily-labour",
    title: "Daily Labour",
    estateName: "HoneyFarm Estate",
    period: "FY 26/27",
    periods: ["current", "day", "week", "month", "year"],
    buildRows,
    ...overrides,
  }

  // ⚠ The Toaster has to be mounted or `toast()` writes to a store nothing renders, and the
  // failure-path test below would pass over a toast that never appeared.
  render(
    <>
      <ReportMenu definition={definition} />
      <Toaster />
    </>,
  )
  return { buildRows }
}

describe("the Report menu", () => {
  it("is called Report, the same on every tab", async () => {
    renderMenu()
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy()
  })

  it("offers the period choices and the three formats", async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole("button", { name: /report/i }))

    // The tab's own filter is the first radio item, and is NOT also printed in the header --
    // picking the period up from two places at once was a real duplication this test caught.
    expect(await screen.findByRole("menuitemradio", { name: "FY 26/27" })).toBeTruthy()
    expect(screen.getByText("Today (2026-10-22)")).toBeTruthy()
    expect(screen.getByText("This week so far")).toBeTruthy()
    expect(screen.getByText("This month so far")).toBeTruthy()
    expect(screen.getByText("PDF")).toBeTruthy()
    expect(screen.getByText("Excel")).toBeTruthy()
    expect(screen.getByText("CSV")).toBeTruthy()
  })

  it("defaults to what the screen is showing", async () => {
    const user = userEvent.setup()
    const { buildRows } = renderMenu()

    await user.click(screen.getByRole("button", { name: /report/i }))
    await user.click(await screen.findByText("PDF"))

    await waitFor(() => expect(buildRows).toHaveBeenCalledTimes(1))
    // `current` carries no bounds, which is what tells a tab to use its own filter.
    expect(buildRows.mock.calls[0][0]).toMatchObject({ id: "current", start: null, end: null })
  })

  it("passes the CHOSEN period down, not the default", async () => {
    const user = userEvent.setup()
    const { buildRows } = renderMenu()

    await user.click(screen.getByRole("button", { name: /report/i }))
    await user.click(await screen.findByText("This month so far"))
    // The menu MUST stay open after picking a period -- Radix closes on select by default, and
    // without the onSelect preventDefault in ReportMenu there is no second click to make.
    await user.click(await screen.findByText("PDF"))

    await waitFor(() => expect(buildRows).toHaveBeenCalledTimes(1))
    expect(buildRows.mock.calls[0][0]).toMatchObject({
      id: "month",
      start: "2026-10-01",
      end: "2026-10-22",
    })
  })

  it("names the covered period in the downloaded filename", async () => {
    const user = userEvent.setup()
    /**
     * Capture the anchor by stubbing its CLICK, not by replacing document.createElement -- Radix
     * builds its own portal nodes through that same call, so mocking it tore the menu down and the
     * first version of this test failed looking for the trigger it had just destroyed.
     */
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })

    renderMenu()
    await user.click(screen.getByRole("button", { name: /report/i }))
    await user.click(await screen.findByText("Today (2026-10-22)"))
    await user.click(await screen.findByText("CSV"))

    // The filename is the only part of a report a reader sees before opening it, so a file named
    // for the wrong period is a wrong answer even when the contents are right.
    await waitFor(() => expect(downloads).toEqual(["daily-labour-2026-10-22-to-2026-10-22.csv"]))
  })

  it("shows no period selector when the tab cannot serve one", async () => {
    const user = userEvent.setup()
    renderMenu({ periods: undefined })

    await user.click(screen.getByRole("button", { name: /report/i }))
    await screen.findByText("PDF")
    // Offering a period a tab cannot scope its rows to is how a report comes to name a range it
    // does not cover. The default is deliberately the narrow one.
    expect(screen.queryByText("This month so far")).toBeNull()
    expect(screen.queryByText("Period")).toBeNull()
  })

  it("says so when a report cannot be built, rather than failing quietly", async () => {
    const user = userEvent.setup()
    renderMenu({
      buildRows: () => {
        throw new Error("Could not load that period")
      },
    })

    await user.click(screen.getByRole("button", { name: /report/i }))
    await user.click(await screen.findByText("PDF"))

    // A download that silently does not happen is indistinguishable from a slow one.
    expect(await screen.findByText("Could not build that report")).toBeTruthy()
  })
})
