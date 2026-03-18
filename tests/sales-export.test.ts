import { describe, expect, it } from "vitest"

import { buildSalesCsv } from "../lib/sales-export"

describe("sales export helper", () => {
  it("builds fixed estate and coffee-type sections in the requested order", () => {
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

    expect(lines[0]).toBe('"1. Sales by Date"')
    expect(lines).toContain('"2. Segregated by Estate"')
    expect(lines).toContain('"3. Segregated by Coffee Type"')

    const estateStart = lines.indexOf('"2. Segregated by Estate"')
    expect(lines.slice(estateStart + 2, estateStart + 6)).toEqual([
      '"MV","1","10.00","500.00","1000.00","100.00"',
      '"HFA","1","8.00","380.00","640.00","80.00"',
      '"HFB","0","0.00","0.00","0.00","0.00"',
      '"HFC","0","0.00","0.00","0.00","0.00"',
    ])

    const typeStart = lines.indexOf('"3. Segregated by Coffee Type"')
    expect(lines.slice(typeStart + 2, typeStart + 6)).toEqual([
      '"AP","Arabica Parchment","1","10.00","500.00","1000.00","100.00"',
      '"AC","Arabica Cherry","1","6.00","300.00","540.00","90.00"',
      '"RP","Robusta Parchment","0","0.00","0.00","0.00","0.00"',
      '"RC","Robusta Cherry","1","8.00","380.00","640.00","80.00"',
    ])
  })
})
