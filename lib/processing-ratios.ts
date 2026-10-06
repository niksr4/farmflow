import { resolveProcessingRoute, type ProcessingRoute } from "@/lib/crop-config"

/**
 * Every number the pulping screen works out for itself, in one pure function.
 *
 * ⚠ WHY THIS LEFT THE COMPONENT. The ratio arithmetic lived inside a `setRecord` callback in
 * components/processing-tab.tsx, which made it unreachable from a test: asserting on it meant
 * mounting the tab, finding inputs and reading disabled fields back out. So the one line that
 * mattered most had no test at all, and it was wrong for an entire kind of estate.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS FIXES, AND WHY IT WAS INVISIBLE
 *
 * The dry cherry ratio used to be, literally:
 *
 *     dry_cherry_percent = dryCherry / (greenToday + floatToday)
 *
 * That is not a definition, it is one estate's operating convention written as arithmetic. It says
 * "cherry is made from the low-grade fraction", which is exactly what HoneyFarm does: they wash the
 * ripe and dry the green and the floats whole. Their figures are correct and always have been.
 *
 * It is wrong for an estate that dry-processes its ripe crop, which is a perfectly ordinary way to
 * run a Robusta property and the only way to run one with no water. For them:
 *
 *   - if they record the sort split, the denominator is a small number and the ratio reads
 *     somewhere around 300 to 500%;
 *   - if they do not bother recording green and float, the denominator is zero and the ratio reads
 *     0% -- their season's only yield figure, silently absent, on a screen that looks complete.
 *
 * Neither throws. The second is worse than the first, because a visibly absurd number gets
 * reported and a plausible zero does not.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE FIX: DERIVE THE DENOMINATOR, DO NOT ASSUME IT
 *
 * The honest question is "how much fresh fruit went to the yard whole?", and that follows from the
 * route by mass balance rather than from a hardcoded column pair:
 *
 *     pulpedInput = the fruit that went through the pulper   = 0 if natural, else ripe
 *     cherryInput = the fruit that went to the yard whole    = crop - pulpedInput
 *
 * For a dual-route estate that washes its ripe, `crop - ripe` IS `green + float`, so every existing
 * figure is reproduced unchanged. That is not an assumption: checked against production on
 * 2026-10-06, all 74 of HoneyFarm's processing rows have `crop_today` equal to
 * `ripe + green + float` to within 0.5 kg, across both varieties. The old formula and the new one
 * agree on every row they have ever entered.
 *
 * (Estate Mock, the demo tenant, mismatches on all 4 of its rows because its numbers were typed as
 * a demo rather than measured. Its ratios move. It is not a customer.)
 *
 * ⚠ ONE KNOWN APPROXIMATION, stated rather than hidden. For `natural` the denominator is the whole
 * crop, including floats. An estate that skims floats off before drying has dried slightly less
 * than `crop`, so its ratio reads slightly low. That is the safe direction to be wrong in for a
 * number an estate negotiates with its curer over, and it beats both of the current answers. If a
 * real natural-route estate says it matters, the fix is to ask them what they skim, not to guess.
 */

/** The raw figures a writer types, before anything is worked out. */
export type ProcessingEntry = {
  crop_today?: number | string | null
  ripe_today?: number | string | null
  green_today?: number | string | null
  float_today?: number | string | null
  wet_parchment?: number | string | null
  dry_parch?: number | string | null
  dry_cherry?: number | string | null
}

/** The previous day's row, for the running to-date columns. Null on an estate's first record. */
export type ProcessingRunningTotals = {
  crop_todate?: number | string | null
  ripe_todate?: number | string | null
  green_todate?: number | string | null
  float_todate?: number | string | null
  dry_p_todate?: number | string | null
  dry_cherry_todate?: number | string | null
  dry_p_bags_todate?: number | string | null
  dry_cherry_bags_todate?: number | string | null
}

export type DerivedProcessingFigures = {
  crop_todate: number
  ripe_todate: number
  green_todate: number
  float_todate: number
  dry_p_todate: number
  dry_cherry_todate: number
  ripe_percent: number
  green_percent: number
  float_percent: number
  fr_wp_percent: number
  wp_dp_percent: number
  dry_cherry_percent: number
  dry_p_bags: number
  dry_cherry_bags: number
  dry_p_bags_todate: number
  dry_cherry_bags_todate: number
}

const num = (value: unknown): number => Number(value) || 0

/**
 * Two decimal places, via the exact expression the component used.
 *
 * `Number.parseFloat(x.toFixed(2))` and a `Math.round(x * 100) / 100` do not always agree on a
 * half-way value, and the point of this extraction is that no stored figure moves. Keeping the old
 * expression means the rounding cannot be the thing that shifts a tenant's number.
 */
const round2 = (value: number): number => Number.parseFloat(value.toFixed(2))

const percent = (part: number, whole: number): number => (whole > 0 ? round2((part / whole) * 100) : 0)

/**
 * Fresh fruit that went through the pulper.
 *
 * A natural-route estate has no pulper in the path, so this is zero and `fr_wp_percent` with it.
 * Everyone else washes their ripe cherry.
 */
export const pulpedInputKg = (entry: ProcessingEntry, route: ProcessingRoute): number =>
  route === "natural" ? 0 : num(entry.ripe_today)

/**
 * Fresh fruit that went to the drying yard whole, which is the only honest denominator for cherry.
 *
 * Clamped at zero: a writer who types a ripe weight above the day's crop would otherwise produce a
 * negative denominator and a negative ratio, which is a data-entry problem wearing a number's
 * clothes. Zero makes the ratio absent instead of wrong.
 */
export const cherryInputKg = (entry: ProcessingEntry, route: ProcessingRoute): number => {
  if (route === "wet") return 0
  return Math.max(0, num(entry.crop_today) - pulpedInputKg(entry, route))
}

export const deriveProcessingFigures = ({
  entry,
  previous,
  bagWeightKg,
  route: routeInput,
}: {
  entry: ProcessingEntry
  previous?: ProcessingRunningTotals | null
  bagWeightKg: number
  route?: unknown
}): DerivedProcessingFigures => {
  const route = resolveProcessingRoute(routeInput)

  const cropToday = num(entry.crop_today)
  const ripeToday = num(entry.ripe_today)
  const greenToday = num(entry.green_today)
  const floatToday = num(entry.float_today)
  const wetParchment = num(entry.wet_parchment)
  const dryParch = num(entry.dry_parch)
  const dryCherry = num(entry.dry_cherry)

  // A zero or negative bag weight would make every bag count Infinity or NaN and render as blank.
  // The 50 kg fallback matches DEFAULT_BAG_WEIGHT_KG; it is a floor, not a second opinion.
  const perBag = bagWeightKg > 0 ? bagWeightKg : 50

  const dryPBags = round2(dryParch / perBag)
  const dryCherryBags = round2(dryCherry / perBag)

  return {
    crop_todate: round2(num(previous?.crop_todate) + cropToday),
    ripe_todate: round2(num(previous?.ripe_todate) + ripeToday),
    green_todate: round2(num(previous?.green_todate) + greenToday),
    float_todate: round2(num(previous?.float_todate) + floatToday),
    dry_p_todate: round2(num(previous?.dry_p_todate) + dryParch),
    dry_cherry_todate: round2(num(previous?.dry_cherry_todate) + dryCherry),

    // Shares of the day's crop. Route-independent: an estate that sorts, sorts, whichever way the
    // fruit leaves the shed afterwards.
    ripe_percent: percent(ripeToday, cropToday),
    green_percent: percent(greenToday, cropToday),
    float_percent: percent(floatToday, cropToday),

    // The wet line. Both read zero on a natural-route estate, because neither step happened.
    fr_wp_percent: percent(wetParchment, pulpedInputKg(entry, route)),
    wp_dp_percent: percent(dryParch, wetParchment),

    // The natural line, with the denominator derived above rather than assumed.
    dry_cherry_percent: percent(dryCherry, cherryInputKg(entry, route)),

    dry_p_bags: dryPBags,
    dry_cherry_bags: dryCherryBags,
    dry_p_bags_todate: round2(num(previous?.dry_p_bags_todate) + dryPBags),
    dry_cherry_bags_todate: round2(num(previous?.dry_cherry_bags_todate) + dryCherryBags),
  }
}

/**
 * The one number a planter is actually judged on: dry weight out of fresh fruit in.
 *
 * NOT STORED, and deliberately computed per route. There was no per-day outturn figure anywhere
 * before this -- the season dashboard has a `dry_parch_ripe` metric with a tenant target, so the
 * wet route had a seasonal answer, and the natural route had none at all at any timescale.
 *
 * Returns null rather than zero when there is nothing to divide by, so a screen can omit the figure
 * instead of claiming an outturn of 0%.
 */
export const dayOutturnPercent = ({
  entry,
  route: routeInput,
}: {
  entry: ProcessingEntry
  route?: unknown
}): { label: string; percent: number } | null => {
  const route = resolveProcessingRoute(routeInput)
  const cropToday = num(entry.crop_today)
  if (cropToday <= 0) return null

  const dryParch = num(entry.dry_parch)
  const dryCherry = num(entry.dry_cherry)

  if (route === "natural") {
    const input = cherryInputKg(entry, route)
    if (input <= 0 || dryCherry <= 0) return null
    return { label: "Cherry outturn", percent: percent(dryCherry, input) }
  }

  if (route === "wet") {
    const input = pulpedInputKg(entry, route)
    if (input <= 0 || dryParch <= 0) return null
    return { label: "Parchment outturn", percent: percent(dryParch, input) }
  }

  // Both lines running: the day's whole conversion, since neither half alone describes the day.
  const dryTotal = dryParch + dryCherry
  if (dryTotal <= 0) return null
  return { label: "Day outturn", percent: percent(dryTotal, cropToday) }
}
