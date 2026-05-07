/**
 * Deep agronomic knowledge base for South Indian coffee estates.
 *
 * Sources: Coffee Board of India research, ICAR-CCRI (Central Coffee Research Institute,
 * Chikmagalur), Karnataka and Kerala extension services, standard estate management
 * practice in Coorg / Chikmagalur / Wayanad / Araku valley.
 *
 * Used to enrich AI system prompts across all agents so recommendations are
 * grounded in actual best practice rather than generic advice.
 */

// ---------------------------------------------------------------------------
// VARIETIES
// ---------------------------------------------------------------------------

export const ARABICA_VARIETIES = {
  "S.795": {
    origin: "Selection from Kent × S.288 at CCRI Chikmagalur",
    maturity: "Mid-season (Nov–Dec)",
    yield: "High — benchmark variety for South India; 800–1200 kg/ha clean coffee",
    quality: "Excellent cup quality, bright acidity, preferred by specialty buyers",
    disease: "Moderately susceptible to coffee leaf rust (CLR); susceptible to white stem borer",
    notes: "Dominant variety in Coorg and Chikmagalur. Responds well to shade and good nutrition.",
  },
  "Cauvery (Catimor)": {
    origin: "Timor Hybrid × Caturra; CCRI selection for CLR resistance",
    maturity: "Early season (Oct–Nov)",
    yield: "Very high under irrigation — up to 1800 kg/ha clean coffee",
    quality: "Moderate cup quality; earthy; less favoured by specialty; good for commercial blends",
    disease: "CLR resistant; susceptible to coffee wilt (Gibberella xylarioides)",
    notes: "Heavy bearer but requires intensive nutrition. Can deplete soil fast without proper fertilisation.",
  },
  "SL9": {
    origin: "Scott Laboratories Kenya selection; introduced to India",
    maturity: "Mid-season",
    yield: "Moderate — 600–900 kg/ha clean coffee",
    quality: "High quality, complex flavour; popular in specialty market",
    disease: "Susceptible to CLR",
    notes: "Often planted in higher elevation blocks (above 1000m). Needs more shade than S.795.",
  },
  "Selection 6 (S.6)": {
    origin: "Ethiopian landrace selection; CCRI",
    maturity: "Mid to late",
    yield: "Moderate",
    quality: "Good cup quality, some chocolate and berry notes",
    disease: "Moderate CLR susceptibility",
    notes: "Less common; grown in pockets across Coorg.",
  },
}

export const ROBUSTA_VARIETIES = {
  "CxR (Coffea canephora × Robusta)": {
    origin: "CCRI hybrid; Congusta × Robusta cross",
    maturity: "Nov–Jan (later than Arabica)",
    yield: "Extremely high — 2000–3000 kg/ha cherry under good management",
    quality: "Typical Robusta: high body, low acidity, earthy; used in espresso blends and instant coffee",
    disease: "Generally more disease-resistant than Arabica; susceptible to stem canker",
    notes: "Requires heavier fertilisation and more water. Strip-picked (single pass) unlike Arabica selective picking.",
  },
}

// ---------------------------------------------------------------------------
// SOIL & NUTRITION
// ---------------------------------------------------------------------------

export const NUTRITION = {
  soilIdeal: {
    pH: "5.5–6.5 (slightly acidic). Above 7.0 causes micronutrient lockout; below 5.0 causes aluminium toxicity.",
    organicMatter: "Above 3% ideal. South Indian laterite soils typically 1.5–2.5% OM; regular composting essential.",
    depth: "60cm+ well-drained soil. Waterlogged roots cause Phytophthora root rot.",
  },
  npdSchedule: {
    description: "Split applications across the season are far more effective than single large doses.",
    schedule: [
      { timing: "Pre-blossom (Feb–Mar)", focus: "Potassium (K)", notes: "Triggers blossom and improves berry set. Apply K-rich fertiliser (MOP / SOP) before expected blossom showers." },
      { timing: "Post-blossom berry set (Apr)", focus: "Nitrogen (N) + Phosphorus (P)", notes: "Supports vegetative flush and berry development. NPK 17:17:17 or urea + SSP." },
      { timing: "Post-monsoon onset (Jun–Jul)", focus: "Nitrogen + micronutrients", notes: "Monsoon flush. Apply N to sustain growth. Add zinc sulfate and boron if deficiency seen." },
      { timing: "Pre-harvest berry fill (Aug–Sep)", focus: "Potassium + Calcium", notes: "Berry fill and hardening. K improves bean density and reduces hollow beans. Calcium prevents tip burn." },
    ],
  },
  micronutrients: {
    zinc: "Deficiency shows as small leaves, stunted new growth, interveinal chlorosis. Apply zinc sulfate foliar spray (0.5%) or soil application.",
    boron: "Deficiency causes poor berry set, hollow beans, distorted new leaves. Apply borax at 500g/ha or foliar spray.",
    iron: "Deficiency on high-pH soils: yellowing between veins on young leaves. Apply ferrous sulfate soil drench.",
    magnesium: "Deficiency common on leached laterite soils: older leaf yellowing. Apply dolomite or magnesium sulfate.",
  },
  organics: {
    compost: "2–3 tonnes/ha/year. Apply in trenches around the drip circle in Feb–Mar post-harvest.",
    vermicompost: "500–800 kg/ha. Higher nutrient availability than compost.",
    coffeeHusk: "Rich in potassium. Fermented coffee pulp/husk applied as mulch improves organic matter. Never apply fresh — ties up nitrogen.",
    greenManure: "Nitrogen-fixing cover crops (Crotalaria, Tephrosia) between rows improve soil N and suppress weeds.",
  },
}

// ---------------------------------------------------------------------------
// PESTS AND DISEASES
// ---------------------------------------------------------------------------

export const PESTS_AND_DISEASES = {
  "Coffee Berry Borer (CBB)": {
    scientific: "Hypothenemus hampei",
    description: "Tiny beetle (1.5mm) that bores into green berries and lays eggs inside. Larvae destroy the bean. India's #1 coffee pest.",
    symptoms: "Small round hole at the tip of green/ripe berry; hollow/damaged beans at processing.",
    riskPeriod: "From April (green berry set) through harvest. Peak risk when berries reach 120 days post-flowering.",
    management: [
      "Cultural: Remove all fallen berries (reservoir hosts). Strip all remaining berries after harvest — CBB overwinters in mummified fruit.",
      "Biological: Beauveria bassiana (entomopathogenic fungus) spray — effective, low toxicity.",
      "Traps: Ethanol:methanol (3:1) traps in each block from April onwards. Count trap catch weekly.",
      "Chemical (last resort): Endosulfan is banned; use chlorpyrifos or thiamethoxam with care.",
    ],
    economicThreshold: "More than 5% berry infestation = intervention required. Above 10% = significant yield and quality loss.",
  },
  "Coffee Leaf Rust (CLR)": {
    scientific: "Hemileia vastatrix",
    description: "Fungal disease causing yellow-orange pustules on leaf undersides; defoliation reduces photosynthesis and yield.",
    symptoms: "Orange powdery pustules on leaf underside, yellow spots on upper surface; premature leaf fall.",
    riskPeriod: "All year in warm humid conditions; worst during and after monsoon (Aug–Nov).",
    management: [
      "Use resistant varieties (Cauvery, Chandragiri) in high-risk blocks.",
      "Spray copper oxychloride (3g/litre) or hexaconazole preventively before monsoon onset.",
      "Shade regulation — dense shade increases humidity and CLR risk.",
      "Proper nutrition — potassium deficiency increases CLR susceptibility.",
    ],
  },
  "White Stem Borer (WSB)": {
    scientific: "Xylotrechus quadripes",
    description: "Beetle larvae bore through the main stem, causing sudden wilting and plant death. Can kill plants rapidly.",
    symptoms: "Sudden wilting of green shoots; brown bore dust at stem base; entry hole at soil level or on stem.",
    riskPeriod: "Adults emerge Dec–Feb and lay eggs at stem base. Larval activity through the year.",
    management: [
      "Trunk application of chlorpyrifos paste (50%) from November to January.",
      "Inspect stems during pruning — remove and destroy infested material.",
      "Remove stumps promptly — they are breeding sites.",
      "Avoid bark injuries during cultivation.",
    ],
  },
  "Mealy Bugs": {
    scientific: "Planococcus citri, P. lilacinus",
    description: "Sap-sucking insects that cause stunting, sooty mold, and fruit drop. Often tended by ants.",
    symptoms: "White cottony masses at leaf axils, berry junctions; stunted growth; sooty black mold.",
    management: [
      "Control ants (sticky bands on stems) — they protect and spread mealy bugs.",
      "Spray chlorpyrifos or dimethoate during crawling stage.",
      "Neem-based products for light infestations.",
    ],
  },
  "Root Rot / Phytophthora": {
    scientific: "Phytophthora cinnamomi, P. colocasiae",
    description: "Water mould causing root and collar rot. Kills plants in waterlogged or compacted areas.",
    symptoms: "Yellowing, wilting despite adequate water; brown rotted roots; plant death in patches.",
    riskPeriod: "Monsoon and immediately post-monsoon where drainage is poor.",
    management: [
      "Drainage is the primary intervention — trench and bund poorly draining areas.",
      "Potassium phosphonate (phosphoric acid) soil drench is highly effective.",
      "Mancozeb + metalaxyl drench preventively in high-risk areas.",
      "Never plant coffee in areas with history of water-logging.",
    ],
  },
}

// ---------------------------------------------------------------------------
// HARVEST & PROCESSING BENCHMARKS
// ---------------------------------------------------------------------------

export const PROCESSING_BENCHMARKS = {
  cherryToParchment: {
    wetProcess: "5–6 kg fresh cherry → 1 kg dry parchment (20% moisture). Ratio above 7:1 means green cherry being picked.",
    dryProcess: "~6–7 kg fresh cherry → 1 kg dry cherry coffee",
    notes: "Track this ratio per location. Persistent poor ratios indicate either over-ripe or green cherry, or drying issues.",
  },
  moisture: {
    targetAfterDrying: "10–11% moisture content for parchment before dispatch to curing works",
    tooWet: "Above 12%: mold risk in storage, rejected by exporters",
    tooDay: "Below 9%: bean becomes brittle, excessive breakage in hulling",
    method: "Bite test (should feel firm, not soft or crumbly) and hand moisture meter",
  },
  dryingTime: {
    sunDrying: "10–18 days in Coorg/Chikmagalur winter sun depending on weather. Thinner spread = faster drying.",
    raised_beds: "8–12 days on raised beds with better air circulation vs tarpaulin on ground",
    stirring: "Stir/turn at least twice daily for even drying and mold prevention",
    monsoonRisk: "November drizzle (mango showers) can re-wet parchment — always cover at night and when raining",
  },
  fermentation: {
    optimal: "18–36 hours for washed (fully washed) Arabica. Ambient temperature dependent.",
    tooShort: "Mucilage not fully broken down — slimy parchment, ferment notes in cup",
    tooLong: "Over-fermentation — vinegary, off-notes. Worse in hot weather.",
    test: "Rub parchment between palms — fully fermented parchment feels rough/squeaky, not slippery",
  },
  grading: {
    A_grade: "Fully ripe red/yellow cherry, clean, uniform, no damage",
    B_grade: "Slightly over/under ripe, minor defects",
    C_grade: "Black beans, sour beans, insect-damaged; reduces lot value significantly",
    notes: "Sort black and insect-damaged beans out before dispatch. Even 2% defects can downgrade an entire lot.",
  },
}

// ---------------------------------------------------------------------------
// YIELD BENCHMARKS
// ---------------------------------------------------------------------------

export const YIELD_BENCHMARKS = {
  arabica: {
    poor: "< 400 kg/ha clean coffee (may indicate disease, nutrient deficiency, or poor variety)",
    average: "600–800 kg/ha clean coffee",
    good: "900–1200 kg/ha clean coffee",
    exceptional: "> 1500 kg/ha under irrigation with intensive management",
    notes: "Alternate bearing is natural in coffee — expect a heavy crop followed by a lighter one. Track 2-year rolling average.",
  },
  robusta: {
    poor: "< 800 kg/ha clean coffee",
    average: "1200–1800 kg/ha clean coffee",
    good: "2000–2500 kg/ha clean coffee",
    exceptional: "> 3000 kg/ha under irrigation",
  },
  cherry_per_picker_day: {
    arabicaSelective: "40–60 kg per picker per day (selective picking, ripe cherry only)",
    robustaStrip: "80–150 kg per picker per day (strip picking — faster but requires all berries ripe)",
    belowBenchmark: "< 30 kg/picker/day may indicate training issues, dense canopy, or low crop load",
  },
}

// ---------------------------------------------------------------------------
// SHADE & TREE MANAGEMENT
// ---------------------------------------------------------------------------

export const SHADE_MANAGEMENT = {
  idealShade: "30–50% canopy cover for Arabica; 20–30% for Robusta (needs more sun)",
  species: [
    "Silver Oak (Grevillea robusta) — fastest growing, widely planted, good crown control",
    "Erythrina (Flame of the Forest / Dadap) — nitrogen-fixing, soft wood easy to lop",
    "Jackfruit, Mango, Pepper supporting trees — dual-purpose, additional income",
    "Jungle trees on estate boundaries — biodiversity value, wind protection",
  ],
  denseShadeProblems: [
    "Increased humidity → higher CLR and berry borer risk",
    "Reduced light → lower photosynthesis → fewer berries set",
    "More fallen leaves → slower drying of soil → waterlogging",
  ],
  poorShadeProblems: [
    "Higher temperature stress → early berry ripening and quality loss",
    "Greater moisture stress in dry season → irrigation need increases",
    "Soil erosion on slopes without leaf litter cover",
  ],
  management: "Lop shade trees in February–March (post-harvest, pre-blossom). Heavy lopping before blossom improves light penetration and flower induction.",
}

// ---------------------------------------------------------------------------
// WATER MANAGEMENT
// ---------------------------------------------------------------------------

export const WATER_MANAGEMENT = {
  blossom_irrigation: {
    purpose: "Dehydrate bushes to stress-trigger flowering, then irrigate to simulate blossom shower if natural rains are late.",
    method: "Withhold water for 3–4 weeks in Jan–Feb, then apply 50mm equivalent over 2–3 days by sprinkler or drip.",
    timing: "If natural blossom showers (pre-monsoon rain) are late (beyond mid-March), artificial irrigation prevents crop loss.",
  },
  drip_vs_sprinkler: {
    drip: "60–70% water saving vs overhead; ideal for water-scarce estates; higher setup cost",
    sprinkler: "More effective for blossom induction; better in clay soils",
    recommendation: "Drip for irrigation, overhead sprinkler for blossom triggering on estates with borewell",
  },
  annual_need: {
    arabica: "1200–1500mm total; heavy rainfall from monsoon supplemented by irrigation in dry months",
    robusta: "1500–2000mm; more drought-sensitive",
    critical_periods: "Pre-blossom (Jan–Feb) and berry fill (Aug–Sep) are the most water-sensitive periods",
  },
  rainGauge: "A standard rain gauge costs ₹200–500. Record daily. Coorg avg 2700mm/yr; Chikmagalur 1800–2200mm; Wayanad 2000–2500mm.",
}

// ---------------------------------------------------------------------------
// ECONOMICS & PRICING
// ---------------------------------------------------------------------------

export const COFFEE_ECONOMICS = {
  parchmentPriceDrivers: [
    "ICE Arabica futures (New York C contract) — global benchmark; INR-adjusted",
    "Robusta futures (London ICE) for Robusta",
    "India domestic auction prices at Bangalore Coffee Auctions",
    "Seasonal demand — post-harvest (Jan–Apr) prices typically higher as harvest quantity is known",
    "Specialty premium — AAA/AA grade estates can command 20–50% over commodity price",
  ],
  costBenchmarks: {
    laborAsPercentOfCost: "40–55% of total cost of production for most Indian estates",
    fertilizerAsPercentOfCost: "15–20%",
    irrigationPower: "5–10% for irrigated estates",
    curingAndMilling: "₹3–6/kg of clean coffee for outsourced curing",
  },
  targetCostPerKg: {
    efficient: "₹70–100/kg clean coffee total cost of production",
    average: "₹100–140/kg clean coffee",
    highCost: "> ₹150/kg — margin risk unless selling at specialty premium",
  },
  premiumOpportunities: [
    "Rainforest Alliance / UTZ / Organic certification — 5–15% premium from exporters",
    "Direct trade with specialty roasters — 30–80% premium over commodity price",
    "GI tag: Coorg Arabica / Chikmagalur Arabica / Wayanad Robusta have GI status — premium in domestic and export markets",
    "Pulped natural / honey process: differentiated processing can fetch specialty premium",
  ],
}

// ---------------------------------------------------------------------------
// COMPOSED AI CONTEXT BUILDER
// ---------------------------------------------------------------------------

/**
 * Returns a comprehensive agronomic knowledge block for injection into AI system prompts.
 * Covers varieties, nutrition schedule, pests, processing benchmarks, and economics.
 * Keep this under ~1500 tokens for use in system prompts.
 */
export function buildAgronomyContext(): string {
  return `## South Indian Coffee Agronomy Reference

### Varieties
Arabica: S.795 (mid-season, excellent quality, CLR-susceptible), Cauvery/Catimor (early, high yield, CLR-resistant, average quality), SL9 (high quality, high elevation).
Robusta: CxR hybrid (very high yield, strip-picked, Nov–Jan harvest).
Pepper: Panniyur-1 and Karimunda are dominant; harvested Nov–Feb alongside coffee.

### Fertilisation Schedule (Split Applications Are Critical)
- Pre-blossom (Feb–Mar): Potassium (MOP/SOP) to trigger flowering and berry set
- Post-blossom (Apr): NPK 17:17:17 for vegetative flush and berry development
- Post-monsoon onset (Jun–Jul): Nitrogen + micronutrients (zinc, boron) for monsoon growth
- Pre-harvest berry fill (Aug–Sep): Potassium + Calcium for bean density and quality
Missing any of these windows directly reduces yield and cup quality. Micronutrient deficiency (Zn, B, Mg) is common on South Indian laterite soils — watch for interveinal chlorosis and hollow beans.

### Key Pests and Diseases
Coffee Berry Borer (CBB): bores into green berries from April onwards. Monitor with ethanol:methanol traps. 5% infestation = intervention. Strip all fallen and residual berries after harvest.
Coffee Leaf Rust (CLR): orange pustules on leaf undersides. Worse Aug–Nov. Copper oxychloride spray preventively.
White Stem Borer (WSB): sudden wilting from larval boring. Trunk paste application Nov–Jan.
Phytophthora root rot: waterlogged areas only. Fix drainage first; use potassium phosphonate drench.

### Processing Benchmarks
Cherry-to-parchment ratio: 5–6:1 for wet process. Above 7:1 means green cherry is being picked — quality and yield loss.
Target moisture: 10–11% before dispatch. Above 12% = mold risk. Below 9% = brittle beans.
Sun drying: 10–18 days in Coorg winter. Stir twice daily. Cover at night and in rain.
Fermentation: 18–36 hours. Parchment should feel rough/squeaky when fermentation is complete.
Picker productivity: 40–60 kg/picker/day for Arabica selective picking; < 30 kg suggests training or crop load issue.

### Yield Benchmarks
Arabica: 600–800 kg/ha average, 900–1200 kg/ha good, > 1500 kg/ha exceptional. Alternate bearing is normal — track 2-year rolling average.
Robusta: 1200–1800 kg/ha average, 2000–2500 kg/ha good.

### Cost Benchmarks
Labour = 40–55% of cost. Fertiliser = 15–20%. Efficient total cost of production: ₹70–100/kg clean coffee. Above ₹150/kg = margin risk.

### Premium Opportunities
Specialty/direct trade premium: 30–80% over commodity. Certifications (RFA, Organic): 5–15%. Coorg Arabica, Chikmagalur Arabica, Wayanad Robusta all carry GI status — premium in export markets.

### Fertilizer Timing Rules (weather-sensitive)
NEVER apply urea or water-soluble NPK to dry soil — burns roots and volatilises.
WAIT for rain: apply granular fertilisers 1–2 days after at least 0.5 in (12mm) of rain to ensure soil moisture enables uptake.
AVOID applying before heavy rain (>1 in forecast in 24h) — leaches nutrients.
IDEAL window: soil moist from recent rain, no heavy rain forecast for 2–3 days.
For foliar sprays: apply in early morning or evening. Avoid if rain expected within 4 hours — spray washes off before absorption.
Post-blossom (Mar–Apr): if pre-monsoon showers haven't started, irrigate 1–2 days before applying NPK 17:17:17.
Monsoon season: skip fertiliser applications during continuous heavy rain periods; resume during dry spells within the monsoon.`
}

// ---------------------------------------------------------------------------
// WEATHER-BASED PROACTIVE ADVICE
// Generates actionable advice based on recent rainfall + forecast
// ---------------------------------------------------------------------------

type ForecastDay = {
  precipMm: number
  chanceOfRainPct: number
  date?: string
}

export type WeatherFarmAdvice = {
  signal: "apply-now" | "wait-for-rain" | "avoid-rain" | "neutral"
  title: string
  body: string
  urgency: "high" | "medium" | "low"
}

/**
 * Given recent rainfall and upcoming forecast, generate fertilizer/field advice.
 * Rules derived from ICAR-CCRI and Coffee Board of India extension guidelines.
 */
export function buildWeatherFarmAdvice(params: {
  last7DaysRainInches: number
  next3DaysForecastMm: number[]     // mm per day for next 3 days
  next3DaysChancePct: number[]      // % chance of rain per day
  monthIndex: number                // 0-based month (0=Jan)
}): WeatherFarmAdvice | null {
  const { last7DaysRainInches, next3DaysForecastMm, next3DaysChancePct, monthIndex } = params

  const totalForecastMm = next3DaysForecastMm.reduce((s, v) => s + v, 0)
  const maxDailyForecastMm = Math.max(...next3DaysForecastMm, 0)
  const heavyRainIncoming = maxDailyForecastMm > 25 || totalForecastMm > 50
  const goodRainIncoming = next3DaysForecastMm.some((mm) => mm >= 12)
  const highChanceRain = next3DaysChancePct.some((pct) => pct >= 60)
  const soilMoist = last7DaysRainInches >= 0.5
  const veraDrought = last7DaysRainInches < 0.1

  // Blossom shower season: Feb–Mar — irrigation + fertiliser timing is critical
  const isBlossomSeason = monthIndex === 1 || monthIndex === 2
  // Post-blossom: Apr — NPK application window
  const isPostBlossom = monthIndex === 3
  // Monsoon onset: Jun–Jul — key nutrition window
  const isMonsoonOnset = monthIndex === 5 || monthIndex === 6
  // Berry fill: Aug–Sep — potassium timing
  const isBerryFill = monthIndex === 7 || monthIndex === 8

  if (heavyRainIncoming) {
    return {
      signal: "avoid-rain",
      title: "Hold fertiliser — heavy rain incoming",
      body: `${Math.round(totalForecastMm)}mm forecast in the next 3 days. Applying fertiliser now will leach nutrients before roots can absorb them. Wait for the rain to pass and soil to settle (1–2 days).`,
      urgency: "high",
    }
  }

  if (veraDrought && (isBlossomSeason || isPostBlossom) && !goodRainIncoming) {
    return {
      signal: "wait-for-rain",
      title: `Irrigate before ${isBlossomSeason ? "blossom shower" : "post-blossom NPK"} application`,
      body: `Less than 0.1 in recorded in the last 7 days and no significant rain forecast. Soil is too dry for effective fertiliser uptake. Irrigate 1–2 days before applying, or wait for pre-monsoon showers.`,
      urgency: "high",
    }
  }

  if (soilMoist && !heavyRainIncoming && !highChanceRain) {
    if (isPostBlossom) {
      return {
        signal: "apply-now",
        title: "Good window to apply post-blossom NPK",
        body: `Soil is moist from recent rain and no heavy rain forecast. This is the right window to apply NPK 17:17:17 for berry development. Apply in the morning and work into the soil.`,
        urgency: "high",
      }
    }
    if (isMonsoonOnset) {
      return {
        signal: "apply-now",
        title: "Apply nitrogen + micronutrients now",
        body: `Monsoon season — soil is moist and conditions are right for nitrogen and zinc/boron foliar application. No heavy rain in the immediate forecast. Apply early morning.`,
        urgency: "medium",
      }
    }
    if (isBerryFill) {
      return {
        signal: "apply-now",
        title: "Apply potassium for berry fill",
        body: `Berry fill stage with adequate soil moisture — ideal for potassium + calcium application to improve bean density and cup quality. Apply before next rainfall cycle.`,
        urgency: "medium",
      }
    }
  }

  if (goodRainIncoming && (isPostBlossom || isMonsoonOnset || isBerryFill)) {
    return {
      signal: "wait-for-rain",
      title: "Rain coming — prepare to fertilise after",
      body: `${Math.round(totalForecastMm)}mm expected in the next 3 days. Stage your fertiliser so you can apply 1–2 days after the rain, when soil is moist but before the next heavy spell.`,
      urgency: "low",
    }
  }

  return null
}

