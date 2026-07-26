import { describe, expect, it } from "vitest"

import { computeInvoiceTotals, formatInvoiceNumber, isInterStateSupply, GST_STATES } from "../lib/billing"

describe("isInterStateSupply", () => {
  it("treats differing supply and place-of-supply states as inter-state", () => {
    expect(isInterStateSupply("Karnataka", "Kerala")).toBe(true)
  })

  it("treats a matching pair as intra-state", () => {
    expect(isInterStateSupply("Karnataka", "Karnataka")).toBe(false)
  })

  it("ignores surrounding whitespace when comparing", () => {
    expect(isInterStateSupply("  Karnataka  ", "Karnataka")).toBe(false)
  })

  it("falls back to intra-state when either state is missing", () => {
    // Both invoice routes pass optional fields straight through, so an estate that has not
    // configured its supply state silently gets the CGST/SGST (intra-state) treatment.
    expect(isInterStateSupply(null, "Kerala")).toBe(false)
    expect(isInterStateSupply("Karnataka", null)).toBe(false)
    expect(isInterStateSupply(undefined, undefined)).toBe(false)
    expect(isInterStateSupply("", "Kerala")).toBe(false)
  })

  it("compares states as raw strings, so case and code/name forms do not match", () => {
    // Characterisation test: documents current behaviour, which is arguably wrong.
    // Nothing validates the incoming strings against GST_STATES, so "karnataka" vs
    // "Karnataka" (or code "29" vs name "Karnataka") is classified as INTER-state and
    // charged IGST. See findings_log.md, cycle 1 files 31-45.
    expect(isInterStateSupply("karnataka", "Karnataka")).toBe(true)
    expect(isInterStateSupply("29", "Karnataka")).toBe(true)
  })
})

describe("computeInvoiceTotals", () => {
  it("splits tax into CGST and SGST for an intra-state supply", () => {
    const totals = computeInvoiceTotals(
      [{ description: "Parchment", quantity: 3, unitPrice: 100.5, taxRate: 5 }],
      "Karnataka",
      "Karnataka",
    )

    expect(totals.isInterState).toBe(false)
    expect(totals.subtotal).toBe(301.5)
    expect(totals.taxTotal).toBe(15.08)
    expect(totals.cgstAmount).toBe(7.54)
    expect(totals.sgstAmount).toBe(7.54)
    expect(totals.igstAmount).toBe(0)
    expect(totals.total).toBe(316.58)
  })

  it("charges the whole tax as IGST for an inter-state supply", () => {
    const totals = computeInvoiceTotals(
      [{ description: "Parchment", quantity: 3, unitPrice: 100.5, taxRate: 5 }],
      "Karnataka",
      "Kerala",
    )

    expect(totals.isInterState).toBe(true)
    expect(totals.igstAmount).toBe(15.08)
    expect(totals.cgstAmount).toBe(0)
    expect(totals.sgstAmount).toBe(0)
    expect(totals.taxTotal).toBe(15.08)
    expect(totals.total).toBe(316.58)
  })

  it("aggregates multiple line items with differing tax rates", () => {
    const totals = computeInvoiceTotals(
      [
        { description: "Parchment", quantity: 2, unitPrice: 100, taxRate: 5 },
        { description: "Freight", quantity: 1, unitPrice: 500, taxRate: 18 },
      ],
      "Karnataka",
      "Kerala",
    )

    expect(totals.subtotal).toBe(700)
    expect(totals.taxTotal).toBe(100)
    expect(totals.igstAmount).toBe(100)
    expect(totals.total).toBe(800)
  })

  it("treats a zero or missing tax rate as no tax", () => {
    const totals = computeInvoiceTotals(
      [{ description: "Sample", quantity: 1, unitPrice: 250, taxRate: 0 }],
      "Karnataka",
      "Karnataka",
    )

    expect(totals.taxTotal).toBe(0)
    expect(totals.cgstAmount).toBe(0)
    expect(totals.sgstAmount).toBe(0)
    expect(totals.total).toBe(250)
  })

  it("returns zeroed totals for an empty line list", () => {
    const totals = computeInvoiceTotals([], "Karnataka", "Karnataka")

    expect(totals).toEqual({
      subtotal: 0,
      taxTotal: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      total: 0,
      isInterState: false,
    })
  })

  it("keeps IGST exactly equal to the tax total on inter-state supplies", () => {
    // IGST is accumulated from the same unrounded running total as taxTotal and rounded once,
    // so it reconciles for any input — unlike the CGST/SGST split below.
    for (const unitPrice of [1, 0.5, 1.07, 33.33, 100.5]) {
      const totals = computeInvoiceTotals(
        [{ description: "x", quantity: 7, unitPrice, taxRate: 18 }],
        "Karnataka",
        "Kerala",
      )
      expect(totals.igstAmount).toBe(totals.taxTotal)
      expect(totals.total).toBe(Math.round((totals.subtotal + totals.taxTotal) * 100) / 100)
    }
  })

  it("does NOT keep CGST + SGST equal to the tax total (known rounding defect)", () => {
    // Characterisation test: documents a real defect rather than the desired behaviour.
    // cgstAmount and sgstAmount are each rounded independently from an unrounded half,
    // while taxTotal is rounded once from the unrounded sum. For amounts whose half lands
    // on a sub-paisa boundary the two disagree by 0.01 in either direction, so the tax
    // breakup printed on a GST invoice does not add up to the tax actually charged.
    // See findings_log.md, cycle 1 files 31-45.
    const roundsUp = computeInvoiceTotals(
      [{ description: "x", quantity: 1, unitPrice: 1, taxRate: 5 }],
      "Karnataka",
      "Karnataka",
    )
    expect(roundsUp.taxTotal).toBe(0.05)
    expect(roundsUp.cgstAmount).toBe(0.03)
    expect(roundsUp.sgstAmount).toBe(0.03)
    // 0.03 + 0.03 = 0.06, which overstates taxTotal by one paisa.
    expect(roundsUp.cgstAmount + roundsUp.sgstAmount).toBeGreaterThan(roundsUp.taxTotal)

    const roundsDown = computeInvoiceTotals(
      [{ description: "x", quantity: 7, unitPrice: 1.07, taxRate: 18 }],
      "Karnataka",
      "Karnataka",
    )
    expect(roundsDown.taxTotal).toBe(1.35)
    expect(roundsDown.cgstAmount).toBe(0.67)
    expect(roundsDown.sgstAmount).toBe(0.67)
    // 0.67 + 0.67 = 1.34, which understates taxTotal by one paisa.
    expect(roundsDown.cgstAmount + roundsDown.sgstAmount).toBeLessThan(roundsDown.taxTotal)
  })

  it("derives total from subtotal + taxTotal, not from the CGST/SGST breakup", () => {
    const totals = computeInvoiceTotals(
      [{ description: "x", quantity: 1, unitPrice: 1, taxRate: 5 }],
      "Karnataka",
      "Karnataka",
    )

    expect(totals.total).toBe(1.05)
    // The persisted invoice therefore stores a total that disagrees with its own tax breakup.
    expect(totals.subtotal + totals.cgstAmount + totals.sgstAmount).not.toBe(totals.total)
  })
})

describe("formatInvoiceNumber", () => {
  it("builds an INV-<tenant>-<date>-<suffix> number scoped to the tenant", () => {
    const number = formatInvoiceNumber("abcd1234-0000-0000-0000-000000000000")

    expect(number).toMatch(/^INV-ABCD-\d{8}-\d{4}$/)
  })

  it("falls back to an FF prefix when no tenant id is supplied", () => {
    expect(formatInvoiceNumber(null)).toMatch(/^INV-FF-\d{8}-\d{4}$/)
    expect(formatInvoiceNumber(undefined)).toMatch(/^INV-FF-\d{8}-\d{4}$/)
    expect(formatInvoiceNumber("")).toMatch(/^INV-FF-\d{8}-\d{4}$/)
  })

  it("draws its suffix from a 9000-value space, so collisions are possible per tenant per day", () => {
    // billing_invoices has UNIQUE (tenant_id, invoice_number) (scripts/42-billing.sql), so a
    // repeat within the same tenant and day surfaces as a unique-violation rather than a
    // duplicate number. Documented here because the route does not retry on collision.
    const suffixes = new Set<string>()
    for (let i = 0; i < 500; i += 1) {
      suffixes.add(formatInvoiceNumber("tenant-a").split("-").pop() as string)
    }

    for (const suffix of suffixes) {
      expect(Number(suffix)).toBeGreaterThanOrEqual(1000)
      expect(Number(suffix)).toBeLessThanOrEqual(9999)
    }
  })
})

describe("GST_STATES", () => {
  it("exposes unique two-digit state codes", () => {
    const codes = GST_STATES.map((state) => state.code)

    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) {
      expect(code).toMatch(/^\d{2}$/)
    }
  })

  it("includes the estate-relevant southern states", () => {
    const names = GST_STATES.map((state) => state.name)

    expect(names).toContain("Karnataka")
    expect(names).toContain("Kerala")
    expect(names).toContain("Tamil Nadu")
  })
})
