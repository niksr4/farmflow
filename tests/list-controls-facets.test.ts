import { describe, expect, it } from "vitest"
import { ALL_FACET_VALUES, UNSET_FACET_VALUE, applyListControls, facetValueOf } from "@/lib/list-controls"

type W = { name: string; type: string | null; estate: string | null; rate: number }
const rows: W[] = [
  { name: "Chandra", type: "chkroll_pf", estate: "Honeyfarm", rate: 494 },
  { name: "Margina", type: "seasonal_assam", estate: "Honeyfarm", rate: 460 },
  { name: "Bopaiah", type: "staff", estate: "Honeyfarm", rate: 0 },
  { name: "Chitra", type: "chkroll_pf", estate: "Sidapur", rate: 494 },
  { name: "Nobody", type: null, estate: null, rate: 0 },
]
const base = {
  items: rows,
  search: "",
  searchFields: (w: W) => [w.name, w.type],
  sorters: { name: (w: W) => w.name },
  sortValue: "name",
  sortDirection: "asc" as const,
}
const facets = [
  { key: "type", label: "Type", valueOf: (w: W) => w.type },
  { key: "estate", label: "Estate", valueOf: (w: W) => w.estate },
]

/**
 * Facets answer "show me only this kind", which search cannot: typing "chkroll" only works if the
 * label happens to sit in a searched field, and a roster of thirty-six across eight types is
 * exactly where scrolling stops being viable.
 */
describe("narrowing by a facet", () => {
  it("keeps only matching rows", () => {
    const out = applyListControls({ ...base, facets, facetValues: { type: "chkroll_pf" } })
    expect(out.map((w) => w.name)).toEqual(["Chandra", "Chitra"])
  })

  it("composes with another facet", () => {
    const out = applyListControls({ ...base, facets, facetValues: { type: "chkroll_pf", estate: "Sidapur" } })
    expect(out.map((w) => w.name)).toEqual(["Chitra"])
  })

  it("composes with search rather than replacing it", () => {
    const out = applyListControls({ ...base, search: "chan", facets, facetValues: { estate: "Honeyfarm" } })
    expect(out.map((w) => w.name)).toEqual(["Chandra"])
  })

  it("the sentinel means not filtering, and is not confusable with a real value", () => {
    const out = applyListControls({ ...base, facets, facetValues: { type: ALL_FACET_VALUES } })
    expect(out).toHaveLength(rows.length)
  })
})

describe("a missing value is a bucket, not an absence", () => {
  /**
   * "Workers with no type set" is a real thing to ask for -- it is the list you work through when
   * filling a roster. An empty string would be indistinguishable from "not filtering", which is
   * why the sentinel exists.
   */
  it("null becomes the unset bucket", () => {
    expect(facetValueOf(facets[0], rows[4])).toBe(UNSET_FACET_VALUE)
  })

  it("and can be selected", () => {
    const out = applyListControls({ ...base, facets, facetValues: { type: UNSET_FACET_VALUE } })
    expect(out.map((w) => w.name)).toEqual(["Nobody"])
  })

  it("whitespace counts as unset, not as its own value", () => {
    const spaced = [{ name: "Blank", type: "   ", estate: null, rate: 0 }]
    expect(facetValueOf(facets[0], spaced[0])).toBe(UNSET_FACET_VALUE)
  })
})

describe("nothing changes when no facet is configured", () => {
  it("returns search+sort exactly as before", () => {
    // Ten tabs already use this hook. Adding facets must be inert for every one of them.
    expect(applyListControls(base).map((w) => w.name))
      .toEqual(["Bopaiah", "Chandra", "Chitra", "Margina", "Nobody"])
  })
})
