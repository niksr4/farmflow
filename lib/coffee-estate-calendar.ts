/**
 * South Indian coffee estate agronomic calendar.
 *
 * Context: Karnataka (Coorg / Chikmagalur / Bababudangiri) and Kerala (Wayanad / Idukki).
 * Crops: Arabica (Coffea arabica — SL9, SL795, Cauvery/Catimor) and
 *        Robusta (Coffea canephora — CxR hybrids) grown under shade, often intercropped with pepper.
 *
 * This module is used to inject season-aware context into all AI prompts so that
 * agents can correctly interpret activity levels (e.g. zero picking in April = normal;
 * zero picking in November = a problem).
 */

export type EstateSeason =
  | "post-harvest-pruning"   // Jan–Feb: harvest winding down, pruning begins
  | "blossom"                // Mar: blossom showers, flowering — critical
  | "berry-formation"        // Apr–May: green berries forming, fertilising
  | "monsoon"                // Jun–Aug: Southwest monsoon, estate quiet
  | "pre-harvest"            // Sep–Oct early: berry colour change, harvest prep
  | "harvest-peak"           // Oct–Dec: main harvest and processing season

export type EstatePhase = {
  season: EstateSeason
  months: number[]           // 1-based month numbers this phase covers
  label: string
  arabicaStatus: string
  robustaStatus: string
  pepperStatus: string
  normalActivities: string[]
  abnormalIfMissing: string[]
  abnormalIfPresent: string[]
  laborExpectation: string
  processingExpectation: string
  keyWatchPoints: string[]
}

const PHASES: EstatePhase[] = [
  {
    season: "post-harvest-pruning",
    months: [1, 2],
    label: "Post-Harvest & Pruning (January–February)",
    arabicaStatus: "Harvest completing in January; curing/milling of harvested parchment underway.",
    robustaStatus: "Harvest in full swing through January; winding down in February.",
    pepperStatus: "Harvest completing; vines being trained and maintained.",
    normalActivities: [
      "Robusta picking (January)",
      "Pulping and drying of harvested cherry",
      "Dispatch of dry parchment bags to curing works",
      "Post-harvest pruning: desuckering, tipping, stumping old bushes",
      "Blossom irrigation (pumping water to dehydrated bushes to trigger flowering)",
      "High labour spend on pruning crews",
      "Fertiliser application after pruning",
    ],
    abnormalIfMissing: [
      "No processing records in January — Robusta harvest should still be active",
      "No dispatch activity — curing season is open",
    ],
    abnormalIfPresent: [
      "Fresh picking records in late February — season should be winding down",
    ],
    laborExpectation: "High — pruning crews are large and expensive. Labour cost spike in Jan–Feb is expected and not a cause for alarm.",
    processingExpectation: "Moderate to high in January (Robusta); dropping to near-zero by February.",
    keyWatchPoints: [
      "Track blossom irrigation dates and water usage",
      "Monitor pruning completion per block",
      "Ensure dispatch is moving parchment before the next season",
    ],
  },
  {
    season: "blossom",
    months: [3],
    label: "Blossom Season (March)",
    arabicaStatus: "Flowering triggered by the first pre-monsoon showers (blossom showers). Arabica blossoms are white, fragrant, and last only 2–3 days. A failed blossom means a poor crop.",
    robustaStatus: "Flowering follows Arabica by 2–4 weeks.",
    pepperStatus: "New spike formation; flowering begins.",
    normalActivities: [
      "Watching and recording the blossom shower date",
      "Post-blossom fertiliser application (NPK to support berry set)",
      "Continued pruning of any remaining blocks",
      "Shade tree trimming to let light reach the canopy",
      "Weed management between rows",
    ],
    abnormalIfMissing: [
      "No rainfall records in March — blossom showers are critical; irrigation may be needed",
      "Very low expenses — fertiliser application after blossom is essential",
    ],
    abnormalIfPresent: [
      "Processing or picking records — there should be no cherry on the trees at this stage",
    ],
    laborExpectation: "Moderate — pruning finishing up, weed management starting. Lower than Jan–Feb.",
    processingExpectation: "Zero — no cherry is ripe at this time. Any processing entries would be from leftover carry-over stock only.",
    keyWatchPoints: [
      "Record the exact blossom shower date — it determines the harvest window",
      "Count blossom density on indicator plants to forecast crop size",
      "Late blossom (April) means a delayed and compressed harvest in December–January",
    ],
  },
  {
    season: "berry-formation",
    months: [4, 5],
    label: "Berry Formation & Estate Maintenance (April–May)",
    arabicaStatus: "Green berries setting and growing. Vulnerable to berry borer (Hypothenemus hampei) from here on.",
    robustaStatus: "Berry set and early development.",
    pepperStatus: "Berry formation. Pepper vines need trellising support checked.",
    normalActivities: [
      "Fertiliser application (split doses — second dose after monsoon onset)",
      "Weed slashing and cover crop management",
      "Berry borer monitoring and shade regulation",
      "Shade tree management (lopping to regulate shade density)",
      "Soil conservation: trench digging, bunding on slopes",
      "Equipment maintenance before monsoon (pulpers, drying tarpaulins, storage)",
    ],
    abnormalIfMissing: [
      "No fertiliser expenses in April–May — critical nutrition window for berry development",
    ],
    abnormalIfPresent: [
      "Processing or picking records — no cherry should be ripe",
      "Dispatch of parchment — should have been completed by now",
    ],
    laborExpectation: "Moderate — estate maintenance work. Steady but not as heavy as harvest or pruning season.",
    processingExpectation: "Zero. Pulping equipment should be in maintenance mode.",
    keyWatchPoints: [
      "Berry borer incidence — early detection prevents major crop loss",
      "Shade regulation — too much shade reduces cherry development",
      "Track fertiliser application dates and dosage per block",
    ],
  },
  {
    season: "monsoon",
    months: [6, 7, 8],
    label: "Southwest Monsoon (June–August)",
    arabicaStatus: "Berries swelling rapidly under monsoon. Arabica at this stage is green and hard.",
    robustaStatus: "Active berry development.",
    pepperStatus: "Berries developing; vines and berries vulnerable to Phytophthora if drainage is poor.",
    normalActivities: [
      "Heavy rainfall recording — Coorg averages 2,500–3,500 mm annually, mostly June–September",
      "Drainage maintenance: clearing drains, preventing waterlogging",
      "Weed management between showers (extremely labour-intensive in high rainfall)",
      "Second fertiliser application (post-monsoon onset)",
      "Soil conservation and slope stabilisation",
      "Minimal estate operations due to continuous rain",
    ],
    abnormalIfMissing: [
      "No rainfall records in June–August — check if recording is happening; this is the wettest period",
      "Very low weed-management labour — estates need constant weeding during monsoon",
    ],
    abnormalIfPresent: [
      "Processing or picking records — absolutely no harvest activity expected",
      "High dispatch or sales — season is closed",
    ],
    laborExpectation: "Lower than pruning/harvest season but steady — weed management is continuous. Weather limits field days.",
    processingExpectation: "Zero. Estate operations are in maintenance mode.",
    keyWatchPoints: [
      "Total monsoon rainfall vs prior year — important for forecasting crop",
      "Drainage failures can cause root rot and crop loss",
      "Track weed management completion by block before harvest prep",
    ],
  },
  {
    season: "pre-harvest",
    months: [9, 10],
    label: "Pre-Harvest Preparation & Early Harvest (September–October)",
    arabicaStatus: "Berries turning yellow/red (Arabica is typically a yellow or red cherry variety). Selective picking begins for early-ripening plots in October.",
    robustaStatus: "Still green in September; colour change begins in October.",
    pepperStatus: "Pepper berries turning red; harvest begins November.",
    normalActivities: [
      "Harvest preparation: repair and clean pulping equipment, check fermentation tanks",
      "Lay out drying tarpaulins and prepare raised drying beds",
      "Recruit and roster picking crews (pickers)",
      "Early Arabica picking in October from forward-ripening blocks",
      "Pulping of first cherry batches",
      "Storage preparation — clean bags, check bag inventory",
    ],
    abnormalIfMissing: [
      "No labour ramp-up in October — picking crews should be mobilising",
      "No processing records in October — early Arabica should be coming in",
      "No equipment maintenance expenses in September — harvest prep is critical",
    ],
    abnormalIfPresent: [],
    laborExpectation: "Rising sharply in October. September still moderate (preparation work).",
    processingExpectation: "Starting in October — first cherry batches being pulped.",
    keyWatchPoints: [
      "Picker availability — labour shortage during harvest is the #1 operational risk",
      "Pulper and fermentation tank condition before first cherry arrives",
      "Weather in September–October: excess rain can split ripe cherry and cause quality loss",
    ],
  },
  {
    season: "harvest-peak",
    months: [11, 12],
    label: "Peak Harvest & Processing Season (November–December)",
    arabicaStatus: "Full harvest. Selective picking of ripe red/yellow cherry by hand. Multiple rounds (2–3 picks per block). Peak cherry-to-parchment conversion.",
    robustaStatus: "Full harvest underway by November. Robusta is typically strip-picked (all berries at once).",
    pepperStatus: "Pepper harvest active November–January. High-value crop — track separately.",
    normalActivities: [
      "Daily picking records — volume per block, picker count",
      "Daily pulping: cherry in → wet parchment out",
      "Fermentation (12–48 hrs), washing, and transfer to drying yard",
      "Dry parchment weight tracking as drying progresses",
      "Dispatch of dried parchment to curing works",
      "Sales of parchment coffee to exporters or co-ops",
      "Pepper picking and drying (if intercropped)",
      "Extremely high labour — this is the most labour-intensive period of the year",
    ],
    abnormalIfMissing: [
      "No picking or processing records — harvest should be in full swing",
      "No labour records — picking crews should be deployed daily",
      "No rainfall records — winter drizzle (November–December) affects drying; should still be tracked",
    ],
    abnormalIfPresent: [],
    laborExpectation: "Maximum. Highest labour cost of the year. Cost spikes are expected and normal.",
    processingExpectation: "Maximum. Processing records should appear daily or near-daily.",
    keyWatchPoints: [
      "Cherry-to-wet-parchment ratio (should be ~5–6:1 by weight) — low ratio means green cherry being picked",
      "Drying time — Coorg sun drying takes 10–14 days; track moisture content",
      "Over-ripe cherry (black beans) increases defect rate — push for timely picking",
      "Picker productivity (kg per picker per day) — benchmark is 40–60 kg for selective picking",
    ],
  },
]

/**
 * Returns the phase for a given month (1–12).
 */
export function getEstatePhaseForMonth(month: number): EstatePhase {
  return PHASES.find((p) => p.months.includes(month)) ?? PHASES[PHASES.length - 1]
}

/**
 * Returns the current estate phase based on today's date.
 */
export function getCurrentEstatePhase(): EstatePhase {
  return getEstatePhaseForMonth(new Date().getMonth() + 1)
}

/**
 * Builds a concise calendar context string for injection into AI system prompts.
 * Tells the model what phase the estate is in, what's normal, and what to watch for.
 */
export function buildEstateCalendarContext(): string {
  const phase = getCurrentEstatePhase()
  const lines: string[] = [
    `## Current Estate Season: ${phase.label}`,
    ``,
    `Arabica: ${phase.arabicaStatus}`,
    `Robusta: ${phase.robustaStatus}`,
    `Pepper: ${phase.pepperStatus}`,
    ``,
    `Labour expectation this season: ${phase.laborExpectation}`,
    `Processing expectation this season: ${phase.processingExpectation}`,
    ``,
    `Normal activities right now:`,
    ...phase.normalActivities.map((a) => `- ${a}`),
  ]

  if (phase.abnormalIfMissing.length > 0) {
    lines.push(``, `Flag if these are absent from the data:`)
    phase.abnormalIfMissing.forEach((a) => lines.push(`- ${a}`))
  }

  if (phase.abnormalIfPresent.length > 0) {
    lines.push(``, `Flag if these appear unexpectedly:`)
    phase.abnormalIfPresent.forEach((a) => lines.push(`- ${a}`))
  }

  lines.push(``, `Key watch points for this season:`)
  phase.keyWatchPoints.forEach((w) => lines.push(`- ${w}`))

  return lines.join("\n")
}
