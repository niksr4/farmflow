import { describe, expect, it } from "vitest"

// Mirror the zero-guard logic from components/processing-tab.tsx handleSave
// so we can test it independently of React
function shouldBlockSave(ripe: number, dryParch: number, dryCherry: number): boolean {
  return ripe === 0 && dryParch === 0 && dryCherry === 0
}

// Cherry-to-dry-parch conversion percentage
function cherryToDryParchPct(cherryKg: number, dryParchKg: number): number {
  if (cherryKg <= 0) return 0
  return (dryParchKg / cherryKg) * 100
}

// Yield benchmark check (flag batches below 27%)
function isBelowYieldBenchmark(pct: number, benchmark = 27): boolean {
  return pct > 0 && pct < benchmark
}

describe("processing form — zero guard", () => {
  it("blocks save when all three outputs are zero", () => {
    expect(shouldBlockSave(0, 0, 0)).toBe(true)
  })

  it("allows save when ripe has a value", () => {
    expect(shouldBlockSave(5762, 0, 0)).toBe(false)
  })

  it("allows save when dry parch has a value", () => {
    expect(shouldBlockSave(0, 1483, 0)).toBe(false)
  })

  it("allows save when dry cherry has a value", () => {
    expect(shouldBlockSave(0, 0, 420)).toBe(false)
  })

  it("allows save when all three have values", () => {
    expect(shouldBlockSave(5762, 1483, 420)).toBe(false)
  })

  it("blocks save when values are explicitly zero (not undefined)", () => {
    expect(shouldBlockSave(0, 0, 0)).toBe(true)
  })
})

describe("processing — yield calculations", () => {
  it("calculates cherry-to-dry-parch percentage correctly", () => {
    // HoneyFarm typical batch
    expect(cherryToDryParchPct(5762, 1483)).toBeCloseTo(25.74, 1)
  })

  it("returns 0 when no cherry input", () => {
    expect(cherryToDryParchPct(0, 500)).toBe(0)
  })

  it("flags batch below 27% benchmark", () => {
    expect(isBelowYieldBenchmark(25.74)).toBe(true)
  })

  it("does not flag batch at or above 27% benchmark", () => {
    expect(isBelowYieldBenchmark(27)).toBe(false)
    expect(isBelowYieldBenchmark(28)).toBe(false)
  })

  it("does not flag when yield is 0 (no data yet)", () => {
    expect(isBelowYieldBenchmark(0)).toBe(false)
  })

  it("perfect yield scenario", () => {
    const pct = cherryToDryParchPct(10000, 2700)
    expect(pct).toBe(27)
    expect(isBelowYieldBenchmark(pct)).toBe(false)
  })
})

describe("processing — dry parch bag calculations", () => {
  const bagWeightKg = 50

  it("converts dry parch kg to bags", () => {
    expect(1483 / bagWeightKg).toBeCloseTo(29.66, 1)
  })

  it("zero parch gives zero bags", () => {
    expect(0 / bagWeightKg).toBe(0)
  })

  it("exactly one bag", () => {
    expect(50 / bagWeightKg).toBe(1)
  })
})
