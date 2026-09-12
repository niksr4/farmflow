import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The restock box wants the INVOICE TOTAL, and every word the estate reads must say so.
 *
 * THE MISTAKE THIS EXISTS FOR, asked by the estate owner rather than found by a test:
 * "entry of total cost vs unit cost in restocking — how is he making an error there I wonder."
 *
 * On 2026-08-24, commit 35d4a2d changed the field from a per-unit rate to the invoice total, and
 * relabelled it "Total price paid (₹)" with the placeholder "what the invoice says". The LABELS
 * were updated. The VALIDATION MESSAGES were not — the same commit left three saying:
 *
 *     "Unit price required — Enter the price paid per unit"
 *     "Restocks need the price paid per unit"
 *
 * So the box says total, and the moment the writer gets it wrong the app tells him to enter a
 * per-unit rate. He was being instructed into the error, by the screen, at the exact moment he
 * was trying to correct it.
 *
 * HoneyFarm entered Rs 4,480 for 60 litres of petrol twice — 13 July and 24 August — against a
 * real Rs 112.08 a litre. Rs 4,480 is the total of a DIFFERENT line on the same statement, the
 * 40-litre one. Seshagiri did the same with DAP at Rs 70,000 a bag against a real Rs 1,350.
 * Neither was carelessness; both are what the interface asked for.
 *
 * Same family as the "Logins (7d)" column and the ledger window labelled "(filtered period)":
 * the software was internally consistent and told the reader something untrue.
 */

const COMPONENTS = resolve(__dirname, "..", "components")

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const full = resolve(dir, e)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".tsx") ? [full] : []
  })

/** Comment lines legitimately explain the old wording; only what the estate reads counts. */
const userFacingText = (src: string) =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .join("\n")

describe("nothing tells the estate to enter a per-unit rate", () => {
  const files = walk(COMPONENTS)

  it("finds the components, so a move cannot disarm this", () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it("no message asks for a price 'per unit'", () => {
    const offenders = files.filter((f) => /price paid per unit|Unit price required/i.test(userFacingText(readFileSync(f, "utf8"))))
    expect(offenders.map((f) => f.slice(f.indexOf("components/")))).toEqual([])
  })

  it("the label and the error message agree that it is a total", () => {
    const dialogs = readFileSync(resolve(COMPONENTS, "inventory-dialogs.tsx"), "utf8")
    expect(dialogs).toContain("Total price paid (₹)")
    expect(dialogs).toContain("Restocks need the total paid")
  })

  it("the rejection message names the invoice, which is where the number comes from", () => {
    // "Enter a price" tells somebody nothing they did not already know. "The figure on the
    // invoice, delivery included" tells them which number to copy.
    const shell = readFileSync(resolve(COMPONENTS, "inventory-system.tsx"), "utf8")
    expect(shell).toMatch(/TOTAL paid for this stock/)
    expect(shell).toMatch(/figure on the invoice/)
  })

  it("the form still shows the derived per-unit rate back, as the sanity check", () => {
    /**
     * Asking for the total and SHOWING the rate is the design: a per-kg figure that is wildly
     * wrong catches a fat-fingered quantity, which a total on its own never would. Removing this
     * while "fixing" the wording would take away the only thing that makes a mistyped total
     * visible at the moment of entry.
     */
    const dialogs = readFileSync(resolve(COMPONENTS, "inventory-dialogs.tsx"), "utf8")
    expect(dialogs).toMatch(/per \{p\.newItemForm\.unit \|\| "unit"\}/)
  })
})
