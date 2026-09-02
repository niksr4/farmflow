import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { MONTHLY_PAID_WORKER_TYPES, WORKER_TYPES, isPaidDaily } from "@/lib/worker-types"

/**
 * Payroll paid every monthly-salaried worker ₹0.
 *
 * Found 2026-09-02 while scoping payroll. net_payable was picking + (days × daily_rate) +
 * adjustments − deductions, and staff carry no daily_rate BY DESIGN — the database forbids holding
 * both (scripts/141). So every term was zero for eight real people across three estates.
 *
 * Two of them, at Laxmi, have salaries of ₹17,000 and ₹16,000 sitting in the roster. Somebody
 * typed those in and payroll still said zero: monthly_wage was stored, validated, editable, and
 * read by nothing that pays anyone. The other six have no salary recorded at all, which now shows
 * as a warning rather than as a zero that looks settled.
 *
 * This is the house failure mode on a wage sheet — no error, a confident wrong answer — and the
 * reason it survived is that ₹0 for a worker nobody marked present looks exactly like an absence.
 */
const route = readFileSync(resolve(__dirname, "../app/api/payroll-summary/route.ts"), "utf8")
const tab = readFileSync(resolve(__dirname, "../components/payroll-summary-tab.tsx"), "utf8")

describe("who is paid a salary rather than a wage", () => {
  it("is derived from the worker-type table, not typed out a second time", () => {
    expect([...MONTHLY_PAID_WORKER_TYPES].sort()).toEqual(["proprietor", "staff", "staff_pf"])
  })

  it("agrees with isPaidDaily for every type, so the two can never drift", () => {
    for (const t of WORKER_TYPES) {
      expect(MONTHLY_PAID_WORKER_TYPES.includes(t.value), t.value).toBe(!isPaidDaily(t.value))
    }
  })

  it("the query is handed that list rather than hardcoding one in SQL", () => {
    expect(route).toContain("MONTHLY_PAID_WORKER_TYPES")
    expect(route).not.toMatch(/worker_type\s+IN\s*\(\s*'staff'/)
  })
})

describe("a monthly salary is paid, pro-rated, and not docked for absence", () => {
  it("pro-rates a day at a time by that month's own length", () => {
    // Verified against production: a full month pays the salary exactly, February pays it exactly
    // (a /30 divisor would not), half a month pays half, and Jan–Feb pays exactly two salaries.
    expect(route).toContain("EXTRACT(DAY FROM (date_trunc('month', d) + INTERVAL '1 month' - INTERVAL '1 day'))")
    expect(route).toContain("generate_series(${startDate}::date, ${endDate}::date, INTERVAL '1 day')")
  })

  it("replaces the day-rate arithmetic instead of adding to it", () => {
    // COALESCE order is the whole rule: salary, else allocated work, else days × rate. Adding them
    // would pay a salaried worker twice for the same month.
    expect(route).toContain("COALESCE(s.salary_total, m.muster_total, COALESCE(a.days_present, 0) * COALESCE(w.daily_rate, 0))")
  })

  it("does not reduce the salary by attendance", () => {
    // A salary is not attendance-driven, and FarmFlow cannot tell approved leave from a no-show
    // because it does not record leave at all. Docking from data that cannot support the
    // distinction would be a confident wrong answer on a wage sheet.
    const cte = route.slice(route.indexOf("salary_earnings AS ("), route.indexOf("ledger_totals AS ("))
    expect(cte).not.toContain("days_present")
    expect(cte).not.toContain("attendance_records")
  })

  it("pays a salaried worker even when nobody marked them present", () => {
    // Otherwise they drop off the sheet entirely and get missed on payday.
    expect(route).toContain("OR s.salary_total IS NOT NULL")
  })
})

describe("a missing salary is visible rather than silent", () => {
  it("is flagged per worker, the mirror of the missing-rate check", () => {
    expect(route).toContain("missingMonthlyWage: !isPaidDaily(r.worker_type) && r.monthly_wage == null")
  })

  it("only ever means someone who is supposed to have one", () => {
    // Same shape as the missing-daily-rate bug: a warning about rows that are already correct is a
    // warning people learn to dismiss.
    expect(route).not.toMatch(/missingMonthlyWage:\s*r\.monthly_wage == null[^&]/)
  })

  it("the screen says so, and marks which lines are salaries", () => {
    expect(tab).toContain("missingSalaryCount")
    expect(tab).toContain("no salary\n                recorded")
    expect((tab.match(/w\.fromSalary &&/g) ?? []).length).toBe(2) // mobile and desktop
  })
})
