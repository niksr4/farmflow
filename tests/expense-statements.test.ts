import { describe, expect, it } from "vitest"

import {
  buildDeleteExpenseInventoryLinksStatement,
  buildDeleteExpenseStatement,
  buildInsertExpenseInventoryLinksStatement,
  buildUpdateExpenseStatement,
  buildValuesClause,
} from "@/lib/server/expenses/statements"

/**
 * These build the SQL that writes money. They are pure, so the thing worth checking is the one
 * thing a type checker cannot: that every `$n` in the text points at the value the caller meant.
 *
 * An off-by-one here does not throw. It sends a valid query with the wrong values bound — a
 * quantity into a cost column, one tenant's id into another's WHERE — and the first symptom is a
 * number nobody can explain.
 */

/** Resolve a statement's placeholders against its params, so a test reads like the final SQL. */
const resolve = (stmt: { text: string; params: any[] }) =>
  stmt.text.replace(/\$(\d+)/g, (_, n) => {
    const value = stmt.params[Number(n) - 1]
    if (value === undefined) return `<UNBOUND $${n}>`
    return value === null ? "NULL" : JSON.stringify(value)
  })

describe("buildValuesClause", () => {
  it("numbers placeholders across rows, continuing rather than restarting", () => {
    expect(buildValuesClause(2, 3)).toBe("($1, $2, $3), ($4, $5, $6)")
  })

  it("starts where the caller says, so it can follow parameters already bound", () => {
    expect(buildValuesClause(2, 2, 5)).toBe("($5, $6), ($7, $8)")
  })

  it("handles the single-row case", () => {
    expect(buildValuesClause(1, 4)).toBe("($1, $2, $3, $4)")
  })

  it("produces nothing for no rows, rather than an empty tuple Postgres would reject", () => {
    expect(buildValuesClause(0, 3)).toBe("")
  })
})

describe("buildUpdateExpenseStatement", () => {
  const base = {
    id: 42,
    tenantId: "tenant-a",
    date: "2026-09-17",
    code: "101",
    amount: 2500,
    notes: "diesel",
    locationId: null,
    supportsLocation: false,
    inventoryItemType: null,
    inventoryQuantity: null,
    supportsInventoryLink: false,
  }

  it("binds the four always-present columns in order", () => {
    const stmt = buildUpdateExpenseStatement(base)
    expect(stmt.params.slice(0, 4)).toEqual(["2026-09-17", "101", 2500, "diesel"])
    expect(stmt.text).toContain("entry_date = $1::timestamp")
    expect(stmt.text).toContain("total_amount = $3")
  })

  it("leaves no placeholder unbound in any column combination", () => {
    // The real risk: params.push() returns the NEW length, and the assignments interleave with it.
    // Any combination that lands a $n past the end of params would be a silently wrong query.
    for (const supportsLocation of [false, true]) {
      for (const supportsInventoryLink of [false, true]) {
        const stmt = buildUpdateExpenseStatement({
          ...base,
          supportsLocation,
          supportsInventoryLink,
          locationId: supportsLocation ? "loc-1" : null,
          inventoryItemType: supportsInventoryLink ? "Urea" : null,
          inventoryQuantity: supportsInventoryLink ? 25 : null,
        })
        expect(resolve(stmt), `location=${supportsLocation} inventory=${supportsInventoryLink}`).not.toContain("UNBOUND")
        const highest = Math.max(...[...stmt.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
        expect(highest, "highest placeholder must not exceed the parameter count").toBe(stmt.params.length)
      }
    }
  })

  it("scopes the WHERE to the tenant as well as the id — the row is not addressable by id alone", () => {
    const stmt = buildUpdateExpenseStatement(base)
    const sql = resolve(stmt)
    expect(sql).toContain('WHERE id = 42')
    expect(sql).toContain('AND tenant_id = "tenant-a"')
  })

  it("adds the optional columns only when the schema supports them", () => {
    expect(buildUpdateExpenseStatement(base).text).not.toContain("location_id =")
    expect(
      buildUpdateExpenseStatement({ ...base, supportsLocation: true, locationId: "loc-1" }).text,
    ).toContain("location_id =")
  })

  it("casts the location to uuid, which a bare text parameter would not be", () => {
    const stmt = buildUpdateExpenseStatement({ ...base, supportsLocation: true, locationId: "loc-1" })
    expect(stmt.text).toMatch(/location_id = \$\d+::uuid/)
  })
})

describe("the delete statements are tenant-scoped", () => {
  /**
   * Both take an id and a tenant. A delete scoped to the id alone would reach across tenants, and
   * RLS is the backstop rather than the only line — these run under the owner connection in some
   * paths.
   */
  it("expense delete", () => {
    const stmt = buildDeleteExpenseStatement(7, "tenant-a")
    expect(resolve(stmt)).toBe('DELETE FROM expense_transactions WHERE id = 7 AND tenant_id = "tenant-a"')
  })

  it("inventory-link delete", () => {
    const stmt = buildDeleteExpenseInventoryLinksStatement(7, "tenant-a")
    expect(resolve(stmt)).toContain('tenant_id = "tenant-a"')
    expect(resolve(stmt)).toContain("expense_transaction_id = 7")
  })
})

describe("buildInsertExpenseInventoryLinksStatement", () => {
  const items = [
    { itemType: "Urea", quantity: 25 },
    { itemType: "DAP", quantity: 10 },
  ]

  /** Returns null when there is nothing to insert; every test below needs the statement. */
  const build = (rows: typeof items) => {
    const stmt = buildInsertExpenseInventoryLinksStatement(7, "tenant-a", rows as any)
    expect(stmt, "expected a statement for a non-empty item list").not.toBeNull()
    return stmt as { text: string; params: any[] }
  }

  it("writes no statement at all for an empty item list", () => {
    // An INSERT with no VALUES rows is a syntax error, so the caller is given nothing to run.
    expect(buildInsertExpenseInventoryLinksStatement(7, "tenant-a", [] as any)).toBeNull()
  })

  it("binds every row's values, with no placeholder left over", () => {
    const stmt = build(items)
    expect(resolve(stmt)).not.toContain("UNBOUND")
    const highest = Math.max(...[...stmt.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
    expect(highest).toBe(stmt.params.length)
  })

  it("keeps each item's quantity with its own item type", () => {
    const stmt = build(items)
    const sql = resolve(stmt)
    // Urea's 25 and DAP's 10 must not cross over — the failure this shape produces is silent.
    const ureaAt = sql.indexOf('"Urea"')
    const dapAt = sql.indexOf('"DAP"')
    expect(ureaAt).toBeGreaterThan(-1)
    expect(dapAt).toBeGreaterThan(ureaAt)
    expect(sql.slice(ureaAt, dapAt)).toContain("25")
    expect(sql.slice(dapAt)).toContain("10")
  })
})
