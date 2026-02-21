"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BookOpen, Leaf, Droplets, Sprout, SunMedium, CheckCircle2, ArrowRight, FlaskConical, Wheat, ClipboardList } from "lucide-react"
import {
  COFFEE_STAGE_OPTIONS,
  COFFEE_VARIETY_OPTIONS,
  DRAINAGE_OPTIONS,
  LEAF_CONDITION_OPTIONS,
  RAINFALL_PATTERN_OPTIONS,
  DEFAULT_AGRONOMY_ADVISOR_INPUT,
  getAgronomyRecommendations,
  type AgronomyAdvisorInput,
  type RecommendationPriority,
} from "@/lib/agronomy-playbook"

const highlightCards = [
  {
    title: "Selective picking",
    description: "Capture ripeness standards and picking passes so each lot stays consistent.",
    bullets: [
      "Log ripeness cues used by your team (color, firmness, float tests).",
      "Record each pass date to track ripeness windows per block.",
      "Tag lots by plot + picker team so quality notes map cleanly to yield.",
    ],
    image: "/resources/coffee-harvest.jpg",
    alt: "Hands harvesting ripe coffee cherries",
    tag: "Harvest",
  },
  {
    title: "Drying & storage",
    description: "Track drying intent, turning cadence, and storage readiness by lot.",
    bullets: [
      "Note drying method (raised beds, patio, mechanical) and daily turns.",
      "Record shade or cover changes to explain moisture shifts.",
      "Log storage move-in date and bag type to retain quality context.",
    ],
    image: "/resources/coffee-drying.jpg",
    alt: "Coffee beans drying on a bed",
    tag: "Processing",
  },
  {
    title: "Coffee plant anatomy",
    description: "Keep agronomy notes consistent by referring to the same plant parts.",
    bullets: [
      "Use the diagram to label pruning notes or disease observations.",
      "Tie flowering/fruiting notes to the same node terminology.",
      "Map pest issues to branches, nodes, or cherries for clean analysis.",
    ],
    image: "/resources/coffee-plant-diagram.jpg",
    alt: "Diagram of the Coffea arabica plant",
    tag: "Field Guide",
  },
  {
    title: "Pepper intercrop",
    description: "Capture pepper cycles alongside coffee without losing estate context.",
    bullets: [
      "Note support tree condition and vine pruning windows.",
      "Record harvest rounds and drying notes like coffee lots.",
      "Track pepper yield separately to compare ROI by block.",
    ],
    image: "/resources/black-pepper.jpg",
    alt: "Black pepper plant with clusters",
    tag: "Pepper",
  },
]

const lifecyclePhases = [
  {
    phase: "Phase 1",
    title: "Flowering",
    timing: "Typically Mar-May after first stable rains",
    icon: Leaf,
    image: "/resources/coffee-phases/phase-1-flowering.jpg",
    alt: "Coffee blossoms on a branch",
    summary:
      "Flowering is the trigger for the season. Coffee bushes bloom in short jasmine-like bursts that may last only a few days per flush.",
    bullets: [
      "Wind and insects help pollination, which is critical for cherry set.",
      "Flowering windows can stretch across weeks depending on rainfall timing.",
      "Inconsistent bloom usually leads to uneven ripening later.",
    ],
    watchout: "Late or erratic rain often causes patchy flower set and uneven fruit loads per block.",
    didYouKnow: "Flowering may run in several flushes over weeks depending on the local rain pattern.",
  },
  {
    phase: "Phase 2",
    title: "Fruit development",
    timing: "Commonly Jun-Aug (varies by location)",
    icon: Sprout,
    image: "/resources/coffee-phases/phase-2-fruit-development.jpg",
    alt: "Green coffee cherries during early fruit development",
    summary:
      "After flowering, coffee cherries form and fill. Beans build mass and chemistry during this stage, shaping eventual flavor potential.",
    bullets: [
      "Cherries ripen at different speeds on the same plant.",
      "Water and nutrients in this phase strongly affect bean density.",
      "Pest and disease pressure here can directly reduce harvest quality.",
    ],
    watchout: "Stress in this stage lowers cherry size and increases defects at processing.",
    didYouKnow: "Coffee is grown in roughly 80 countries around the equator, with different growth calendars.",
  },
  {
    phase: "Phase 3",
    title: "Maturation",
    timing: "Color shift to red/yellow/orange by cultivar",
    icon: SunMedium,
    image: "/resources/coffee-phases/phase-3-maturation.jpg",
    alt: "Ripe coffee cherries on a branch",
    summary:
      "Ripeness at picking has a bigger quality impact than simple freshness. Branches usually carry mixed maturity, so selection discipline matters.",
    bullets: [
      "Cherries change from green to red/yellow/orange when ripe.",
      "Overripe cherries deteriorate quickly because of high sugar and moisture.",
      "Teams need clear ripeness standards for each pass.",
    ],
    watchout: "Picking too early reduces cup quality; picking too late increases fermentation risk.",
    didYouKnow: "Coffee cherries can hold about 60% moisture, so overripe fruit degrades quickly in warm conditions.",
  },
  {
    phase: "Phase 4",
    title: "Harvest",
    timing: "North of equator: Sep-Dec | South: Apr-Aug",
    icon: CheckCircle2,
    image: "/resources/coffee-phases/phase-4-harvest.jpg",
    alt: "Hand picking ripe coffee cherries",
    summary:
      "Harvest is where field decisions convert into commercial quality. Hand picking is still essential for premium lots and steep terrain.",
    bullets: [
      "Selective hand picking captures only ripe cherries for quality lots.",
      "Mechanized harvest can support robusta or flatter blocks at scale.",
      "Processing should start quickly after harvest to protect quality.",
    ],
    watchout: "Delayed cherry intake after picking drives unwanted fermentation and cup faults.",
    didYouKnow: "Harvest windows shift by hemisphere, but careful lot handling is always the quality bottleneck.",
  },
]

const postHarvestFlow = [
  {
    title: "Cherry intake",
    detail: "Sort and float cherries, remove damaged fruit, and separate lots by maturity and block.",
  },
  {
    title: "Depulp / ferment",
    detail: "Extract beans from cherries, then ferment under controlled time and temperature windows.",
  },
  {
    title: "Wash & dry",
    detail: "Wash clean, then dry to target moisture with daily turning and shade control.",
  },
  {
    title: "Condition & store",
    detail: "Stabilize moisture, bag by lot, and store with traceable movement records.",
  },
]

const infographicCards = [
  {
    title: "Coffee Bean Structure",
    image: "/resources/coffee-phases/coffee-bean-structure.png",
    alt: "Cross-section infographic of coffee bean layers",
    description: "Quick visual to explain outer fruit layers, parchment, silverskin, and bean anatomy.",
    sourceLabel: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Coffee_Bean_Structure.svg",
    license: "CC BY-SA 3.0",
  },
  {
    title: "Coffee Plant Anatomy",
    image: "/resources/coffee-plant-diagram.jpg",
    alt: "Diagram of Coffea arabica plant parts",
    description: "Useful for aligning pruning, disease scouting, and flowering notes across field teams.",
    sourceLabel: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Diagram_of_Coffea_arabica-cropped.jpg",
    license: "CC BY-SA 2.5",
  },
  {
    title: "Ripeness Reference",
    image: "/resources/coffee-phases/phase-3-maturation.jpg",
    alt: "Ripe coffee cherries visual reference",
    description: "Use as a practical visual benchmark when training pickers on maturity standards.",
    sourceLabel: "Wikimedia Commons",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Coffee_cherries_on_bush_at_Fairview_Estate,_Kiambu,_KE.jpg",
    license: "CC BY-SA 4.0",
  },
  {title: "Lifecycle of Coffee",
    image: "/resources/coffee-lifecycle.jpg",
    alt: "Coffee lifecycle infographic",
    sourceLabel: "Visual Capitalist",
    sourceUrl: "https://www.visualcapitalist.com/from-bean-to-brew-the-coffee-supply-chain/",
    license: "CC BY-SA 4.0",
  }
]

const checklistItems = [
  {
    title: "Fertilizer & soil log",
    icon: Sprout,
    points: [
      "Record fertilizer brand, composition, and application rate per block.",
      "Attach soil test results and the decision you made from them.",
      "Track weather on application day for context in yield analysis.",
    ],
  },
  {
    title: "Arabica vs Robusta notes",
    icon: Leaf,
    points: [
      "Capture cultivar, shade level, and flowering windows separately by type.",
      "Note picking cadence differences so pricing and quality stay clear.",
      "Store cup profile notes alongside the lot for buyer conversations.",
    ],
  },
  {
    title: "Quality & storage readiness",
    icon: CheckCircle2,
    points: [
      "Log moisture checks and defect sorting with the lot date.",
      "Record where lots are stored so dispatch stays traceable.",
      "Document any re-drying or re-sorting events for the same lot.",
    ],
  },
]

const climateNotes = [
  {
    title: "Rainfall + irrigation",
    icon: Droplets,
    detail: "Use the Rainfall + Journal tabs to correlate irrigation, spray, and yield shifts.",
  },
  {
    title: "Sun & shade",
    icon: SunMedium,
    detail: "Log shade adjustments and canopy work to connect sunlight changes to ripening speed.",
  },
]

const resourceSections = [
  { id: "agronomy-advisor", label: "Agronomy advisor" },
  { id: "nutrition-program", label: "Nutrition guide" },
  { id: "coffee-lifecycle", label: "Lifecycle" },
  { id: "processing-flow", label: "Post-harvest flow" },
  { id: "visual-library", label: "Visual library" },
  { id: "field-guides", label: "Field guides" },
  { id: "operational-checklists", label: "Checklists" },
  { id: "climate-reminders", label: "Climate notes" },
  { id: "image-credits", label: "Credits" },
]

const playbookHighlights = [
  { label: "Lifecycle phases", value: String(lifecyclePhases.length) },
  { label: "Training visuals", value: String(infographicCards.length) },
  { label: "Ops checklists", value: String(checklistItems.length) },
  { label: "Advisor rules", value: "10+" },
  { label: "Flow steps", value: String(postHarvestFlow.length) },
]

const nutritionProgramRows = [
  {
    stage: "Flowering",
    objective: "Protect flower retention and early fruit set",
    nutritionFocus: "Balanced N + K, with micronutrients only when deficiency is confirmed.",
    fieldPractice: "Keep moisture stable and avoid heavy stress operations during active bloom.",
  },
  {
    stage: "Fruit development",
    objective: "Maximize bean fill and density",
    nutritionFocus: "Split feed program so uptake remains steady through fruit expansion.",
    fieldPractice: "Combine nutrient splits with pest scouting in the same weekly round.",
  },
  {
    stage: "Maturation",
    objective: "Maintain quality while fruit colors evenly",
    nutritionFocus: "Avoid late excessive N; prioritize balance to support ripening consistency.",
    fieldPractice: "Train teams on selective picking and separate under-ripe lots.",
  },
  {
    stage: "Harvest + post-harvest",
    objective: "Protect lot quality and reduce rejection risk",
    nutritionFocus: "Focus shifts from feeding to rapid intake, clean processing, and drying control.",
    fieldPractice: "Run intake-to-drying SOPs with moisture checkpoints for each lot.",
  },
]

const priorityBadgeClassByLevel: Record<RecommendationPriority, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
}

export default function ResourcesTab() {
  const [advisorInput, setAdvisorInput] = useState<AgronomyAdvisorInput>(DEFAULT_AGRONOMY_ADVISOR_INPUT)

  const advisorRecommendations = useMemo(() => getAgronomyRecommendations(advisorInput), [advisorInput])

  const highPriorityCount = useMemo(
    () => advisorRecommendations.filter((item) => item.priority === "high").length,
    [advisorRecommendations],
  )
  const mediumPriorityCount = useMemo(
    () => advisorRecommendations.filter((item) => item.priority === "medium").length,
    [advisorRecommendations],
  )
  const lowPriorityCount = useMemo(
    () => advisorRecommendations.filter((item) => item.priority === "low").length,
    [advisorRecommendations],
  )

  const updateNumberField = (
    key: "soilPH" | "organicMatterPct" | "targetYieldGainPct",
    rawValue: string,
  ) => {
    const parsed = Number(rawValue)
    const value = Number.isFinite(parsed) ? parsed : 0
    setAdvisorInput((previous) => ({ ...previous, [key]: value }))
  }

  return (
    <div className="space-y-6 pb-4">
      <Card id="overview" className="scroll-mt-24 overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 shadow-sm">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="h-5 w-5 text-emerald-700" />
              Estate Resources
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Field-ready guides, checklists, and visuals to train teams across flowering, harvest, processing, and storage.
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-white text-emerald-700 border-emerald-200">
            Platform-enabled module
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="text-sm text-muted-foreground">
            Use this page as an operating playbook while entering records in Processing, Dispatch, Sales, and Journal. Keep guidance
            estate-specific by defining your own ripeness cues, moisture thresholds, and handling SOPs.
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {playbookHighlights.map((item) => (
              <div key={item.label} className="rounded-lg border border-emerald-100 bg-white/90 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-emerald-700">{item.label}</p>
                <p className="text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white/95">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">Quick Jump</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {resourceSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              {section.label}
            </a>
          ))}
        </CardContent>
      </Card>

      <Card id="agronomy-advisor" className="scroll-mt-24 border-emerald-100 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="h-4 w-4 text-emerald-700" />
            Agronomy Advisor (Phase 1)
          </CardTitle>
          <CardDescription>
            Rule-based guidance to decide what to do this week for fertilizer planning, plant health, and yield protection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Lifecycle stage</Label>
                <Select
                  value={advisorInput.stage}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({ ...previous, stage: value as AgronomyAdvisorInput["stage"] }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COFFEE_STAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Coffee focus</Label>
                <Select
                  value={advisorInput.variety}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({ ...previous, variety: value as AgronomyAdvisorInput["variety"] }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COFFEE_VARIETY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Rain pattern</Label>
                <Select
                  value={advisorInput.rainfallPattern}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({
                      ...previous,
                      rainfallPattern: value as AgronomyAdvisorInput["rainfallPattern"],
                    }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RAINFALL_PATTERN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Leaf condition</Label>
                <Select
                  value={advisorInput.leafCondition}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({
                      ...previous,
                      leafCondition: value as AgronomyAdvisorInput["leafCondition"],
                    }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAF_CONDITION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Soil drainage</Label>
                <Select
                  value={advisorInput.soilDrainage}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({
                      ...previous,
                      soilDrainage: value as AgronomyAdvisorInput["soilDrainage"],
                    }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DRAINAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Recent cherry drop</Label>
                <Select
                  value={advisorInput.recentCherryDrop ? "yes" : "no"}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({ ...previous, recentCherryDrop: value === "yes" }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Soil pH</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="3.5"
                  max="8.5"
                  value={advisorInput.soilPH}
                  onChange={(event) => updateNumberField("soilPH", event.target.value)}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Organic matter %</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="8"
                  value={advisorInput.organicMatterPct}
                  onChange={(event) => updateNumberField("organicMatterPct", event.target.value)}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Pest pressure this week</Label>
                <Select
                  value={advisorInput.recentPestPressure ? "yes" : "no"}
                  onValueChange={(value) =>
                    setAdvisorInput((previous) => ({ ...previous, recentPestPressure: value === "yes" }))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.16em] text-slate-600">Target yield gain %</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="40"
                  value={advisorInput.targetYieldGainPct}
                  onChange={(event) => updateNumberField("targetYieldGainPct", event.target.value)}
                  className="bg-white"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-600">Plan snapshot</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-red-100 bg-red-50 px-2 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-red-700">High</p>
                  <p className="text-lg font-semibold text-red-700">{highPriorityCount}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-amber-700">Medium</p>
                  <p className="text-lg font-semibold text-amber-700">{mediumPriorityCount}</p>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50 px-2 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-sky-700">Low</p>
                  <p className="text-lg font-semibold text-sky-700">{lowPriorityCount}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm text-slate-700">
                Use this plan as a weekly field brief, then log the actual actions in Journal, Inventory, and Accounts.
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                Guidance is decision support only. Use local agronomist and lab results before final fertilizer dosing.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {advisorRecommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-200 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={priorityBadgeClassByLevel[recommendation.priority]}>
                    {recommendation.priority.toUpperCase()}
                  </Badge>
                  <p className="font-semibold text-slate-900">{recommendation.title}</p>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">Action: </span>
                  {recommendation.action}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-slate-700">Why: </span>
                  {recommendation.why}
                </p>
                <p className="mt-1 text-sm text-emerald-700">
                  <span className="font-medium">Expected impact: </span>
                  {recommendation.expectedImpact}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recommendation.modulesToTrack.map((moduleName) => (
                    <Badge key={`${recommendation.id}-${moduleName}`} variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {moduleName}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card id="nutrition-program" className="scroll-mt-24 border-slate-200 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wheat className="h-4 w-4 text-emerald-700" />
            Coffee nutrition and field-practice guide
          </CardTitle>
          <CardDescription>
            Teaching table for deciding what to prioritize by stage before you schedule fertilizer or field labor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {nutritionProgramRows.map((row) => (
            <div key={row.stage} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {row.stage}
                </Badge>
                <p className="font-medium text-slate-900">{row.objective}</p>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-medium">Nutrition focus: </span>
                {row.nutritionFocus}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-slate-700">Field practice: </span>
                {row.fieldPractice}
              </p>
            </div>
          ))}
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-900">
            Use soil and leaf testing as the source of truth. This guide helps structure decisions, not replace agronomy diagnosis.
          </div>
        </CardContent>
      </Card>

      <Card id="coffee-lifecycle" className="scroll-mt-24 border-emerald-100 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Coffee Lifecycle Playbook</CardTitle>
          <CardDescription>
            End-to-end teaching guide for flowering, fruit development, maturation, and harvest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 md:grid-cols-4">
            {lifecyclePhases.map((phase) => (
              <div key={phase.title} className="rounded-xl border border-emerald-100 bg-white p-3 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-sm">
                <div className="flex items-center gap-2">
                  <phase.icon className="h-3.5 w-3.5 text-emerald-700" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{phase.phase}</p>
                </div>
                <p className="mt-1 font-semibold text-slate-900">{phase.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{phase.timing}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {lifecyclePhases.map((phase) => (
              <Card key={phase.title} className="group overflow-hidden border-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative h-48 w-full">
                  <Image
                    src={phase.image}
                    alt={phase.alt}
                    fill
                    sizes="(min-width: 1280px) 42vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
                  <div className="absolute bottom-3 left-3">
                    <Badge className="bg-white/90 text-emerald-700 border-emerald-200">{phase.phase}</Badge>
                  </div>
                </div>
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">{phase.title}</CardTitle>
                      <CardDescription>{phase.timing}</CardDescription>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{phase.summary}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                    {phase.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-sm text-amber-900">
                    <span className="font-medium">Watchout: </span>
                    {phase.watchout}
                  </div>
                  <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-sm text-sky-900">
                    <span className="font-medium">Did you know? </span>
                    {phase.didYouKnow}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card id="processing-flow" className="scroll-mt-24 border-slate-200 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Post-harvest processing flow</CardTitle>
          <CardDescription>
            After harvest, quality depends on fast and disciplined movement from cherry intake to storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {postHarvestFlow.map((step, index) => (
            <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-200 hover:shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Step {index + 1}
              </p>
              <p className="mt-1 font-semibold text-slate-900">{step.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
              {index < postHarvestFlow.length - 1 && (
                <ArrowRight className="mt-3 hidden h-4 w-4 text-slate-400 md:block" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="visual-library" className="scroll-mt-24 border-slate-200 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Visual Library & Infographics</CardTitle>
          <CardDescription>
            Curated visuals you can use to train pickers, processors, and new supervisors.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {infographicCards.map((item) => (
            <Card key={item.title} className="group overflow-hidden border-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative h-40 w-full bg-slate-50">
                <Image src={item.image} alt={item.alt} fill sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.02]" />
              </div>
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>{item.license}</p>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                  View source ({item.sourceLabel})
                </a>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <div id="field-guides" className="scroll-mt-24 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Field Guides</h3>
          <p className="text-sm text-muted-foreground">Practical references for harvest, drying, anatomy, and intercrop operations.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {highlightCards.map((card) => (
            <Card key={card.title} className="group overflow-hidden border-emerald-100 bg-white/95 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
              <div className="relative h-44 w-full overflow-hidden">
                <Image
                  src={card.image}
                  alt={card.alt}
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                  priority={card.title === "Selective picking"}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
              </div>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {card.tag}
                  </Badge>
                </div>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc ml-4 space-y-1 text-sm text-muted-foreground">
                  {card.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div id="operational-checklists" className="scroll-mt-24 space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <ClipboardList className="h-4 w-4 text-emerald-700" />
            Operational Checklists
          </h3>
          <p className="text-sm text-muted-foreground">Capture these inputs consistently so your season analysis stays reliable.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {checklistItems.map((item) => (
            <Card key={item.title} className="border-slate-200 bg-white/95 transition hover:border-emerald-200 hover:shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <item.icon className="h-4 w-4 text-emerald-700" />
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc ml-4 space-y-1 text-sm text-muted-foreground">
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card id="climate-reminders" className="scroll-mt-24 border-slate-200 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Climate & context reminders</CardTitle>
          <CardDescription>Small signals to capture that explain yield swings over time.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
          {climateNotes.map((note) => (
            <div key={note.title} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-4 transition hover:border-emerald-200 hover:shadow-sm">
              <note.icon className="mt-0.5 h-4 w-4 text-emerald-700" />
              <div>
                <p className="font-medium text-slate-700">{note.title}</p>
                <p>{note.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card id="image-credits" className="scroll-mt-24 border-dashed border-slate-200 bg-white/95">
        <CardHeader>
          <CardTitle className="text-base">Image credits</CardTitle>
          <CardDescription>Source imagery used in this resource library.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Lifecycle flowering photo: <a href="https://commons.wikimedia.org/wiki/File:20210529_Coffea_arabica_blossom_009.jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a> (CC BY-SA 3.0, Zinnmann).
          </p>
          <p>
            Lifecycle fruit-development photo: <a href="https://commons.wikimedia.org/wiki/File:Coffee_Berries_in_Yercaud,_Tamil_Nadu,_India.jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a> (CC BY-SA 4.0, Matthew T Rader).
          </p>
          <p>
            Lifecycle maturation photo: <a href="https://commons.wikimedia.org/wiki/File:Coffee_cherries_on_bush_at_Fairview_Estate,_Kiambu,_KE.jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a> (CC BY-SA 4.0, Daniel Case).
          </p>
          <p>
            Lifecycle harvest photo: <a href="https://commons.wikimedia.org/wiki/File:Hands-that-are-picking-coffee-beans-from-coffee-tree.jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a> (CC BY-SA 4.0, Saddymonster).
          </p>
          <p>
            Bean structure infographic: <a href="https://commons.wikimedia.org/wiki/File:Coffee_Bean_Structure.svg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a> (CC BY-SA 3.0, Y tambe / Chabacano).
          </p>
          <p>
            Selective picking photo: <a href="https://unsplash.com/photos/ktooMlqG28c" target="_blank" rel="noreferrer" className="underline">Unsplash</a>.
          </p>
          <p>
            Drying beans photo: <a href="https://commons.wikimedia.org/wiki/File:Coffee_Beans_Drying_(11586771164).jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a>.
          </p>
          <p>
            Coffee plant diagram: <a href="https://commons.wikimedia.org/wiki/File:Diagram_of_Coffea_arabica-cropped.jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a>.
          </p>
          <p>
            Pepper plant photo: <a href="https://pixabay.com/photos/black-peppercorn-pepper-spice-8337819/" target="_blank" rel="noreferrer" className="underline">Pixabay</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
