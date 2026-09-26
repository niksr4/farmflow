import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const form = readFileSync("components/other-expenses-tab.tsx", "utf8")
const route = readFileSync("app/api/expenses-neon/route.ts", "utf8")
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "")

describe("one fact, one field", () => {
  /**
   * "Type of cost" (the code) and "Cost name" (the description) were two required inputs for the
   * same thing, and the second was never stored: expense_transactions has no reference column, and
   * the API derives the name on read as COALESCE(aa.activity, et.code). So you could pick code 155,
   * type any name you liked, watch it on screen, save, and get the code's own name back.
   */
  it("there is no second free-text name input", () => {
    expect(strip(form)).not.toContain('htmlFor="expense-reference"')
    // Stripped, because the file explains in a comment why the field is gone -- and that
    // explanation is worth keeping.
    expect(strip(form)).not.toContain("Cost name")
    // The state that drove it goes too. Dead state is how a deleted input comes back.
    expect(form).not.toContain("referenceQuery")
  })

  it("the one remaining picker searches the code and the name together", () => {
    // "electricity" has to find 122 the same way typing 122 does, or removing the box loses a way in.
    expect(form).toContain("ActivitySuggestList")
    expect(form).toContain("filterActivitySuggestions")
  })

  it("confirms what the code resolved to rather than asking again", () => {
    expect(strip(form)).toContain("Recorded as")
  })

  it("and the name is still derived server-side, which is why the field was redundant", () => {
    expect(route).toContain("COALESCE(aa.activity, et.code) as reference")
  })
})

describe("an estate-wide cost does not have to name a block", () => {
  /**
   * Electricity, a phone bill, an audit fee: forcing these onto a block puts a cost per acre on
   * land that never saw the money. NULL already means "applies everywhere" everywhere else in the
   * app, and 9 of Laxmi's 21 expenses were already stored that way -- a state the data held but
   * this form could not produce.
   */
  it("offers the choice", () => {
    expect(strip(form)).toContain("<SelectItem value={LOCATION_ESTATE_WIDE}>Whole estate — not one block</SelectItem>")
  })

  it("stores it as NULL, not as a location id", () => {
    expect(strip(form)).toContain(
      "locationId: formLocationId && formLocationId !== LOCATION_ESTATE_WIDE ? formLocationId : null,",
    )
  })

  it("round-trips: editing an estate-wide cost shows it as such", () => {
    // Mapping a stored NULL to "" would show an empty picker and demand an answer it already had,
    // and the easiest way out of that prompt is to pick a block.
    expect(strip(form)).toContain("setFormLocationId(deployment.locationId || LOCATION_ESTATE_WIDE)")
  })
})

describe("the form asks in the order the decision happens", () => {
  /**
   * Amount used to be the third field, well above the stock section. That put the one required
   * number the form asks for BEFORE the question that decides whether the writer should be typing
   * a number at all: for a cost that is purely supplies out of the store, you met a required
   * Amount box, typed a figure, and an effect silently replaced it with the derived cost once you
   * linked the item further down. The answer was right and the work was wasted, with nothing
   * saying so. Laxmi's writer asked why the Cost box was there at all when the amount comes from
   * the quantity, which is the same confusion arriving from the other end.
   *
   * Comments stripped throughout, because the file now explains the ordering in prose that names
   * every one of these anchors -- and a guard satisfied by an explanation of the fix is not a
   * guard. That is the same trap this repo hit on PR #40.
   */
  const body = strip(form)
  const at = (needle: string) => {
    const i = body.indexOf(needle)
    expect(i, `expected to find ${needle} in the form`).toBeGreaterThan(-1)
    return i
  }

  it("asks whether the cost came out of the store before asking what it cost", () => {
    expect(
      at("Deduct from stock"),
      "the stock question decides whether Amount is the writer's to fill, so it comes first",
    ).toBeLessThan(at('id="expense-amount"'))
  })

  it("runs date, where it belongs, type of cost, stock, amount, notes", () => {
    const sequence = [
      'id="expense-date"',
      'id="expense-location"',
      'id="expense-code"',
      "Deduct from stock",
      'id="expense-amount"',
      'id="expense-notes"',
    ]
    const positions = sequence.map(at)
    // Compared against its own sorted copy rather than pairwise, so a field moving anywhere in the
    // sequence fails rather than only the two ends being pinned.
    expect(positions, `fields are out of order: ${sequence.join(" -> ")}`).toEqual(
      [...positions].sort((a, b) => a - b),
    )
  })

  it("the amount helpers point the way the layout actually runs", () => {
    /**
     * "above" and "below" are the half of this fix that can rot independently of the order. These
     * lines read "below" for exactly as long as the stock section was below, and were correct then.
     * Bounded to the amount field itself -- an unbounded slice runs to end of file and would happily
     * find some other field's wording, which is precisely the hole CodeRabbit found in the
     * placeholder guard on PR #40.
     */
    const amountField = body.slice(at('id="expense-amount"'), at('id="expense-notes"'))
    expect(amountField).toMatch(/&ldquo;Deduct from stock&rdquo; above/)
    expect(amountField).toMatch(/quantity above/)
    expect(
      amountField,
      "everything these helpers point at now sits above the amount, so nothing may say below",
    ).not.toMatch(/\bbelow\b/)
  })

  it("tells the writer that linking stock fills the amount in, not merely that it is allowed", () => {
    // The old label said when to use the section and never what it does. "Optional" is not the
    // question a writer has; "do I still have to type the cost?" is.
    expect(body).toMatch(/Link an item and the amount below works itself out/)
  })
})

describe("where a cost belongs is asked, never assumed", () => {
  it("nothing is preselected when the locations load", () => {
    // It used to default to data.locations[0] -- whichever block sorted first alphabetically -- so
    // estate-wide costs were attributed to a block unless someone noticed.
    expect(strip(form)).not.toContain("setFormLocationId((prev) => prev || data.locations[0].id)")
  })

  it("and the save still insists on an answer", () => {
    expect(form).toContain("Say where this cost belongs — a block, or the whole estate.")
  })
})
