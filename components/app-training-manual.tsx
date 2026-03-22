import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  CloudRain,
  Factory,
  FileText,
  LayoutDashboard,
  Leaf,
  NotebookPen,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const quickJumpSections = [
  { id: "start-here", label: "Start here" },
  { id: "where-to-go", label: "Where do I click?" },
  { id: "daily-routines", label: "Daily routines" },
  { id: "tab-manuals", label: "Every tab" },
  { id: "glossary", label: "Plain words" },
]

const startHereSteps = [
  {
    title: "Finish Welcome Setup first",
    detail: "Set your estate name, first location, and plan. Do not skip this. It decides where your first records go.",
  },
  {
    title: "Use Dashboard to see what needs attention",
    detail: "Dashboard is the summary screen. It is for checking status, not for entering every type of record.",
  },
  {
    title: "If stock changed physically, use Operations",
    detail: "Inventory, Pulping, Dispatch, Sales, Curing, and Quality are for things that happened to actual crop or goods.",
  },
  {
    title: "If money changed, use Finance",
    detail: "Accounts, Receivables, Billing, and Balance Sheet are for labor, expenses, invoices, money due, and owner reporting.",
  },
  {
    title: "If you are reviewing trends, use Insights",
    detail: "Season, Yield Forecast, Rainfall, Plant Health, AI Analysis, and News are for understanding the business, not creating the base records.",
  },
  {
    title: "When in doubt, record the simple truth",
    detail: "Enter the real date, correct location, and best available quantity first. Clean, basic records beat detailed but wrong records.",
  },
]

const decisionRules = [
  {
    title: "Coffee or stock moved",
    answer: "Go to Operations. Start with Inventory, Pulping, Dispatch, or Sales depending on what actually happened.",
  },
  {
    title: "Money was spent, paid, billed, or collected",
    answer: "Go to Finance. Start with Accounts, Billing, or Receivables.",
  },
  {
    title: "You need proof, notes, or paperwork",
    answer: "Use Documents for files and Journal for simple written notes.",
  },
  {
    title: "You want trends, forecasts, weather, or crop health",
    answer: "Go to Insights. These tabs help you understand the operation after the base records are already in.",
  },
  {
    title: "You need to add users or change what people can see",
    answer: "Go to Settings or the owner/admin console. Do not try to solve permissions from inside the data tabs.",
  },
]

const dailyRoutines = [
  {
    title: "First-time admin",
    steps: [
      "Finish welcome setup.",
      "Add locations and check user access.",
      "Log the first real pulping or inventory record.",
      "Confirm the dashboard numbers changed the way you expected.",
    ],
  },
  {
    title: "Estate supervisor",
    steps: [
      "Open Dashboard and see what is waiting.",
      "Record pulping, curing, quality, dispatch, or sales as the day happens.",
      "Add Journal notes or Documents if there is proof or context to keep.",
      "Check that stock in FarmFlow still matches stock in the estate.",
    ],
  },
  {
    title: "Finance/admin operator",
    steps: [
      "Record labor, expenses, and attendance in Accounts.",
      "Raise invoices in Billing when needed.",
      "Track unpaid money in Receivables.",
      "Use Balance Sheet as a management summary, not as the first place to enter data.",
    ],
  },
  {
    title: "Owner review",
    steps: [
      "Look at Dashboard first for the fast picture.",
      "Check Finance for money position.",
      "Use Season, Yield Forecast, Rainfall, and AI Analysis for trend review.",
      "Use admin pages for tenants, access, and system health only if you are the platform owner.",
    ],
  },
]

type ManualItem = {
  name: string
  whatItIs: string
  openItWhen: string
  doneLooksLike: string
}

const manualGroups: Array<{
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badgeClassName: string
  items: ManualItem[]
}> = [
  {
    id: "core",
    title: "Core workspace",
    description: "The screens almost every user will touch.",
    icon: LayoutDashboard,
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    items: [
      {
        name: "Dashboard",
        whatItIs: "The main summary screen. It shows what is happening and what needs attention.",
        openItWhen: "You are starting the day, checking progress, or trying to find the next action.",
        doneLooksLike: "You know which area needs work next and you can move into the right module fast.",
      },
      {
        name: "Welcome Setup",
        whatItIs: "The first-run setup for estate basics like name, location, language, and plan.",
        openItWhen: "You are setting up a new workspace or finishing onboarding.",
        doneLooksLike: "Your estate basics are saved and users can start entering live records.",
      },
      {
        name: "Settings and Users",
        whatItIs: "User access, workspace settings, and module control.",
        openItWhen: "Someone needs access, permissions changed, or the workspace setup needs adjusting.",
        doneLooksLike: "The right people have the right access and the workspace matches how the estate works.",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    description: "Use these tabs when crop, lots, or stock physically move.",
    icon: Factory,
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    items: [
      {
        name: "Inventory",
        whatItIs: "Your stock book. It tracks what you have and where it is.",
        openItWhen: "Stock is added, moved, counted, corrected, or reviewed against transaction history.",
        doneLooksLike: "FarmFlow stock matches the real estate stock closely enough to trust decisions.",
      },
      {
        name: "Pulping",
        whatItIs: "The coffee post-harvest tab for cherry intake, pulping, and output tracking.",
        openItWhen: "Cherry intake, pulping, fermentation, drying progress, or output lot creation happens.",
        doneLooksLike: "Each coffee lot has date, quantity, location, and traceable output.",
      },
      {
        name: "Curing",
        whatItIs: "Later-stage dry mill or conditioning work after processing.",
        openItWhen: "Coffee moves through curing, final preparation, or conditioning.",
        doneLooksLike: "The lot is traceable from processed stock into ready-for-sale form.",
      },
      {
        name: "Quality",
        whatItIs: "Grading and quality review for lots.",
        openItWhen: "You are checking grade, defects, or readiness before selling or dispatching.",
        doneLooksLike: "Each important lot has quality notes that can support commercial decisions.",
      },
      {
        name: "Dispatch",
        whatItIs: "Records for stock leaving a location, store, or estate.",
        openItWhen: "Bags are loaded, transferred, or sent out to a buyer or another point.",
        doneLooksLike: "You know what left, when it left, from where, and where it went.",
      },
      {
        name: "Sales",
        whatItIs: "Commercial sale records tied to what was sold and for how much.",
        openItWhen: "A dispatch becomes a sale or any product is sold for revenue.",
        doneLooksLike: "Revenue, sold quantities, and buyer-facing records line up with dispatch and stock.",
      },
      {
        name: "Pepper Processing",
        whatItIs: "A sub-tab inside Pulping for pepper picking and green-to-dry conversion.",
        openItWhen: "Pepper harvest and drying need tracking without opening a separate main tab.",
        doneLooksLike: "Pepper stays visible for the team without mixing into coffee pulping records.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    description: "Use these tabs when labor, expenses, invoices, or money due need control.",
    icon: Scale,
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
    items: [
      {
        name: "Accounts",
        whatItIs: "Labor, other expenses, attendance, and activity codes.",
        openItWhen: "People worked, money was spent, or you need to maintain accounting categories.",
        doneLooksLike: "Costs are captured with enough detail to explain the season and labor use.",
      },
      {
        name: "Balance Sheet",
        whatItIs: "A management summary of the financial position.",
        openItWhen: "You want the owner view of assets, liabilities, and position.",
        doneLooksLike: "You understand the financial snapshot without using this tab as the raw data entry screen.",
      },
      {
        name: "Receivables",
        whatItIs: "A list of money customers still owe you.",
        openItWhen: "Invoices are unpaid and you need follow-up visibility.",
        doneLooksLike: "Outstanding amounts are current and collections are easier to manage.",
      },
      {
        name: "Billing",
        whatItIs: "Invoice and billing workflow.",
        openItWhen: "You need to issue bills, track billing records, or align invoicing with sales.",
        doneLooksLike: "Billing documents match the commercial reality and are easy to follow up.",
      },
    ],
  },
  {
    id: "insights",
    title: "Insights and records",
    description: "Use these tabs to explain, review, or support the operation after the base records exist.",
    icon: BarChart3,
    badgeClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
    items: [
      {
        name: "Season View",
        whatItIs: "A season scoreboard that pulls together operational patterns.",
        openItWhen: "You want to review overall progress and compare how the season is moving.",
        doneLooksLike: "You can explain where the season is strong, weak, or delayed.",
      },
      {
        name: "Yield Forecast",
        whatItIs: "A forward estimate of likely production.",
        openItWhen: "You have enough real data to project upcoming output.",
        doneLooksLike: "Forecasts are grounded in current season signals, not guesswork.",
      },
      {
        name: "Rainfall and Weather",
        whatItIs: "Climate context for field and production decisions.",
        openItWhen: "You are explaining flowering, ripening, disease pressure, or yield swings.",
        doneLooksLike: "Weather context helps explain what changed in the field or the factory.",
      },
      {
        name: "Documents",
        whatItIs: "A place to keep proof files like slips, receipts, or supporting paperwork.",
        openItWhen: "You need evidence attached to how the estate operated.",
        doneLooksLike: "Important documents are easy to find without searching outside FarmFlow.",
      },
      {
        name: "Journal",
        whatItIs: "A simple note log for events that matter but do not fit a stricter form.",
        openItWhen: "You need to record a decision, issue, visit, observation, or follow-up note.",
        doneLooksLike: "Context is captured in plain language so people remember why something happened.",
      },
      {
        name: "Resources",
        whatItIs: "The built-in library for field guides, training content, and references.",
        openItWhen: "A team needs training, a checklist, or visual guidance.",
        doneLooksLike: "Users can learn without needing a separate handbook outside the app.",
      },
      {
        name: "Plant Health",
        whatItIs: "Crop condition, disease, and health tracking.",
        openItWhen: "You need to record plant issues or review crop-health patterns.",
        doneLooksLike: "Plant-health notes are consistent enough to support field action.",
      },
      {
        name: "AI Analysis",
        whatItIs: "A narrative summary and recommendation layer.",
        openItWhen: "You want a faster read of patterns across operations and finance.",
        doneLooksLike: "It helps you ask better questions. It does not replace the source records.",
      },
      {
        name: "News",
        whatItIs: "Market or industry news reference.",
        openItWhen: "You want outside context around the market, not when entering estate records.",
        doneLooksLike: "The news informs decisions but does not distract from daily execution.",
      },
      {
        name: "Activity Log",
        whatItIs: "An audit trail of what changed and who changed it.",
        openItWhen: "You are troubleshooting edits, checking history, or validating accountability.",
        doneLooksLike: "You can explain important record changes without guessing.",
      },
    ],
  },
  {
    id: "admin",
    title: "Admin and platform controls",
    description: "These are control surfaces, not daily data-entry tabs.",
    icon: ShieldCheck,
    badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
    items: [
      {
        name: "Tenant admin",
        whatItIs: "Tenant-level control of modules, users, and setup choices.",
        openItWhen: "The estate needs a new user, changed permissions, or module updates.",
        doneLooksLike: "The workspace stays clean and people only see what they should use.",
      },
      {
        name: "Platform owner console",
        whatItIs: "Multi-tenant control for platform owners only.",
        openItWhen: "You run the whole platform, not just one estate.",
        doneLooksLike: "Tenants, health checks, seed data, and access stay manageable at platform level.",
      },
    ],
  },
]

const glossary = [
  {
    term: "Location",
    meaning: "A real place in your business, like an estate block, store, or processing point.",
  },
  {
    term: "Lot",
    meaning: "A traceable batch of product you want to keep separate from others.",
  },
  {
    term: "Dispatch",
    meaning: "Stock physically left one place and went somewhere else.",
  },
  {
    term: "Receivable",
    meaning: "Money a customer still owes you.",
  },
  {
    term: "Journal",
    meaning: "A simple note record for important context that does not need a complex form.",
  },
  {
    term: "Module",
    meaning: "One major area of the app, like Pulping, Accounts, or Rainfall.",
  },
]

export default function AppTrainingManual() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(207,238,228,0.85),transparent_28%),linear-gradient(180deg,#f8fbfa_0%,#eef5f2_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_35px_90px_-50px_rgba(14,93,82,0.45)]">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Beginner-friendly manual
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                Dashboard to admin
              </Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="font-display text-3xl text-slate-900">FarmFlow Training Manuals</CardTitle>
              <CardDescription className="max-w-3xl text-sm text-slate-600">
                Plain-language guidance for first-time users. This explains what each major area does, when to open it,
                and what a good record looks like.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-950">
              If you remember only one rule, remember this: when stock changes, use Operations. When money changes,
              use Finance. When you are only reviewing trends or health, use Insights.
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="bg-white">
                <Link href="/welcome">Open welcome setup</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/92">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">Quick jump</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {quickJumpSections.map((section) => (
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

        <Card id="start-here" className="scroll-mt-24 border-emerald-100 bg-white/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-4 w-4 text-emerald-700" />
              Start here
            </CardTitle>
            <CardDescription>These are the first things a new tenant admin should understand.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {startHereSteps.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Step {index + 1}</p>
                <p className="mt-1 font-semibold text-slate-900">{step.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="where-to-go" className="scroll-mt-24 border-slate-200 bg-white/95">
          <CardHeader>
            <CardTitle className="text-lg">Where do I click?</CardTitle>
            <CardDescription>Use these simple rules when you are confused about which tab to open.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {decisionRules.map((rule) => (
              <div key={rule.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{rule.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{rule.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div id="daily-routines" className="scroll-mt-24 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daily routines</h2>
            <p className="text-sm text-muted-foreground">Role-based cheat sheets for common users.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dailyRoutines.map((routine) => (
              <Card key={routine.title} className="border-slate-200 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-base">{routine.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                    {routine.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div id="tab-manuals" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Every major tab explained</h2>
            <p className="text-sm text-muted-foreground">
              Each card answers three beginner questions: what is it, when do I open it, and what does “done” look like?
            </p>
          </div>
          {manualGroups.map((group) => {
            const GroupIcon = group.icon
            return (
              <Card key={group.id} className="border-slate-200 bg-white/95">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={group.badgeClassName}>
                      <GroupIcon className="mr-1.5 h-3.5 w-3.5" />
                      {group.title}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{group.title}</CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        <span className="font-medium">What it is: </span>
                        {item.whatItIs}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-slate-700">Open it when: </span>
                        {item.openItWhen}
                      </p>
                      <p className="mt-1 text-sm text-emerald-700">
                        <span className="font-medium">Done looks like: </span>
                        {item.doneLooksLike}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card id="glossary" className="scroll-mt-24 border-slate-200 bg-white/95">
          <CardHeader>
            <CardTitle className="text-lg">Plain words</CardTitle>
            <CardDescription>Short definitions for terms users commonly trip over.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {glossary.map((entry) => (
              <div key={entry.term} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{entry.term}</p>
                <p className="mt-2 text-sm text-muted-foreground">{entry.meaning}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Final beginner rule
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-emerald-950">
            Do not try to use every tab on day one. Start with the few tabs that match your real work today, keep the
            records honest, and add more detail only after the team is comfortable.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
