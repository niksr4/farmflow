import { describe, expect, it } from "vitest"
import { computeProcessingKpis, safeDivide } from "../lib/kpi"

describe("kpi math", () => {
  it("computes processing conversion KPIs", () => {
    const totals = {
      cropKgs: 1000,
      ripeKgs: 800,
      greenKgs: 150,
      floatKgs: 50,
      wetParchKgs: 400,
      dryParchKgs: 160,
      dryCherryKgs: 80,
    }

    const kpis = computeProcessingKpis(totals)

    expect(kpis.ripePickRate).toBeCloseTo(0.8, 6)
    expect(kpis.floatRateOfGreen).toBeCloseTo(1 / 3, 6)
    expect(kpis.floatRateOfGreenPlusFloat).toBeCloseTo(0.25, 6)
    expect(kpis.wetParchmentYieldFromRipe).toBeCloseTo(0.5, 6)
    expect(kpis.dryParchmentYieldFromWP).toBeCloseTo(0.4, 6)
    expect(kpis.dryParchmentYieldFromRipe).toBeCloseTo(0.2, 6)
    expect(kpis.dryParchmentYieldFromCrop).toBeCloseTo(0.16, 6)
    expect(kpis.dryCherryYieldFromRipe).toBeCloseTo(0.1, 6)
    expect(kpis.washedShare).toBeCloseTo(2 / 3, 6)
    expect(kpis.naturalShare).toBeCloseTo(1 / 3, 6)
  })

  it("handles zero denominators safely", () => {
    expect(safeDivide(10, 0)).toBe(0)
    expect(safeDivide(0, 0)).toBe(0)
  })
})
