export type ProcessingTotals = {
  cropKgs: number
  ripeKgs: number
  greenKgs: number
  floatKgs: number
  wetParchKgs: number
  dryParchKgs: number
  dryCherryKgs: number
}

export const safeDivide = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : 0

export const computeProcessingKpis = (totals: ProcessingTotals) => {
  const dryTotal = totals.dryParchKgs + totals.dryCherryKgs
  return {
    totals,
    ripePickRate: safeDivide(totals.ripeKgs, totals.cropKgs),
    floatRateOfGreen: safeDivide(totals.floatKgs, totals.greenKgs),
    floatRateOfGreenPlusFloat: safeDivide(totals.floatKgs, totals.greenKgs + totals.floatKgs),
    wetParchmentYieldFromRipe: safeDivide(totals.wetParchKgs, totals.ripeKgs),
    dryParchmentYieldFromWP: safeDivide(totals.dryParchKgs, totals.wetParchKgs),
    dryParchmentYieldFromRipe: safeDivide(totals.dryParchKgs, totals.ripeKgs),
    dryParchmentYieldFromCrop: safeDivide(totals.dryParchKgs, totals.cropKgs),
    dryCherryYieldFromRipe: safeDivide(totals.dryCherryKgs, totals.ripeKgs),
    washedShare: safeDivide(totals.dryParchKgs, dryTotal),
    naturalShare: safeDivide(totals.dryCherryKgs, dryTotal),
  }
}
