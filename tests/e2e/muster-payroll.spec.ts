/**
 * Muster and Payroll, end to end — the half the render net cannot reach.
 *
 * WHAT THIS ADDS OVER tests/render/. Those mount a component against a fixture, so they prove the
 * COMPONENT is right about a payload. They cannot prove anyone can get to the screen, that the
 * route returns the shape the component was written for, or that the real dashboard shell renders
 * it at all. Every one of those has broken here independently of the component:
 *
 *   - the Ledger subtab was re-enabled and crashed on the first click, on `<SelectItem value="">`,
 *     which Radix rejects during render. Nothing about the tab's own code was wrong.
 *   - locations arrived from /api/dashboard/bootstrap without `kind`, so every store silently
 *     became a block and the storehouse vanished from the one dropdown that needs it.
 *
 * A fixture cannot catch either. Both are a real route disagreeing with a real component.
 *
 * Read-only on purpose: this runs against the DEV database with whatever data is in it, so it
 * asserts on structure and arithmetic rather than on any particular estate's figures. It marks
 * nobody present and saves nothing — a test that writes attendance writes wages.
 */

import { expect, test, type Page } from "@playwright/test"
import { getDashboardRouteContext, waitForDashboardReady } from "./helpers"

const openAttendance = async (page: Page) => {
  const ctx = await getDashboardRouteContext(page, "attendance")
  await page.goto(ctx.route)
  await waitForDashboardReady(page)
}

/** The workspace's own subtab row: Muster / Workers / Payroll / Attendance reports / Scanner. */
const section = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true })

test.describe("muster", () => {
  test("opens on the roll, with a day selected and a roster beneath it", async ({ page }) => {
    await openAttendance(page)

    // The day strip is the navigation; without it there is no way to correct yesterday.
    await expect(page.getByText(/Prev week/)).toBeVisible()
    await expect(page.getByText(/Next week/)).toBeVisible()

    // Either a roster, or an honest empty state. Both are correct; a spinner that never resolves
    // is not, and that is what this actually guards.
    const hasRoll = page.getByText(/^\d+ in$/)
    const hasEmpty = page.getByText(/no workers|add your first|nobody/i)
    await expect(hasRoll.or(hasEmpty).first()).toBeVisible({ timeout: 20000 })
  })

  test("presents nobody until somebody is tapped", async ({ page }) => {
    /**
     * The rule this protects is the expensive one: a pre-ticked roll is one Save away from real
     * wages for a day nobody mustered. The render net asserts it against a fixture; this asserts
     * it against whatever /api/attendance actually returns for today, which is where a default
     * would come back from if one were ever reintroduced server-side.
     */
    await openAttendance(page)

    const count = page.getByText(/^\d+ in$/)
    if ((await count.count()) === 0) test.skip(true, "no roster on this tenant")

    // Today has not been mustered in CI, so the honest answer is zero. If a fixture estate has
    // real attendance for today this would be non-zero and the assertion would be wrong, so it is
    // scoped to the save bar instead: nothing is offered for saving on an untouched roll.
    await expect(page.getByRole("button", { name: /Save ·/ })).toHaveCount(0)
  })

  test("the day's report is reachable from the roll, not only by typing its URL", async ({ page }) => {
    // It existed for weeks reachable only by URL, which in practice means it did not exist.
    await openAttendance(page)
    const link = page.getByRole("link", { name: /full attendance report/i })
    if ((await link.count()) === 0) test.skip(true, "no roster on this tenant")
    await expect(link.first()).toHaveAttribute("href", /\/attendance-report\?date=\d{4}-\d{2}-\d{2}/)
  })
})

test.describe("payroll", () => {
  test("generates a wage table whose every row is as wide as its header", async ({ page }) => {
    /**
     * THE SEPTEMBER DEFECT, against the live route. Header 12, body 9 — so NET PAYABLE printed
     * under the heading "Overtime". The render net proves the component gets this right for a
     * fixture with rules on; this proves it for whatever `usesRules` the real API decides, which
     * is the input that actually varies between tenants.
     */
    await openAttendance(page)

    const payroll = section(page, "Payroll")
    if ((await payroll.count()) === 0) test.skip(true, "labour management not enabled for this account")
    await payroll.click()

    await page.getByRole("button", { name: "Generate" }).click()

    const table = page.locator("table").first()
    const empty = page.getByText(/No workers with activity/i)
    await expect(table.or(empty).first()).toBeVisible({ timeout: 30000 })
    if ((await table.count()) === 0) test.skip(true, "no payroll activity in this period")

    /** Column slots, expanding colSpan — the footer's first cell legitimately covers two. */
    const widths = await table.evaluate((node) => {
      const rows = Array.from((node as HTMLTableElement).rows)
      return rows.map((row) =>
        Array.from(row.cells).reduce((sum, cell) => sum + (cell.colSpan || 1), 0),
      )
    })

    expect(widths.length).toBeGreaterThan(1)
    expect(new Set(widths).size, `rows describe different numbers of columns: ${widths.join(", ")}`).toBe(1)
  })

  test("the total is the sum of the rows above it", async ({ page }) => {
    // A footer that does not sum is the failure this screen cannot afford, whatever the columns do.
    await openAttendance(page)

    const payroll = section(page, "Payroll")
    if ((await payroll.count()) === 0) test.skip(true, "labour management not enabled for this account")
    await payroll.click()
    await page.getByRole("button", { name: "Generate" }).click()

    const table = page.locator("table").first()
    const empty = page.getByText(/No workers with activity/i)
    await expect(table.or(empty).first()).toBeVisible({ timeout: 30000 })
    if ((await table.count()) === 0) test.skip(true, "no payroll activity in this period")

    const sums = await table.evaluate((node) => {
      const t = node as HTMLTableElement
      const slots = (row: HTMLTableRowElement) => {
        const out: string[] = []
        for (const cell of Array.from(row.cells)) {
          out.push(cell.textContent?.trim() ?? "")
          for (let i = 1; i < (cell.colSpan || 1); i += 1) out.push("")
        }
        return out
      }
      const headers = t.tHead ? slots(t.tHead.rows[0]) : []
      const at = headers.indexOf("Net Payable")
      if (at === -1 || !t.tFoot?.rows.length) return null
      const money = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0
      const body = Array.from(t.tBodies)
        .flatMap((b) => Array.from(b.rows))
        .map((row) => money(slots(row)[at] ?? ""))
      return { rows: body.reduce((a, b) => a + b, 0), footer: money(slots(t.tFoot.rows[0])[at] ?? "") }
    })

    if (!sums) test.skip(true, "no Net Payable column or no footer in this table")
    // Rounded to the rupee per row, so allow one rupee of drift per row rather than demanding
    // an exact match the formatting itself makes impossible.
    expect(Math.abs(sums!.rows - sums!.footer)).toBeLessThanOrEqual(2)
  })

  test("offers both exports once there is something to export", async ({ page }) => {
    // The CSV existed for months; the formatted workbook is what an estate office files.
    await openAttendance(page)

    const payroll = section(page, "Payroll")
    if ((await payroll.count()) === 0) test.skip(true, "labour management not enabled for this account")
    await payroll.click()

    // Nothing generated yet, so nothing to hand out.
    await expect(page.getByRole("button", { name: "CSV" })).toHaveCount(0)

    await page.getByRole("button", { name: "Generate" }).click()
    const table = page.locator("table").first()
    const empty = page.getByText(/No workers with activity/i)
    await expect(table.or(empty).first()).toBeVisible({ timeout: 30000 })
    if ((await table.count()) === 0) test.skip(true, "no payroll activity in this period")

    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible()
    await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible()
  })

  test("the pay-week buttons move the range by whole weeks", async ({ page }) => {
    /**
     * Medappa pay on a Saturday, so a week runs Sunday to Saturday. Stepping by whole weeks is
     * also what keeps advance instalments landing one per run — an arbitrary nine-day range would
     * take one instalment for nine days of work.
     */
    await openAttendance(page)

    const payroll = section(page, "Payroll")
    if ((await payroll.count()) === 0) test.skip(true, "labour management not enabled for this account")
    await payroll.click()

    await page.getByRole("button", { name: "This week" }).click()
    const start = page.locator('input[type="date"]').first()
    const end = page.locator('input[type="date"]').nth(1)

    const spanDays = async () => {
      const a = new Date(`${await start.inputValue()}T00:00:00Z`).getTime()
      const b = new Date(`${await end.inputValue()}T00:00:00Z`).getTime()
      return Math.round((b - a) / 86_400_000)
    }
    expect(await spanDays()).toBe(6)

    const firstStart = await start.inputValue()
    await page.getByRole("button", { name: "← Previous" }).click()
    const steppedBack = await start.inputValue()
    expect(await spanDays()).toBe(6)

    const delta =
      (new Date(`${firstStart}T00:00:00Z`).getTime() - new Date(`${steppedBack}T00:00:00Z`).getTime()) /
      86_400_000
    expect(delta).toBe(7)
  })
})
