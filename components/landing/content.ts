/**
 * All copy and data for the public landing page.
 *
 * Kept apart from the markup so the words can be edited without touching layout, and so a
 * copy change never has to survive a merge against a JSX refactor. Two rules hold here:
 *
 *  1. No em dashes. The house voice uses full stops, commas and colons.
 *  2. Nothing invented. Season figures are real records from the Coorg estate FarmFlow was
 *     built on. Anything illustrative (the sample field entry, the sample Monday brief) is
 *     labelled as a sample on screen, because a made-up record shown as a real one is a lie
 *     whether or not anybody notices.
 */

import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock3,
  CloudOff,
  Coffee,
  Droplets,
  FileSpreadsheet,
  Mail,
  Scale,
  Smartphone,
  Sprout,
  Sun,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react"

/* ── Hero ─────────────────────────────────────────────────────────────────── */

export const heroAssurances = [
  { label: "30 days free, no card", icon: CheckCircle2 },
  { label: "Set up in a morning", icon: Clock3 },
  { label: "Marked from a phone", icon: Smartphone },
  { label: "Holds when the signal drops", icon: CloudOff },
]

/** The floating card over the hero photograph. Shape of a real entry, not a real entry. */
export const heroSampleEntry = {
  tag: "Sample entry",
  timestamp: "Marked 6:42 AM, from the field",
  block: "Block 4B",
  variety: "Arabica",
  rows: [
    { label: "Cherry weighed in", value: "1,240 kg" },
    { label: "Into the pulper", value: "1,180 kg" },
    { label: "Wet parchment out", value: "312 kg" },
  ],
  footnote: "Outturn updates the moment it is saved.",
}

/* ── One season, end to end ───────────────────────────────────────────────── */

export const seasonChain = [
  {
    stage: "Picking",
    metricLabel: "Cherry taken in",
    value: 183766,
    suffix: " kg",
    note: "88 separate weighings, each against the block it came off.",
    image: "/images/estate-journey-harvest.jpg",
    alt: "A picker's hands sorting ripe red coffee cherry above a full basin",
    icon: Coffee,
    tint: "text-amber-200",
  },
  {
    stage: "Pulping",
    metricLabel: "Parchment off the yard",
    value: 50229,
    suffix: " kg",
    note: "27.3 kg of parchment for every 100 kg of cherry that went in.",
    image: "/images/estate-journey-processing.jpg",
    alt: "Ripe cherry moving down the washing channel beside the pulper",
    icon: Droplets,
    tint: "text-emerald-200",
  },
  {
    stage: "Curing",
    metricLabel: "Sent to the curing works",
    value: 19347,
    suffix: " kg",
    note: "Still your stock until the curer's weighbridge slip comes back.",
    image: "/images/estate-journey-curing.jpg",
    alt: "Parchment coffee spread out on hessian sacking to dry",
    icon: Sun,
    tint: "text-sky-200",
  },
  {
    stage: "Sale",
    metricLabel: "Booked for the season",
    value: 55.6,
    prefix: "₹",
    suffix: " L",
    decimals: 1,
    note: "11,910 kg priced by grade and settled with the buyer.",
    image: "/images/estate-journey-dispatch.jpg",
    alt: "A loaded lorry carrying estate produce through Karnataka traffic",
    icon: Truck,
    tint: "text-violet-200",
  },
]

export const seasonChainCaption =
  "One Coorg estate, one season, typed in as the days went by. These are its own numbers, not a demo."

/* ── The vocabulary ───────────────────────────────────────────────────────── */

export const estateVocabulary = [
  {
    term: "Arabica and Robusta, kept apart",
    detail:
      "Different blocks, different pulping, different price. They stay separate the whole way down the page, because the average of the two answers nothing you would ask.",
    icon: Coffee,
  },
  {
    term: "Outturn",
    detail:
      "Cherry in, wet parchment out, dry weight off the yard. The ratio you get judged on, worked out the second you save the batch instead of in March.",
    icon: Scale,
  },
  {
    term: "The muster",
    detail:
      "The daily roll, marked the way your writer already marks it. A contract gang goes on as one crew with a headcount, never as twenty invented names.",
    icon: Users,
  },
  {
    term: "Dispatch to the curing works",
    detail:
      "What left your gate, beside what the curer's weighbridge said when it arrived. The gap between those two figures is usually the first thing worth arguing about.",
    icon: Truck,
  },
  {
    term: "Cost per kilo, by block",
    detail:
      "Shade lopping, spray rounds, manuring, picking. Each charged to the block it was spent on, because your blocks are not alike and the costing should stop pretending they are.",
    icon: Wallet,
  },
  {
    term: "Pepper and arecanut",
    detail:
      "Up the shade trees and down in the wet patches. Tracked and sold alongside the coffee, since on a Coorg estate it is all one piece of land anyway.",
    icon: Sprout,
  },
]

/* ── A working day ────────────────────────────────────────────────────────── */

export const workingDay = [
  {
    time: "6:40 AM",
    title: "The muster",
    detail:
      "Your writer marks who turned up and puts each gang on a job and a block. Contract crews go on by headcount in one line.",
  },
  {
    time: "11:15 AM",
    title: "Cherry weighed at the store",
    detail:
      "Bags come off the field and go on the scale. Each weighing is tagged to the block it was picked from.",
  },
  {
    time: "3:00 PM",
    title: "Pulping",
    detail:
      "Cherry into the pulper, wet parchment weighed out the other side. Your outturn for the day is on screen before the yard is swept.",
  },
  {
    time: "5:30 PM",
    title: "Two bags of fertiliser issued",
    detail:
      "Out of the store and on to Block 4B. That cost sits on 4B alone and never gets smeared across the estate.",
  },
  {
    time: "Friday",
    title: "Lorry leaves for the curing works",
    detail:
      "Bag count and weight recorded at the gate. It stays on your books as stock until the weighbridge slip returns.",
  },
  {
    time: "Monday, 6 AM",
    title: "The week comes back to you",
    detail:
      "Outturn, wage bill, cost per kilo and anything that looked off, in your inbox before you are out of bed.",
  },
]

/* ── The Monday brief ─────────────────────────────────────────────────────── */

export const sampleDigest = {
  tag: "Sample brief",
  subject: "Your estate, week of 8 September",
  lines: [
    {
      label: "Outturn",
      value: "26.4%",
      detail: "against 27.9% season to date. Worth a look at the pulper setting.",
      tone: "warn" as const,
    },
    {
      label: "Wage bill",
      value: "₹1,84,200",
      detail: "across 412 muster days, 6% above the same week last season.",
      tone: "warn" as const,
    },
    {
      label: "Cost per kg of parchment",
      value: "₹142",
      detail: "season to date, steady for three weeks.",
      tone: "ok" as const,
    },
    {
      label: "Rain",
      value: "38 mm",
      detail: "over three days. Two drying days lost on the yard.",
      tone: "ok" as const,
    },
    {
      label: "Arabica",
      value: "3 month high",
      detail: "and you are holding 11,400 kg of parchment unsold.",
      tone: "good" as const,
    },
  ],
  signoff: "Three things worth doing this week are at the bottom of every brief.",
}

export const advisorCards = [
  {
    title: "Market timing",
    detail:
      "Benchmark coffee prices come in daily and get set against the parchment you still hold. A three month high reaches you before your buyer's phone call does.",
    icon: TrendingUp,
    accent: "border-emerald-400/20 bg-emerald-400/[0.05]",
    iconAccent: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200",
  },
  {
    title: "Ask it about your own estate",
    detail:
      "Type the question the way you would say it out loud. \"Why did cost per kilo jump in July?\" It answers off your own records and shows the rows it read.",
    icon: Brain,
    accent: "border-sky-400/20 bg-sky-400/[0.05]",
    iconAccent: "border-sky-300/20 bg-sky-300/[0.08] text-sky-200",
  },
  {
    title: "Things that look wrong",
    detail:
      "A wage bill well over last season's same week. An outturn under your own average. Those get called out in the brief instead of waiting for you to notice.",
    icon: AlertTriangle,
    accent: "border-amber-400/20 bg-amber-400/[0.05]",
    iconAccent: "border-amber-300/20 bg-amber-300/[0.08] text-amber-200",
  },
]

/* ── Getting started ──────────────────────────────────────────────────────── */

export const setupSteps = [
  {
    step: "01",
    title: "Draw the estate",
    detail:
      "Name your blocks and their acreage, your store, and the people on the roll. Eighty activity codes for lopping, manuring, picking and spraying are already loaded, so there is nothing to invent first.",
  },
  {
    step: "02",
    title: "Hand a login to your writer",
    detail:
      "One account for whoever marks the muster. They carry on exactly as they do now, on paper first if they like, then put it in before the day ends.",
  },
  {
    step: "03",
    title: "Let the season add itself up",
    detail:
      "Outturn, wage bill, cost per kilo, what each block returned. Ready on the day you ask for it rather than rebuilt out of registers in May.",
  },
]

/* ── What is in the box ───────────────────────────────────────────────────── */

export const coreSurfacePills = [
  "Cherry intake",
  "Pulping records",
  "Drying and parchment",
  "Dispatch",
  "Sales",
  "The muster",
  "Wages and payroll",
  "Store and issues",
  "Cost per block",
  "Season P&L",
  "Pepper and arecanut",
  "Rainfall",
  "Weather",
  "Weekly brief",
  "Market prices",
]

/* ── Plans ────────────────────────────────────────────────────────────────── */

export const planBadges: Record<string, string> = {
  basic: "The field book",
  core: "Most estates start here",
  enterprise: "Everything",
}

export const planPrices: Record<string, { price: string; note: string }> = {
  basic: { price: "₹1,299", note: "/month" },
  core: { price: "₹3,499", note: "/month" },
  enterprise: { price: "Custom", note: "" },
}

/* ── Questions people actually ask ────────────────────────────────────────── */

export const faqs = [
  {
    question: "My writer is not comfortable in English.",
    answer:
      "The app runs in Kannada and Tamil as well as English, and each person picks their own language on their own login. On the muster screen it is mostly names and numbers in any case.",
  },
  {
    question: "Half my estate has no signal.",
    answer:
      "Entries made in a dead patch sit on the phone and go up by themselves the moment a bar appears. Your writer does not have to remember to do anything, and nothing is lost walking back to the office.",
  },
  {
    question: "We keep registers already. Do we stop?",
    answer:
      "Keep them as long as you want to. Most estates run both through one season, find they have stopped opening the register, and let it go on their own. Nothing here asks you to throw the books out on day one.",
  },
  {
    question: "Can I take my data out?",
    answer:
      "Any of it, any time, as CSV or PDF, at no charge. It is your estate's record of its own season and it should never be held hostage by a subscription.",
  },
  {
    question: "Who else can see my numbers?",
    answer:
      "Nobody outside your estate. Isolation is enforced in the database itself, not just by careful queries, so another estate cannot read your rows even by mistake. Inside your estate you decide which screens each person gets.",
  },
  {
    question: "What happens when the 30 days are up?",
    answer:
      "You get an email before it ends. Nothing is deleted, no card is charged, and you decide then whether to carry on. If you walk away, your export still works.",
  },
]

/* ── Closing ──────────────────────────────────────────────────────────────── */

export const closingProof = [
  { label: "No card to sign up", icon: CheckCircle2 },
  { label: "No sales call", icon: Mail },
  { label: "Export everything, always", icon: FileSpreadsheet },
]
