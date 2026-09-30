import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A worker's day cannot be booked twice.
 *
 * REPORTED BY HONEYFARM, 2026-09-01: KAB was sure he had given most people one job a day, and the
 * muster showed people on two jobs at a full day each. He was right about what he did. Every
 * morning he sets work in two batches -- one job, then the next -- and each batch used "Select all
 * present". The second tap silently re-selected the twenty-odd people the first had just given a
 * full day to.
 *
 *   27 Aug – 1 Sep: 81 worker-days booked that nobody worked. Rs 38,824.
 *
 * NOBODY TYPED A WRONG NUMBER. Two correct-looking actions composed into a wrong total, and the
 * total was the one figure never shown. This is the house failure mode -- no error, a confident
 * wrong answer -- and it is why the guard is at three levels: the database cannot store it, the
 * route explains it, and the panel does not let you walk into it.
 *
 * THE CEILING WAS 2.0 AND SHOULD NEVER HAVE BEEN. Script 116 justified it with overtime. The UI
 * then solved overtime as a pay multiplier that leaves the day at one (DAY_SHARES, "Holiday 2x"),
 * deliberately, so a block is not shown twice the labour it received -- so the client has never
 * once sent day_fraction > 1. The ceiling permitted nothing legitimate and exactly one mistake.
 */
/**
 * ⚠ 145 IS HISTORY; 152 IS WHAT RUNS.
 *
 * scripts/152 replaces labour_assignments_day_cap()'s body so picking and day-work share one day
 * budget. These assertions used to read 145 and would have kept passing after that -- green against
 * a file whose contents no longer execute, which is the most comfortable kind of dead guard. The
 * ceiling, the job limit and the self-exclusion are therefore checked against 152, and 145 is read
 * only to prove its no-rewrite promise still holds.
 */
const legacyCap = readFileSync("scripts/145-labour-day-cap-one-day.sql", "utf8")
const cap = readFileSync("scripts/152-picking-shares-the-day-budget.sql", "utf8")
const route = readFileSync("app/api/attendance/assignments/route.ts", "utf8")
const panel = readFileSync("components/attendance/worker-allocation.tsx", "utf8")
const muster = readFileSync("components/attendance-tab.tsx", "utf8")

describe("the database will not store more than a day", () => {
  it("the ceiling is one day, not two", () => {
    expect(cap).toMatch(/ceiling\s+CONSTANT NUMERIC := 1\.0/)
    expect(cap).not.toMatch(/ceiling\s+CONSTANT NUMERIC := 2\.0/)
  })

  it("and caps the number of jobs at two", () => {
    expect(cap).toMatch(/max_jobs CONSTANT INTEGER := 2/)
    expect(cap).toContain("jobs + 1 > max_jobs")
  })

  it("checks siblings, excluding the row being updated -- from its OWN table only", () => {
    /**
     * Without excluding the row being written, an ordinary edit counts itself and every correction
     * fails. But the exclusion has to be PER TABLE now that two tables share the budget: a bare
     * `id <> p_row_id` applied to both would drop a picking row whose uuid happened to equal a
     * labour row's, silently raising the ceiling for that worker on that day.
     */
    expect(cap).toContain("p_source = 'labour_assignments' AND id = p_row_id")
    expect(cap).toContain("p_source = 'picking_records' AND id = p_row_id")
  })

  it("counts BOTH arms of the day, not each table on its own", () => {
    // Per-table sums would make the real ceiling two days and the real job limit four.
    expect(cap).toMatch(/FROM labour_assignments/)
    expect(cap).toMatch(/FROM picking_records/)
    expect(cap).toContain("used := labour_used + picking_used")
    expect(cap).toContain("jobs := labour_jobs + picking_jobs")
  })

  it("puts the same wall in front of picking, not only day-work", () => {
    // A cap on one table is not a shared budget; it is the same hole with a longer name.
    expect(cap).toMatch(/CREATE TRIGGER trg_picking_records_day_cap[\s\S]*?ON picking_records/)
    expect(cap).toMatch(/BEFORE INSERT OR UPDATE ON picking_records/)
  })

  it("lets a correction go DOWN on both tables", () => {
    // 145 had to invent this for labour because HoneyFarm already had 81 over-booked days. Picking
    // needs it for the same reason the day it has rows: halving one of two jobs must not be refused.
    const downward = cap.match(/NEW\.day_fraction <= OLD\.day_fraction/g) ?? []
    expect(downward.length, "both wrappers need the downward-edit exemption").toBe(2)
  })

  it("locks the worker-day before summing, so two writers cannot both find room", () => {
    /**
     * Without a lock the guard is a read-then-write race: two transactions -- one filing picking,
     * one filing day-work -- read the same pre-write totals under READ COMMITTED, both find room,
     * both commit, and the stored day is over one with no error raised anywhere.
     *
     * Raised by CodeRabbit on PR #55 as Major, and correct: scripts/145 has had this hole for
     * labour-against-labour since it shipped, and sharing the budget widens it to two tabs that
     * different people use simultaneously during harvest.
     *
     * Verified on dev that the lock is genuinely taken -- pg_locks reports one advisory lock held by
     * the backend during the write.
     */
    expect(cap).toContain("pg_advisory_xact_lock")
    // Keyed on the worker-DAY, not the worker: locking per worker would serialise a whole harvest.
    expect(cap).toMatch(/hashtextextended\([\s\S]{0,120}p_worker_id[\s\S]{0,60}p_day/)
    // Before either sum, or it serialises nothing that matters.
    expect(
      cap.indexOf("pg_advisory_xact_lock"),
      "the lock must be taken before the totals are read",
    ).toBeLessThan(cap.indexOf("INTO labour_used"))
  })

  it("treats a re-dated or reassigned row as new to its destination day", () => {
    /**
     * `TG_OP = 'INSERT'` alone skipped the job-count check on every UPDATE. So an edit that moved a
     * half-day entry onto a day already holding two jobs passed -- the fractions fit, the count was
     * never consulted, and the day quietly became three jobs. Both wrappers had it; 145 had it
     * first. Proven on dev: the move is now refused with "already has 2 jobs".
     */
    const moved = cap.match(/IS DISTINCT FROM OLD\.(worker_id|work_date|pick_date)/g) ?? []
    // worker_id + work_date on the labour wrapper, worker_id + pick_date on the picking one.
    expect(moved.length, "both wrappers must check a move, on worker AND date").toBe(4)
  })

  it("says WHERE the rest of the day went, so the writer knows which tab to open", () => {
    // "already has a day booked" sends somebody hunting across two tabs. Naming the split is the
    // same lesson as the muster's remove-work message.
    expect(cap).toContain("from picking")
    expect(cap).toContain("from day-work on the muster")
  })

  it("leaves the already-over-booked rows alone rather than rewriting a wage ledger", () => {
    for (const [name, sql] of [["152", cap], ["145", legacyCap]] as const) {
      expect(sql, `${name} must not rewrite wage rows`).not.toMatch(/\bDELETE FROM labour_assignments\b/)
      expect(sql, `${name} must not rewrite wage rows`).not.toMatch(/\bUPDATE labour_assignments\b/)
      expect(sql, `${name} must not rewrite wage rows`).not.toMatch(/\bDELETE FROM picking_records\b/)
      expect(sql, `${name} must not rewrite wage rows`).not.toMatch(/\bUPDATE picking_records\b/)
    }
  })
})

describe("the panel does not let you walk into the wall", () => {
  it("defaults to half a day when the person already has work", () => {
    expect(panel).toContain("editing?.dayFraction ?? (alreadyBooked ? 0.5 : 1)")
  })

  it("disables a share that would not fit in what is left of the day", () => {
    // Bound is allowedShare, not remaining -- see the correction-path block below for why.
    expect(panel).toContain("const overruns = share.value > allowedShare + 0.0001")
    expect(panel).toContain("disabled={overruns}")
    expect(panel).toContain("const remaining = Math.max(0, 1 - Number(dayAlreadyUsed || 0))")
  })

  it("refuses to submit one, so the message is a sentence and not a 409", () => {
    expect(panel).toContain("if (dayFraction > allowedShare + 0.0001) return")
  })

  it("says what is already booked instead of leaving the total invisible", () => {
    // The whole failure was a sum nobody displayed.
    expect(panel).toContain("Two jobs in a day is half a day each")
  })
})

describe("select-all does not re-pick people who already have a full day", () => {
  it("selects the free, not everyone present", () => {
    expect(muster).toContain("presentSet.has(w.id) && !isFullyBooked(w.id)")
    expect(muster).toContain("Select all free")
    expect(muster).not.toContain(">\n                  Select all present\n")
  })

  it("adds the day up per worker, which is the number that was missing", () => {
    expect(muster).toContain("const dayUsedByWorker")
    expect(muster).toContain("const isFullyBooked")
  })

  it("an edit does not count itself when working out what is left", () => {
    expect(muster).toContain("(editingAssignment?.dayFraction ?? 0)")
  })
})

describe("the route explains the cap rather than leaking the trigger", () => {
  it("tells the writer what to do about it", () => {
    expect(route).toContain("Two jobs in a day is half a day each")
    expect(route).not.toContain("more than two days in one day")
  })
})

describe("an already over-booked day is visible, so it can be corrected", () => {
  it("marks the worker with the total, not just the two job rows", () => {
    // KAB is going back through five days to delete the wrong job per person. Without this he is
    // hunting: two jobs at a full day each look exactly like a legitimate split, and the sum --
    // the only thing that distinguishes them -- was never on the screen.
    expect(muster).toContain("dayBooked > 1.0001")
    expect(muster).toContain("{dayBooked} days")
  })

  it("only flags over a day, so a normal 0.5 + 0.5 split stays quiet", () => {
    // Flagging every split would make the badge noise and it would stop being read.
    expect(muster).not.toContain("dayBooked > 0.5")
    expect(muster).not.toContain("rows.length > 1 &&")
  })
})

describe("the correction path is not blocked by the guard that created it", () => {
  it("the panel mirrors the database's downward-edit exemption", () => {
    // Shipped without this and the panel locked solid on exactly the rows it exists to repair:
    // editing either job of a 2 x full day left remaining = 0, disabling every share AND the save
    // button, so delete-and-retype was the only way out. 135 worker-days across three estates.
    expect(panel).toContain(
      "const allowedShare = editing?.dayFraction != null ? Math.max(remaining, editing.dayFraction) : remaining",
    )
  })

  it("every gate uses the edit-aware bound, not the raw remainder", () => {
    expect(panel).toContain("if (dayFraction > allowedShare + 0.0001) return")
    expect(panel).toContain("const overruns = share.value > allowedShare + 0.0001")
    expect(panel).toContain("dayFraction > allowedShare + 0.0001}")
    // The raw remainder must not still be gating anything.
    expect(panel).not.toContain("> remaining + 0.0001")
  })

  it("adding NEW work to a full day is still refused", () => {
    // allowedShare falls back to `remaining` when nothing is being edited, so the guard holds.
    expect(panel).toContain(": remaining")
  })

  it("the route no longer promises a two-day share the trigger would refuse", () => {
    expect(route).not.toContain("at most 2 (a full day plus overtime)")
    expect(route).toContain("at most a full day")
    expect((route.match(/dayFraction <= 1\)/g) ?? []).length).toBe(2)
  })
})

describe("the batch panel does not lose what was typed into it", () => {
  it("has a stable key, so tapping one more person keeps the code and the contract price", () => {
    expect(muster).toContain('key="batch"')
    expect(muster).not.toContain("key={`batch-${batchIds.length}`}")
  })

  it("clamps the share itself instead, since it no longer remounts to re-default", () => {
    expect(panel).toContain("if (dayFraction > allowedShare + 0.0001) setDayFraction(")
  })
})

describe("the muster follows the app's money rule", () => {
  it("costs go through formatCurrency, not a bare toLocaleString", () => {
    // Rounding to the rupee was applied app-wide today; the muster's own rows were still printing
    // raw, so the day total rounded and the lines under it did not.
    expect(muster).toContain("formatCurrency(a.totalCost)")
    expect(muster).not.toContain('a.totalCost.toLocaleString("en-IN")')
  })
})
