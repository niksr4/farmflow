import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * An expense that will not save has to say why.
 *
 * HoneyFarm, 2026-09-03: six failed saves in eight minutes, all
 * "value too long for type character varying(10)" (SQLSTATE 22001). Six attempts is somebody
 * retrying with variations, and it is what "Failed to process expense" earns — the message named
 * neither the field nor the problem.
 *
 * TWO SEPARATE WALLS STAND BEHIND ONE FIELD, and this is why widening the column was not the fix
 * on its own:
 *
 *   22001  the code was longer than varchar(10). The form's own placeholder is "e.g. Fertiliser,
 *          Fuel" — it invites a word, and "Maintenance" is eleven characters. scripts/148 widens
 *          it to 64.
 *   23503  expense_transactions has FOREIGN KEY (code, tenant_id) REFERENCES account_activities,
 *          so a code that is not already saved is refused. All 87 of HoneyFarm's codes are
 *          numeric, so widening the column would have moved their failure here and changed
 *          nothing the writer could see.
 *
 * The form believes otherwise — its comment reads "Expenses allow ad-hoc codes that aren't in the
 * saved list yet", which the database has never permitted. That contradiction is a product
 * decision (auto-create the code, or make the field a picker) and is recorded in STATUS.md rather
 * than guessed at here. Until it is settled, the least this route can do is say which wall was hit.
 */
const route = readFileSync(resolve(__dirname, "../app/api/expenses-neon/route.ts"), "utf8")
const migration = readFileSync(resolve(__dirname, "../scripts/148-expense-code-fits-a-word.sql"), "utf8")

describe("the column fits the word the form asks for", () => {
  it("widens all three code columns together", () => {
    for (const table of ["expense_transactions", "labor_transactions", "account_activities"]) {
      expect(migration).toContain(`ALTER TABLE ${table}`)
    }
    expect(migration).toContain("VARCHAR(64)")
  })

  it("rebuilds the dependent views WITH security_invoker", () => {
    // Postgres refuses the ALTER while a view reads the column, so both come down and go back up.
    // A view rebuilt without security_invoker runs as its owner and bypasses RLS — a column
    // widening turning into a cross-tenant leak.
    expect(migration).toContain("CREATE VIEW labour_cost WITH (security_invoker = true)")
    expect(migration).toContain("CREATE VIEW estate_cost WITH (security_invoker = true)")
    expect(migration).toContain("lost security_invoker")
  })

  it("drops estate_cost before labour_cost, since one reads the other", () => {
    expect(migration.indexOf("DROP VIEW estate_cost")).toBeLessThan(migration.indexOf("DROP VIEW labour_cost"))
    expect(migration.indexOf("CREATE VIEW labour_cost")).toBeLessThan(migration.indexOf("CREATE VIEW estate_cost"))
  })

  it("replays the view definitions rather than transcribing them", () => {
    // labour_cost is 2,500 characters that eight routes depend on. Retyping it to change a column
    // width elsewhere is how a definition drifts from the one that was tested.
    expect(migration).toContain("pg_get_viewdef")
  })
})

describe("both walls are named when they are hit", () => {
  it("an unknown code says so, and says where to add one", () => {
    expect(route).toContain("isUnknownActivityCodeError")
    expect(route).toContain("expense_transactions_code_tenant_id_fkey")
    expect(route).toContain("not on your list yet")
  })

  it("an over-long code says so too", () => {
    expect(route).toContain("isCodeTooLongError")
    expect(route).toContain("too long")
  })

  it("covers create, update AND delete — an edit hits the same walls", () => {
    // Four handlers in this file return "Failed to process expense". Three of them are mutations
    // that carry the code, and patching only the one that happened to be reported is how the next
    // person hits an identical dead end through the edit form instead.
    expect((route.match(/isUnknownActivityCodeError\(error\)/g) ?? []).length).toBe(3)
    expect((route.match(/isCodeTooLongError\(error\)/g) ?? []).length).toBe(3)
  })

  it("each branch sits ahead of its own catch-all, or the message is unreachable", () => {
    for (const action of ["create_expense", "update_expense", "delete_expense"]) {
      const handlerEnd = route.indexOf(`action: "${action}"`)
      const block = route.slice(0, handlerEnd)
      const lastSpecific = block.lastIndexOf("isUnknownActivityCodeError(error)")
      expect(lastSpecific, `${action} has no code-error branch before its logger`).toBeGreaterThan(-1)
      // and it is inside this handler rather than a previous one
      const prevHandler = block.lastIndexOf("} catch (error: any) {")
      expect(lastSpecific, `${action}'s branch is in an earlier handler`).toBeGreaterThan(prevHandler)
    }
  })

  it("returns 400, not 500 — the input is wrong, not the server", () => {
    const start = route.indexOf("isUnknownActivityCodeError(error)")
    const block = route.slice(start, start + 500)
    expect(block).toContain("status: 400")
    expect(block).not.toContain("status: 500")
  })
})
