/**
 * The "what is this number and why should I care" copy behind each KPI's help popover, plus the
 * per-tenant baseline targets those KPIs are measured against.
 *
 * Moved out of components/season-dashboard.tsx verbatim — 190 lines of data declared ahead of the
 * component that renders it.
 */

export type KpiExplain = {
  title: string
  why: string
  causes: string[]
  checks: string[]
  ask: string
  targetPct?: string
}

export const KPI_EXPLANATIONS: Record<string, KpiExplain> = {
  ripe_pick_rate: {
    title: "Ripe pick rate (Ripe / Crop)",
    why: "Signals picking selectivity and cherry quality. Higher is usually better for cup quality.",
    causes: [
      "Picking crews mixing green + ripe cherry",
      "Low labour availability leading to strip picking",
      "Weather forcing early harvest",
    ],
    checks: [
      "Re-train pickers on selective harvest",
      "Adjust picking rounds per block",
      "Inspect plot-level maturity and compare to last week",
    ],
    ask: "Did any block change picking rules or cadence this week?",
    targetPct: ">= 85%",
  },
  float_rate_green: {
    title: "Float % of green",
    why: "Proxy for low-density or defective cherry; rising float rate can signal quality or handling issues.",
    causes: [
      "Under-ripe or insect-damaged cherry",
      "Delayed pulping causing dehydration",
      "Over-aggressive water flow in flotation",
    ],
    checks: [
      "Compare float rate by location vs estate avg",
      "Audit cherry intake time vs pulping time",
      "Inspect recent lots for insect damage",
    ],
    ask: "Was there a delay between picking and pulping?",
    targetPct: "<= 10%",
  },
  float_rate_green_plus: {
    title: "Float % of (green + float)",
    why: "Normalizes floaters against total green intake to spot density shifts.",
    causes: [
      "Mixed maturity cherry",
      "Changes in sorting at intake",
      "Weather impact on cherry density",
    ],
    checks: [
      "Review intake logs for sorting notes",
      "Compare to last 7-day baseline",
      "Check if new plots were added",
    ],
    ask: "Did the intake mix change (new plots or contractors)?",
    targetPct: "<= 8%",
  },
  wet_parch_yield: {
    title: "Wet parchment yield (WP / Ripe)",
    why: "Measures wet mill efficiency; low values indicate pulping/fermentation losses.",
    causes: [
      "Over-fermentation or excessive washing",
      "Pulping loss from worn machinery",
      "High floaters inflating ripe input",
    ],
    checks: [
      "Inspect pulper settings + maintenance log",
      "Compare WP yield by location",
      "Verify ripe input accuracy",
    ],
    ask: "Were any pulpers serviced or adjusted recently?",
    targetPct: ">= 55%",
  },
  dry_parch_wp: {
    title: "Dry parchment yield (Dry Parch / WP)",
    why: "Tracks drying shrinkage and process control.",
    causes: [
      "Over-drying or uneven drying beds",
      "Moisture measurement drift",
      "Extended drying times due to weather",
    ],
    checks: [
      "Calibrate moisture meter",
      "Review drying logs for bed rotation",
      "Compare moisture % trend week over week",
    ],
    ask: "Any drying bed changes or equipment issues?",
    targetPct: ">= 50%",
  },
  dry_parch_ripe: {
    title: "Dry parchment from ripe (Dry Parch / Ripe)",
    why: "Core yield KPI; owners track this for true recovery.",
    causes: [
      "Low cherry quality (floaters/defects)",
      "Process losses across pulping + drying",
      "Data entry gaps between steps",
    ],
    checks: [
      "Check float % trend alongside yield",
      "Review drying loss vs prior week",
      "Audit recent batch reconciliations",
    ],
    ask: "Are float rates or drying losses rising in the same window?",
    targetPct: ">= 30%",
  },
  dry_parch_crop: {
    title: "Dry parchment from crop (Dry Parch / Crop)",
    why: "End-to-end yield from total crop; highlights picking effectiveness + processing losses.",
    causes: [
      "Low ripe pick rate",
      "High float rates or processing losses",
      "Incomplete crop reporting",
    ],
    checks: [
      "Compare ripe pick rate and float rate together",
      "Validate crop intake totals",
      "Review lots missing from processing logs",
    ],
    ask: "Any blocks with missing crop-to-date entries?",
    targetPct: ">= 25%",
  },
  dry_cherry_ripe: {
    title: "Dry cherry yield (Dry Cherry / Ripe)",
    why: "Shows natural processing share + drying outcomes.",
    causes: [
      "Shift in processing mix to naturals",
      "Drying inefficiency for naturals",
      "Cherry diverted due to capacity constraints",
    ],
    checks: [
      "Confirm planned washed vs natural split",
      "Compare drying times and moisture %",
      "Review natural lot losses",
    ],
    ask: "Was more volume diverted to naturals this week?",
    targetPct: "10-25%",
  },
  washed_share: {
    title: "Washed share (Dry Parch / Total Dry)",
    why: "Shows production mix and process allocation.",
    causes: [
      "Planned shift in processing strategy",
      "Natural capacity bottlenecks",
      "Weather constraints",
    ],
    checks: [
      "Compare to processing plan",
      "Review natural bed capacity",
      "Validate dry cherry inventory flow",
    ],
    ask: "Is the current mix aligned with the season plan?",
    targetPct: "60-80% (strategy dependent)",
  },
  natural_share: {
    title: "Natural share (Dry Cherry / Total Dry)",
    why: "Highlights how much is going through natural processing.",
    causes: [
      "Cherry diverted to natural lots",
      "Wet mill capacity limits",
      "Quality decisions for specific blocks",
    ],
    checks: [
      "Confirm natural intake volumes vs plan",
      "Review drying capacity utilization",
      "Check for backlogs at wet mill",
    ],
    ask: "Any wet mill constraints pushing naturals higher?",
    targetPct: "20-40% (strategy dependent)",
  },
}

export type KpiMetricId = keyof typeof KPI_EXPLANATIONS

export const TENANT_KPI_BASELINE_TARGETS: Record<string, Partial<Record<KpiMetricId, number>>> = {
  // HoneyFarm baseline from live tenant aggregates.
  "41b4b10c-428c-4155-882f-1cc7f6e89a78": {
    ripe_pick_rate: 0.8178770828118368,
    float_rate_green: 0.43584023338624567,
    float_rate_green_plus: 0.3035436835185849,
    wet_parch_yield: 0.4366125963086668,
    dry_parch_wp: 0.5523909664441803,
    dry_parch_ripe: 0.24118085403664719,
    dry_parch_crop: 0.1972562933295604,
    dry_cherry_ripe: 0.09301520978323065,
    washed_share: 0.7216747297378009,
    natural_share: 0.2783252702621991,
  },
}
