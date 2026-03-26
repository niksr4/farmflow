import { describe, expect, it } from "vitest"

import { buildSalesCsv } from "../lib/sales-export"

describe("sales export helper", () => {
  it("builds three sorted detail sections in the requested order", () => {
    const csv = buildSalesCsv(
      [
        {
          sale_date: "2026-01-02",
          batch_no: "BL-MV-01",
          lot_id: "MV-LOT-01",
          location_code: "MV",
          coffee_type: "Arabica",
          bag_type: "Dry Parchment",
          bags_sold: 10,
          kgs_received: 500,
          buyer_name: "Buyer 1",
          price_per_bag: 100,
          revenue: 1000,
        },
        {
          sale_date: "2026-01-03",
          batch_no: "BL-HFA-01",
          lot_id: "HFA-LOT-01",
          location_name: "Honey Farm A",
          coffee_type: "Robusta",
          bag_type: "Dry Cherry",
          bags_sold: 8,
          kgs: 380,
          buyer_name: "Buyer 2",
          price_per_bag: 80,
          revenue: 640,
        },
        {
          sale_date: "2026-01-04",
          batch_no: "BL-ZX-01",
          lot_id: "ZX-LOT-01",
          location_code: "ZX",
          coffee_type: "Arabica",
          bag_type: "Dry Cherry",
          bags_sold: 6,
          kgs_sent: 300,
          buyer_name: "Buyer 3",
          price_per_bag: 90,
          revenue: 540,
        },
      ],
      50,
    )

    const lines = csv.split("\n")

    // Section headers
    expect(lines[0]).toBe('"1. All Transactions \u2014 by Date"')
    expect(lines).toContain('"2. All Transactions \u2014 by Estate (HFA, HFB, HFC, MV)"')
    expect(lines).toContain('"3. All Transactions \u2014 by Coffee Type (AP, AC, RP, RC)"')

    // Section 2: rows sorted MV → HFA → ZX (unknown estate last)
    const estateStart = lines.indexOf('"2. All Transactions \u2014 by Estate (HFA, HFB, HFC, MV)"')
    expect(lines[estateStart + 2]).toContain('"MV"')
    expect(lines[estateStart + 2]).toContain('"Buyer 1"')
    expect(lines[estateStart + 3]).toContain('"HFA"')
    expect(lines[estateStart + 3]).toContain('"Buyer 2"')
    expect(lines[estateStart + 4]).toContain('"ZX"')

    // Section 3: rows sorted AP → AC → RC (MV=AP, ZX=AC, HFA=RC)
    const typeStart = lines.indexOf('"3. All Transactions \u2014 by Coffee Type (AP, AC, RP, RC)"')
    expect(lines[typeStart + 2]).toContain('"Buyer 1"') // MV = AP
    expect(lines[typeStart + 3]).toContain('"Buyer 3"') // ZX = AC
    expect(lines[typeStart + 4]).toContain('"Buyer 2"') // HFA = RC
  })

  it("supports the shared ops export row shape with location and sold_kgs", () => {
    const csv = buildSalesCsv(
      [
        {
          sale_date: "2026-02-01",
          location: "Honey Farm B",
          coffee_type: "Arabica",
          bag_type: "Dry Cherry",
          bags_sold: 4,
          sold_kgs: 180,
          price_per_bag: 95,
          revenue: 380,
        },
      ],
      50,
    )

    // estate resolves to HFB via alias; detail rows appear in all three sections
    expect(csv).toContain('"HFB"')
    expect(csv).toContain('"180.00"')
    expect(csv).toContain('"380"')
    expect(csv).toContain('"95"')
    expect(csv).toContain('"Dry Cherry"')
  })
})
