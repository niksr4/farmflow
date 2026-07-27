import { describe, expect, it } from "vitest"
import { applyListControls } from "@/lib/list-controls"

type Row = { id: number; date: string; buyer: string; amount: number; notes: string | null }

const rows: Row[] = [
  { id: 1, date: "2026-07-01", buyer: "TATA Coffee", amount: 4000, notes: "advance" },
  { id: 2, date: "2026-07-15", buyer: "VSSSN", amount: 250, notes: null },
  { id: 3, date: "2026-06-20", buyer: "allanasons", amount: 12500, notes: "Bulk LOT" },
]

const base = {
  items: rows,
  search: "",
  searchFields: (r: Row) => [r.buyer, r.notes, r.date],
  sorters: {
    date: (r: Row) => r.date,
    amount: (r: Row) => r.amount,
    buyer: (r: Row) => r.buyer,
  },
  sortValue: "date",
  sortDirection: "desc" as const,
}

const ids = (list: Row[]) => list.map((r) => r.id)

describe("applyListControls — sorting", () => {
  it("sorts dates newest first by default direction", () => {
    expect(ids(applyListControls(base))).toEqual([2, 1, 3])
  })

  it("reverses on ascending", () => {
    expect(ids(applyListControls({ ...base, sortDirection: "asc" }))).toEqual([3, 1, 2])
  })

  it("compares numbers numerically, not lexically", () => {
    // Lexical ordering would put 250 above 4000.
    expect(ids(applyListControls({ ...base, sortValue: "amount", sortDirection: "desc" }))).toEqual([3, 1, 2])
    expect(ids(applyListControls({ ...base, sortValue: "amount", sortDirection: "asc" }))).toEqual([2, 1, 3])
  })

  it("compares strings case-insensitively via localeCompare", () => {
    // "allanasons" must not sort after "VSSSN" just because lowercase > uppercase in ASCII.
    expect(ids(applyListControls({ ...base, sortValue: "buyer", sortDirection: "asc" }))).toEqual([3, 1, 2])
  })

  it("returns items unsorted when the sort key is unknown", () => {
    expect(ids(applyListControls({ ...base, sortValue: "nope" }))).toEqual([1, 2, 3])
  })

  it("never mutates the input array", () => {
    const items = [...rows]
    applyListControls({ ...base, items, sortValue: "amount" })
    expect(ids(items)).toEqual([1, 2, 3])
  })
})

describe("applyListControls — search", () => {
  it("matches any configured field, case-insensitively", () => {
    expect(ids(applyListControls({ ...base, search: "tata" }))).toEqual([1])
    expect(ids(applyListControls({ ...base, search: "bulk lot" }))).toEqual([3])
  })

  it("matches substrings and ignores surrounding whitespace", () => {
    expect(ids(applyListControls({ ...base, search: "  SSS  " }))).toEqual([2])
  })

  it("treats null and undefined fields as empty rather than matching them", () => {
    // Row 2 has notes: null — searching "null" must not match it.
    expect(ids(applyListControls({ ...base, search: "null" }))).toEqual([])
  })

  it("returns everything for a blank search", () => {
    expect(ids(applyListControls({ ...base, search: "   " }))).toEqual([2, 1, 3])
  })

  it("still sorts the filtered subset", () => {
    const result = applyListControls({ ...base, search: "a", sortValue: "amount", sortDirection: "asc" })
    expect(ids(result)).toEqual([1, 3])
  })

  it("skips client-side filtering when searchFields is omitted (server-side search)", () => {
    const result = applyListControls({ ...base, searchFields: undefined, search: "tata" })
    expect(ids(result)).toEqual([2, 1, 3])
  })

  it("returns an empty list when nothing matches", () => {
    expect(ids(applyListControls({ ...base, search: "zzzz" }))).toEqual([])
  })
})
