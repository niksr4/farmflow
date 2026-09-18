import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Anything a person recorded, a person can correct or remove.
 *
 * This is a standing product rule and it exists because a record you cannot fix is a record people
 * stop trusting — `tests/edit-opens-the-record.test.ts` enforces the same thing for every other
 * list in the app.
 *
 * IT WAS BROKEN ON PURPOSE AND HAD TO BE POINTED OUT. app/api/worker-pay-rules was written with no
 * PUT and no DELETE, with a comment stating that as the design. The reasoning — that editing an
 * effective-dated rule rewrites history — sounded principled and was wrong: editing a rule row
 * changes only the span that row governs, and deleting one falls back to the rule before it.
 * Reproducibility is protected by the row being DATED, not by it being immutable. The exception
 * protected nothing and cost an estate the ability to fix a mistyped percentage.
 *
 * Asserted here so the next confident-sounding exception has to get past a test.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8")

/** Every .ts under a directory, recursively — route handlers nest by segment. */
const walkTs = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    return statSync(full).isDirectory() ? walkTs(full) : entry.endsWith(".ts") ? [full] : []
  })

const EDITABLE_RECORDS = [
  { what: "a pay rule", route: "app/api/worker-pay-rules/[id]/route.ts" },
  { what: "a ledger entry", route: "app/api/worker-ledger/[id]/route.ts" },
]

describe("every recorded thing can be corrected and removed", () => {
  it.each(EDITABLE_RECORDS)("$what has both a PUT and a DELETE", ({ route }) => {
    const source = read(route)
    expect(source, `${route} needs a PUT`).toMatch(/export async function PUT/)
    expect(source, `${route} needs a DELETE`).toMatch(/export async function DELETE/)
  })

  it.each(EDITABLE_RECORDS)("$what is reachable from the UI, not just the API", ({ route }) => {
    // A route nothing calls is the same as no route. The money panel is the screen for both.
    const panel = read("components/workers/worker-money-panel.tsx")
    expect(panel).toContain('method: "PUT"')
    expect(panel).toContain('method: "DELETE"')
    expect(route).toBeTruthy()
  })
})

describe("the permission does not stop at creation", () => {
  /**
   * Advances, repayments and retention payouts are admin-only to record. A writer who cannot create
   * a Rs 20,000 advance must not be able to edit its amount or delete it either — otherwise the gate
   * is decoration. `accounts` is in USER_MUTATION_MODULES, so canWriteModule/canDeleteModule alone
   * would let them straight through.
   */
  const ledgerItem = read("app/api/worker-ledger/[id]/route.ts")

  it("editing and deleting an advance need the same admin check as creating one", () => {
    expect(ledgerItem).toContain("ADMIN_ONLY_ENTRY_TYPES")
    expect(ledgerItem).toContain("isAdminRole(sessionUser.role)")
    // Both verbs, not just one.
    const put = ledgerItem.slice(ledgerItem.indexOf("export async function PUT"), ledgerItem.indexOf("export async function DELETE"))
    const del = ledgerItem.slice(ledgerItem.indexOf("export async function DELETE"))
    expect(put, "PUT is not admin-gated").toContain("isAdminRole")
    expect(del, "DELETE is not admin-gated").toContain("isAdminRole")
  })

  it("checks the row's existing type, not only the one being sent", () => {
    // Otherwise a writer edits an advance by relabelling it a deduction on the way past.
    expect(ledgerItem).toMatch(/needsAdmin\(\s*current\?\.entry_type/)
  })

  it("pay rules are admin-only to change and to remove", () => {
    const rules = read("app/api/worker-pay-rules/[id]/route.ts")
    expect((rules.match(/isAdminRole\(sessionUser\.role\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe("clearing a value is possible, so COALESCE is not used for nullable fields", () => {
  /**
   * null is a real value in both of these — an empty retention rule is how an estate STOPS
   * retaining, and a null recover_from means "the period containing entry_date". COALESCE would
   * make both unreachable while looking like it worked, which is the trap the rainfall edit path
   * had and the terminal-estate edit path had after it.
   */
  it("a pay rule can be emptied", () => {
    const rules = read("app/api/worker-pay-rules/[id]/route.ts")
    expect(rules).not.toMatch(/retention_mode\s*=\s*COALESCE\(/)
    expect(rules).not.toMatch(/overtime_mode\s*=\s*COALESCE\(/)
    expect(rules).toMatch(/retention_mode\s*=\s*CASE WHEN/)
  })

  it("an advance's recover_from can be cleared", () => {
    const ledger = read("app/api/worker-ledger/[id]/route.ts")
    expect(ledger).not.toMatch(/recover_from\s*=\s*COALESCE\(/)
    expect(ledger).toMatch(/recover_from\s*=\s*CASE WHEN/)
  })

  it("an invoice's notes and IRN metadata can be cleared", () => {
    // Found by the daily scan on 2026-09-18. All four are `z.string().optional().nullable()` in
    // this route's own schema and nullable columns in billing_invoices, so null was an accepted
    // input that COALESCE then discarded — voiding an IRN was impossible.
    const invoice = read("app/api/billing/invoices/[id]/route.ts")
    for (const column of ["notes", "irn", "irn_ack_no", "irn_ack_date"]) {
      expect(invoice, `${column} still uses COALESCE`).not.toMatch(
        new RegExp(`${column}\\s*=\\s*COALESCE\\(`),
      )
      expect(invoice, `${column} does not use CASE WHEN`).toMatch(new RegExp(`${column}\\s*=\\s*CASE WHEN`))
    }
  })

  /**
   * ⚠ DERIVED, NOT HAND-LISTED. The three checks above name their routes, and a list of three is
   * how the invoice route sat broken for however long — it was found by a scanner reading the file,
   * not by anything failing.
   *
   * The rule is derivable from the route itself: a field declared `.nullable()` in its own zod
   * schema has null as an ACCEPTED INPUT, and `col = COALESCE($param, col)` can never write it.
   * So every route is checked against its own declaration, and a new nullable field is covered the
   * day it is added.
   *
   * Swept manually when this was written: every other self-referential COALESCE in app/ and lib/
   * targets a NOT NULL column (amount, entry_type, kg_picked, rate, status, headcount,
   * recover_over_periods — that last one INTEGER NOT NULL DEFAULT 1), where keeping the old value
   * is exactly right. This finds the ones where it is not.
   */
  it("no route COALESCEs a field its own schema declares nullable", () => {
    const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
    const offenders: string[] = []

    for (const file of walkTs(resolve(__dirname, "..", "app/api"))) {
      const src = readFileSync(file, "utf8")
      if (!src.includes(".nullable()")) continue

      // `field: z.<type>()....nullable()` — the field names this route accepts null for.
      const nullableFields = [...src.matchAll(/(\w+)\s*:\s*z\.[^,\n]*\.nullable\(\)/g)].map((m) => m[1])
      for (const field of new Set(nullableFields)) {
        const column = toSnake(field)
        const bad = new RegExp(`\\b${column}\\s*=\\s*COALESCE\\(\\$\\{`)
        if (bad.test(src)) {
          offenders.push(`${file.slice(file.indexOf("app/api"))}: ${column} is nullable but uses COALESCE`)
        }
      }
    }

    expect(offenders, "null is an accepted input for these, so COALESCE makes it unwritable").toEqual([])
  })
})

describe("what is derived is not hand-editable", () => {
  it("a retention accrual has no edit control", () => {
    // It is computed from days worked and the rule in force. Editing the number would leave a
    // figure with no working behind it that payroll would recompute differently next time.
    const panel = read("components/workers/worker-money-panel.tsx")
    expect(panel).toContain('e.entryType !== "retention_accrual"')
  })

  it("and cannot be created through the API either", () => {
    const ledger = read("app/api/worker-ledger/route.ts")
    const typed = ledger.slice(ledger.indexOf("const TYPED_ENTRY_TYPES"), ledger.indexOf("const ADMIN_ONLY_ENTRY_TYPES"))
    expect(typed).not.toContain("retention_accrual")
  })
})

describe("a change to somebody's pay is answerable afterwards", () => {
  it.each(EDITABLE_RECORDS)("$what records before and after in the audit log", ({ route }) => {
    const source = read(route)
    expect(source).toContain("logAuditEvent")
    expect(source).toMatch(/before/)
  })
})
