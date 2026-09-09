/**
 * One month of an estate, written down once.
 *
 * Imported by BOTH the seeder (scripts/dev/simulate-payroll-month.mjs, which writes it into the dev
 * database so it can be clicked through) and the report (tests/payroll-month-report.test.ts, which
 * runs it through the real lib/payroll-period.ts and prints the wage sheet). One definition, so the
 * screen and the report cannot disagree about what happened.
 *
 * August 2026, four whole weeks. Medappa pay weekly on a Saturday, so a week runs Sunday to
 * Saturday:
 *
 *   W1  Sun 2 Aug  – Sat 8 Aug
 *   W2  Sun 9 Aug  – Sat 15 Aug
 *   W3  Sun 16 Aug – Sat 22 Aug
 *   W4  Sun 23 Aug – Sat 29 Aug
 *
 * Days are written as a pattern per week: 1 = a full day, 0.5 = a half, 0 = not worked. Six
 * entries, Monday to Saturday, because nobody musters on a Sunday.
 */

export const WEEKS = [
  { index: 0, start: "2026-08-02", end: "2026-08-08", label: "W1 · 2–8 Aug" },
  { index: 1, start: "2026-08-09", end: "2026-08-15", label: "W2 · 9–15 Aug" },
  { index: 2, start: "2026-08-16", end: "2026-08-22", label: "W3 · 16–22 Aug" },
  { index: 3, start: "2026-08-23", end: "2026-08-29", label: "W4 · 23–29 Aug" },
]

/** Monday…Saturday of a given week start (which is a Sunday). */
export const daysOfWeek = (weekStart) => {
  const out = []
  const d = new Date(`${weekStart}T00:00:00Z`)
  for (let i = 1; i <= 6; i += 1) {
    const x = new Date(d)
    x.setUTCDate(d.getUTCDate() + i)
    out.push(x.toISOString().slice(0, 10))
  }
  return out
}

/**
 * The estate's default rule: Manoj's, as he stated it.
 *   20% of the day's pay, an 8-hour day, overtime at 1.2x the hourly rate (Rs 90 on Rs 600).
 */
export const ESTATE_RULE = {
  workerId: null,
  effectiveFrom: "2026-04-01",
  retentionMode: "percent_of_day",
  retentionValue: 20,
  overtimeMode: "multiplier_of_hourly",
  overtimeValue: 1.2,
  fullDayHours: 8,
  pfPercent: null,
}

/**
 * Ten people, chosen so that between them they exercise everything the model claims to handle.
 * `slot` is the position in the roster the seeder assigns them to, so the same person gets the same
 * story every run.
 */
export const WORKERS = [
  {
    slot: 0,
    key: "steady",
    story: "Works every day. Nothing owed, nothing unusual. The baseline everything else is read against.",
    rate: 600,
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
  },
  {
    slot: 1,
    key: "half_days",
    story: "Several half days. Retention must follow the fraction, not the headcount.",
    rate: 600,
    weeks: [
      [1, 0.5, 1, 1, 0.5, 1],
      [1, 1, 0.5, 1, 1, 1],
      [0.5, 0.5, 1, 1, 1, 1],
      [1, 1, 1, 0.5, 1, 1],
    ],
  },
  {
    slot: 2,
    key: "big_advance",
    story: "Rs 20,000 advance on 12 Aug, recovered over 10 weekly runs at Rs 2,000.",
    rate: 600,
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
    ledger: [{ type: "advance", date: "2026-08-12", amount: 20000, periods: 10, note: "School fees" }],
  },
  {
    slot: 3,
    key: "thin_week",
    story:
      "Rs 10,000 advance recovered in ONE run, in a week they only worked two days. The wage cannot go negative, so the rest is stated and stays owed.",
    rate: 600,
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
    ledger: [{ type: "advance", date: "2026-08-10", amount: 10000, periods: 1, note: "Medical" }],
  },
  {
    slot: 4,
    key: "repaid_early",
    story: "Took Rs 8,000 over 4 runs, then handed Rs 3,000 back in cash on the 20th.",
    rate: 600,
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
    ledger: [
      { type: "advance", date: "2026-08-05", amount: 8000, periods: 4, note: "Roof repair" },
      { type: "repayment", date: "2026-08-20", amount: 3000, periods: 1, note: "Returned in cash" },
    ],
  },
  {
    slot: 5,
    key: "exempt",
    story: "Exempted from retention by a per-worker override. The estate default must not reach them.",
    rate: 750,
    rule: { effectiveFrom: "2026-06-01" }, // all-null = rules off for this person
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
  },
  {
    slot: 6,
    key: "overtime",
    story: "Regular days plus overtime hours in three of the four weeks. Rs 600/8h x 1.2 = Rs 90 an hour.",
    rate: 600,
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
    overtime: [
      { date: "2026-08-06", hours: 3 },
      { date: "2026-08-13", hours: 2 },
      { date: "2026-08-14", hours: 4 },
      { date: "2026-08-27", hours: 2.5 },
    ],
  },
  {
    slot: 7,
    key: "allowance_and_fine",
    story: "A Rs 2,000 harvest allowance in W2 and a Rs 500 deduction for a broken tool in W3.",
    rate: 600,
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
    ledger: [
      { type: "adjustment", date: "2026-08-12", amount: 2000, periods: 1, note: "Harvest allowance" },
      { type: "deduction", date: "2026-08-19", amount: 500, periods: 1, note: "Broken pruning saw" },
    ],
  },
  {
    slot: 8,
    key: "joined_late",
    story: "Started on the 17th. Weeks before that are simply absent, not zero-paid.",
    rate: 550,
    weeks: [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
  },
  {
    slot: 9,
    key: "rate_rise",
    story:
      "Paid Rs 600 for the first fortnight and Rs 700 after a rise on the 16th. Retention is 20% of whichever rate applied that day, without anybody editing a rule.",
    rate: 600,
    rateAfter: { from: "2026-08-16", rate: 700 },
    weeks: [
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ],
  },
]

/** The rate that applied on a given date for a worker, honouring a mid-month rise. */
export const rateOn = (worker, date) =>
  worker.rateAfter && date >= worker.rateAfter.from ? worker.rateAfter.rate : worker.rate

/** Flattened (date, fraction, rate) rows — what labour_assignments would hold. */
export function workedDaysFor(worker) {
  const out = []
  WEEKS.forEach((week, wi) => {
    daysOfWeek(week.start).forEach((date, di) => {
      const fraction = worker.weeks[wi]?.[di] ?? 0
      if (fraction > 0) out.push({ workDate: date, dayFraction: fraction, rate: rateOn(worker, date) })
    })
  })
  return out
}
