/**
 * useListControls memoises its sorted list on [items, search, sortValue, sortDirection,
 * facetValues] behind an eslint-disable whose comment reads "sorters are stable config".
 *
 * That was true of all 21 callers until #66 gave processing-tab a `bags` sorter that closes over
 * `processingRoute` -- then switching an estate from the wet route to the natural route left the
 * recent-entries list ordered by the PREVIOUS route's bag figure, because nothing in the dep array
 * had changed. The list is small and the figures are plausible either way, so it is the usual
 * FarmFlow failure: a confident wrong order, no error anywhere.
 *
 * tests/list-controls.test.ts exercises applyListControls, the PURE function, which is given its
 * sorters fresh on every call and therefore structurally cannot see this. The bug lives in the
 * hook's memo, so this test drives the real hook.
 *
 * Both halves matter and they pull opposite ways:
 *   - a changed `sorters` object alone does NOT re-sort. That is the hook's standing limitation,
 *     pinned here so the next caller who reaches for a closure finds it written down instead of
 *     discovering it on a live screen.
 *   - a changed `items` identity DOES re-sort. That is the property the processing-tab fix rides
 *     on: it resolves the bag figure into the rows, so a new route yields a new array.
 */
import { describe, expect, it } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { useState } from "react"
import { useListControls } from "@/hooks/use-list-controls"

type Row = { id: string; wet: number; natural: number }

const ROWS: Row[] = [
  { id: "mon", wet: 10, natural: 300 },
  { id: "tue", wet: 20, natural: 200 },
  { id: "wed", wet: 30, natural: 100 },
]

/**
 * The shape #66 originally shipped: the sorter reads the route out of its closure, and the rows
 * handed to the hook never change.
 */
function ClosureOverRoute() {
  const [route, setRoute] = useState<"wet" | "natural">("wet")
  const controls = useListControls(ROWS, {
    sorters: { bags: (r) => (route === "wet" ? r.wet : r.natural) },
    defaultSort: "bags",
    defaultDirection: "desc",
  })
  return (
    <div>
      <button type="button" onClick={() => setRoute("natural")}>
        switch route
      </button>
      <p data-testid="order">{controls.items.map((r) => r.id).join(",")}</p>
    </div>
  )
}

/** The fix: the route-dependent figure is resolved into the rows, so `items` identity moves. */
function ResolvedIntoRows() {
  const [route, setRoute] = useState<"wet" | "natural">("wet")
  const rows = ROWS.map((r) => ({ ...r, bagsOnRoute: route === "wet" ? r.wet : r.natural }))
  const controls = useListControls(rows, {
    sorters: { bags: (r) => r.bagsOnRoute },
    defaultSort: "bags",
    defaultDirection: "desc",
  })
  return (
    <div>
      <button type="button" onClick={() => setRoute("natural")}>
        switch route
      </button>
      <p data-testid="order">{controls.items.map((r) => r.id).join(",")}</p>
    </div>
  )
}

describe("useListControls and a sorter that depends on estate settings", () => {
  it("does NOT notice a sorter that only changed inside its own closure", () => {
    render(<ClosureOverRoute />)
    // Descending on the wet figure: wed 30, tue 20, mon 10.
    expect(screen.getByTestId("order").textContent).toBe("wed,tue,mon")

    act(() => {
      screen.getByText("switch route").click()
    })

    // The natural figures run the other way (mon 300 .. wed 100), so a hook that re-read its
    // sorters would now print "mon,tue,wed". It prints the old order instead. This is the
    // documented limitation, asserted so it cannot change without somebody deciding to change it.
    expect(screen.getByTestId("order").textContent).toBe("wed,tue,mon")
  })

  it("DOES re-sort when the route is resolved into the rows", () => {
    render(<ResolvedIntoRows />)
    expect(screen.getByTestId("order").textContent).toBe("wed,tue,mon")

    act(() => {
      screen.getByText("switch route").click()
    })

    // The property the processing-tab fix depends on. If this ever fails, that fix is silently
    // dead and the recent-entries list is back to sorting on the wrong route's bags.
    expect(screen.getByTestId("order").textContent).toBe("mon,tue,wed")
  })
})
