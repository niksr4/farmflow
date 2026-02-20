export type CoffeeLifecycleStage = "flowering" | "fruit-development" | "maturation" | "harvest" | "post-harvest"
export type CoffeeVarietyFocus = "arabica" | "robusta" | "mixed"
export type RainfallPattern = "below-normal" | "normal" | "above-normal"
export type LeafCondition = "healthy" | "mild-yellowing" | "severe-yellowing"
export type SoilDrainage = "good" | "moderate" | "poor"
export type RecommendationPriority = "high" | "medium" | "low"

export type SelectOption<T extends string> = {
  value: T
  label: string
}

export const COFFEE_STAGE_OPTIONS: Array<SelectOption<CoffeeLifecycleStage>> = [
  { value: "flowering", label: "Flowering" },
  { value: "fruit-development", label: "Fruit development" },
  { value: "maturation", label: "Maturation" },
  { value: "harvest", label: "Harvest" },
  { value: "post-harvest", label: "Post-harvest" },
]

export const COFFEE_VARIETY_OPTIONS: Array<SelectOption<CoffeeVarietyFocus>> = [
  { value: "arabica", label: "Arabica" },
  { value: "robusta", label: "Robusta" },
  { value: "mixed", label: "Mixed estate" },
]

export const RAINFALL_PATTERN_OPTIONS: Array<SelectOption<RainfallPattern>> = [
  { value: "below-normal", label: "Below normal rain" },
  { value: "normal", label: "Normal rain" },
  { value: "above-normal", label: "Above normal rain" },
]

export const LEAF_CONDITION_OPTIONS: Array<SelectOption<LeafCondition>> = [
  { value: "healthy", label: "Healthy leaves" },
  { value: "mild-yellowing", label: "Mild yellowing" },
  { value: "severe-yellowing", label: "Severe yellowing" },
]

export const DRAINAGE_OPTIONS: Array<SelectOption<SoilDrainage>> = [
  { value: "good", label: "Good drainage" },
  { value: "moderate", label: "Moderate drainage" },
  { value: "poor", label: "Poor drainage" },
]

export type AgronomyAdvisorInput = {
  stage: CoffeeLifecycleStage
  variety: CoffeeVarietyFocus
  rainfallPattern: RainfallPattern
  leafCondition: LeafCondition
  soilDrainage: SoilDrainage
  soilPH: number
  organicMatterPct: number
  targetYieldGainPct: number
  recentCherryDrop: boolean
  recentPestPressure: boolean
}

export type AgronomyRecommendation = {
  id: string
  priority: RecommendationPriority
  title: string
  action: string
  why: string
  expectedImpact: string
  modulesToTrack: string[]
}

export const DEFAULT_AGRONOMY_ADVISOR_INPUT: AgronomyAdvisorInput = {
  stage: "fruit-development",
  variety: "mixed",
  rainfallPattern: "normal",
  leafCondition: "healthy",
  soilDrainage: "good",
  soilPH: 5.8,
  organicMatterPct: 2.5,
  targetYieldGainPct: 10,
  recentCherryDrop: false,
  recentPestPressure: false,
}

const STAGE_BASE_RECOMMENDATIONS: Record<CoffeeLifecycleStage, AgronomyRecommendation> = {
  flowering: {
    id: "stage-flowering",
    priority: "medium",
    title: "Stabilize flowering window",
    action: "Keep soil moisture stable and avoid major canopy shocks until fruit set is complete.",
    why: "Flowering stress creates uneven fruit set and ripening spread.",
    expectedImpact: "More uniform cherry set and cleaner harvest passes.",
    modulesToTrack: ["Rainfall", "Journal", "Processing"],
  },
  "fruit-development": {
    id: "stage-fruit-development",
    priority: "medium",
    title: "Split nutrition during fruit fill",
    action: "Use split nutrient applications through fruit development instead of one heavy dose.",
    why: "Fruit filling needs steady nutrient and moisture support over several weeks.",
    expectedImpact: "Better bean fill, density, and reduced mid-season stress.",
    modulesToTrack: ["Inventory", "Accounts", "Journal"],
  },
  maturation: {
    id: "stage-maturation",
    priority: "medium",
    title: "Run selective picking standards",
    action: "Train teams to pick only target ripeness and plan multiple passes by block.",
    why: "Mixed maturity harvest lowers lot quality and sale price potential.",
    expectedImpact: "Higher cup quality consistency and better buyer confidence.",
    modulesToTrack: ["Processing", "Quality Grading", "Sales"],
  },
  harvest: {
    id: "stage-harvest",
    priority: "high",
    title: "Shorten harvest-to-processing delay",
    action: "Move cherries into intake and sorting quickly, with clear lot separation from field to processing.",
    why: "Delay after picking accelerates uncontrolled fermentation risk.",
    expectedImpact: "Lower defect rates and stronger lot traceability.",
    modulesToTrack: ["Processing", "Dispatch", "Activity Log"],
  },
  "post-harvest": {
    id: "stage-post-harvest",
    priority: "high",
    title: "Control drying endpoint",
    action: "Set strict moisture checks and trigger re-drying when lots drift from your storage target.",
    why: "Moisture drift after drying causes quality loss and shelf-life problems.",
    expectedImpact: "Safer storage and lower rework before sale.",
    modulesToTrack: ["Processing", "Quality Grading", "Dispatch"],
  },
}

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function pushRecommendation(
  bucket: AgronomyRecommendation[],
  recommendation: AgronomyRecommendation,
  seenIds: Set<string>,
) {
  if (seenIds.has(recommendation.id)) return
  seenIds.add(recommendation.id)
  bucket.push(recommendation)
}

export function getAgronomyRecommendations(input: AgronomyAdvisorInput): AgronomyRecommendation[] {
  const recommendations: AgronomyRecommendation[] = []
  const seenIds = new Set<string>()

  pushRecommendation(recommendations, STAGE_BASE_RECOMMENDATIONS[input.stage], seenIds)

  if (input.soilPH < 5.2) {
    pushRecommendation(
      recommendations,
      {
        id: "soil-acidic",
        priority: "high",
        title: "Correct high soil acidity",
        action: "Plan pH correction with lime strategy based on soil lab guidance and split applications.",
        why: "Very acidic soils reduce nutrient availability and root efficiency.",
        expectedImpact: "Higher nutrient uptake efficiency and stronger plant vigor.",
        modulesToTrack: ["Inventory", "Accounts", "Journal"],
      },
      seenIds,
    )
  } else if (input.soilPH > 6.6) {
    pushRecommendation(
      recommendations,
      {
        id: "soil-alkaline",
        priority: "medium",
        title: "Tune program for higher pH soil",
        action: "Avoid additional liming and prioritize nutrient forms suited to higher pH conditions.",
        why: "Higher pH can lock micronutrients and limit correction speed.",
        expectedImpact: "Reduced hidden deficiencies and cleaner nutrient response.",
        modulesToTrack: ["Inventory", "Journal"],
      },
      seenIds,
    )
  }

  if (input.organicMatterPct < 2) {
    pushRecommendation(
      recommendations,
      {
        id: "organic-matter-low",
        priority: "high",
        title: "Raise soil organic matter",
        action: "Increase compost/mulch return, protect ground cover, and reduce bare soil exposure.",
        why: "Low organic matter weakens moisture retention and nutrient buffering.",
        expectedImpact: "Stronger root zone resilience and lower drought stress.",
        modulesToTrack: ["Inventory", "Journal", "Rainfall"],
      },
      seenIds,
    )
  }

  if (input.rainfallPattern === "below-normal") {
    pushRecommendation(
      recommendations,
      {
        id: "rainfall-below-normal",
        priority: "high",
        title: "Protect moisture under low rainfall",
        action: "Tighten irrigation scheduling where available and improve mulching around productive blocks.",
        why: "Water deficits during key stages reduce fruit set and bean fill.",
        expectedImpact: "Lower yield drop risk in dry spells.",
        modulesToTrack: ["Rainfall", "Journal", "Season View"],
      },
      seenIds,
    )
  }

  if (input.rainfallPattern === "above-normal" && input.soilDrainage !== "good") {
    pushRecommendation(
      recommendations,
      {
        id: "rainfall-drainage-risk",
        priority: "high",
        title: "Drainage and disease prevention",
        action: "Open drainage paths, reduce standing water, and increase scouting frequency in wet blocks.",
        why: "Wet conditions with poor drainage increase root and fungal pressure.",
        expectedImpact: "Less crop stress and fewer weather-driven quality losses.",
        modulesToTrack: ["Rainfall", "Journal", "Activity Log"],
      },
      seenIds,
    )
  }

  if (input.leafCondition === "mild-yellowing" || input.leafCondition === "severe-yellowing") {
    pushRecommendation(
      recommendations,
      {
        id: "leaf-yellowing",
        priority: input.leafCondition === "severe-yellowing" ? "high" : "medium",
        title: "Investigate nutrient imbalance",
        action: "Run leaf/soil checks and adjust nutrient timing rather than increasing blanket dose.",
        why: "Yellowing may indicate deficiency, lockout, or root stress depending on conditions.",
        expectedImpact: "More precise corrections and lower fertilizer waste.",
        modulesToTrack: ["Journal", "Inventory", "Accounts"],
      },
      seenIds,
    )
  }

  if (input.recentCherryDrop) {
    pushRecommendation(
      recommendations,
      {
        id: "cherry-drop",
        priority: "high",
        title: "Respond to cherry drop early",
        action: "Audit water stress, boron/calcium status, and pest pressure in affected blocks this week.",
        why: "Cherry drop can quickly compound into yield loss if untreated.",
        expectedImpact: "Faster recovery and reduced fruit loss spread.",
        modulesToTrack: ["Processing", "Journal", "Rainfall"],
      },
      seenIds,
    )
  }

  if (input.recentPestPressure) {
    pushRecommendation(
      recommendations,
      {
        id: "pest-pressure",
        priority: "high",
        title: "Apply integrated pest response",
        action: "Use block-level scouting thresholds and targeted intervention instead of blanket sprays.",
        why: "Late or broad treatment increases cost without protecting high-risk blocks first.",
        expectedImpact: "Lower input waste and better control on priority blocks.",
        modulesToTrack: ["Journal", "Accounts", "Activity Log"],
      },
      seenIds,
    )
  }

  if (input.variety === "arabica") {
    pushRecommendation(
      recommendations,
      {
        id: "arabica-focus",
        priority: "low",
        title: "Protect Arabica quality premium",
        action: "Keep stricter ripeness grading and lot separation for Arabica blocks.",
        why: "Arabica value is highly sensitive to picking and lot discipline.",
        expectedImpact: "Improved quality consistency and saleability for premium lots.",
        modulesToTrack: ["Quality Grading", "Sales", "Dispatch"],
      },
      seenIds,
    )
  }

  if (input.variety === "robusta") {
    pushRecommendation(
      recommendations,
      {
        id: "robusta-focus",
        priority: "low",
        title: "Drive Robusta productivity consistency",
        action: "Standardize harvest rounds and intake sorting to reduce quality spread between blocks.",
        why: "Robusta volume gains are strongest when operations are consistent at scale.",
        expectedImpact: "Cleaner throughput and steadier commercial lots.",
        modulesToTrack: ["Processing", "Dispatch", "Sales"],
      },
      seenIds,
    )
  }

  if (input.targetYieldGainPct >= 15) {
    pushRecommendation(
      recommendations,
      {
        id: "aggressive-yield-target",
        priority: "medium",
        title: "Phase high yield targets by block",
        action: "Prioritize top-performing blocks first and stage input increases over two cycles.",
        why: "Large immediate jumps increase spend risk if not tied to block response.",
        expectedImpact: "Safer yield growth with clearer ROI visibility.",
        modulesToTrack: ["Season View", "Accounts", "Activity Log"],
      },
      seenIds,
    )
  }

  pushRecommendation(
    recommendations,
    {
      id: "data-discipline",
      priority: "low",
      title: "Strengthen data discipline",
      action: "Log each field action with block, date, and reason so yield outcomes are explainable later.",
      why: "Advisory quality improves when each decision is measurable in your own records.",
      expectedImpact: "Better season learning loop and sharper future recommendations.",
      modulesToTrack: ["Journal", "Activity Log", "Season View"],
    },
    seenIds,
  )

  return recommendations.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

