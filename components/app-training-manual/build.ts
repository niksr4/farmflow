import {
  BarChart3,
  Building2,
  Factory,
  LayoutDashboard,
  Layers2,
  Lock,
  Scale,
  Settings2,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react"

import type { TenantPlanId } from "@/lib/modules"

import type { AppTrainingManualProps, ManualGroup, ManualItem } from "./types"

/**
 * Which sections of the manual a given tenant actually sees.
 *
 * Every function here is pure — a tenant's enabled modules and role in, manual groups out — and
 * that is the whole reason they are worth having out of the component: what a writer is shown
 * versus what an owner is shown is a decision, and it was previously only observable by rendering
 * the page as four different users.
 *
 * Moved out of components/app-training-manual.tsx verbatim.
 */

export const toPlanLabel = (planId: TenantPlanId) => `${planId.slice(0, 1).toUpperCase()}${planId.slice(1)}`

export const compact = <T,>(items: Array<T | null | undefined | false>) => items.filter(Boolean) as T[]

export const unique = (items: string[]) => Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)))

export const joinReadableList = (items: string[]) => {
  const values = unique(items)
  if (values.length === 0) return ""
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`
}

export const hasModule = (enabledModules: string[], moduleId: string) => enabledModules.includes(moduleId)

export const isAdminOrOwnerRole = (userRole: AppTrainingManualProps["userRole"]) => userRole === "admin" || userRole === "owner"

export const getOperationsOverviewLabels = (enabledModules: string[]) =>
  compact([
    hasModule(enabledModules, "inventory") || hasModule(enabledModules, "transactions") ? "Stock & Inventory" : null,
    hasModule(enabledModules, "processing") ? "Processing" : null,
    hasModule(enabledModules, "dispatch") ? "Dispatch" : null,
    hasModule(enabledModules, "sales") ? "Sales" : null,
    hasModule(enabledModules, "other-sales") ? "Other Sales" : null,
    hasModule(enabledModules, "pepper") ? "Pepper Processing" : null,
    hasModule(enabledModules, "curing") ? "Curing & Drying" : null,
    hasModule(enabledModules, "quality") ? "Quality Grading" : null,
  ])

export const getFinanceEntryLabels = (enabledModules: string[]) =>
  compact([
    hasModule(enabledModules, "accounts") ? "Costs" : null,
    hasModule(enabledModules, "billing") ? "Billing" : null,
    hasModule(enabledModules, "receivables") ? "Receivables" : null,
    hasModule(enabledModules, "market-pricing") ? "Market Rates" : null,
  ])

export const getInsightLabels = (enabledModules: string[]) =>
  compact([
    hasModule(enabledModules, "season") ? "Season Summary" : null,
    // Harvest Forecast is the `yield-forecast` module, not `season` -- they are separate entries
    // in lib/modules.ts and separate tabs in the Insights nav. Gating it on `season` meant a
    // tenant with Season View but not Harvest Forecast read about a tab they do not have, and a
    // tenant with the reverse combination never saw it mentioned at all.
    hasModule(enabledModules, "yield-forecast") ? "Harvest Forecast" : null,
    hasModule(enabledModules, "plant-health") ? "Crop Health" : null,
    hasModule(enabledModules, "ai-analysis") ? "AI Insights" : null,
    hasModule(enabledModules, "news") ? "Market News" : null,
    hasModule(enabledModules, "compliance") ? "Compliance" : null,
  ])

export const getSupportLabels = (enabledModules: string[]) =>
  compact([
    hasModule(enabledModules, "documents") ? "Documents" : null,
    hasModule(enabledModules, "journal") ? "Journal" : null,
    hasModule(enabledModules, "resources") ? "Resources" : null,
  ])

export const buildStartHereSteps = (enabledModules: string[]) => {
  const operationsOverview = joinReadableList(getOperationsOverviewLabels(enabledModules))
  const hasClimate = hasModule(enabledModules, "rainfall") || hasModule(enabledModules, "weather")
  const financeEntries = joinReadableList(getFinanceEntryLabels(enabledModules))
  const insightsOverview = joinReadableList(getInsightLabels(enabledModules))
  const hasBalanceSheet = hasModule(enabledModules, "balance-sheet")
  const hasMarketPricing = hasModule(enabledModules, "market-pricing")

  return [
    {
      title: "Finish Welcome Setup first",
      detail: "Set your estate name, first location, and plan. Do not skip this. It decides where your first records go.",
    },
    {
      title: "Use the Workspace Navigator to find your way around",
      detail: "The home screen organises the workspace into three sections: Operations, Finance, and Reports. Operations and Finance hold the tabs where real records get entered; Reports is for reviewing trends once those records exist. Tap a section card to open it, or use the quick-action shortcuts to jump straight to a tab you use often.",
    },
    {
      title: "If stock changed physically, use Operations",
      detail: operationsOverview
        ? `${operationsOverview} are for things that happened to actual crop or goods.${hasClimate ? " Rain & Weather also lives in this section for quick reference, even though nothing physically moved there." : ""}`
        : "Operations tabs are for things that happened to actual crop or goods.",
    },
    {
      title: "If money changed, or you're checking a price, use Finance",
      detail: financeEntries
        ? `${financeEntries} are for labour, expenses, invoices, and money due.${hasMarketPricing ? " Market Rates is the exception, since it's for comparing buyer prices rather than recording a transaction." : ""}${hasBalanceSheet ? " Use Balance Sheet to review the summary after the source records are in." : ""}`
        : hasBalanceSheet
          ? "Balance Sheet is for review after the source records are in."
          : "Finance tabs are for labour, expenses, invoices, and money due.",
    },
    {
      title: "If you are reviewing trends, use Reports",
      detail: insightsOverview
        ? `${insightsOverview} help you understand the operation after the base records are already in.`
        : "Reports tabs help you understand the operation after the base records are already in.",
    },
    {
      title: "Configure Settings once, then leave it alone",
      detail: "Estate identity, locations, people, and module access all live in Settings. Most estates set it up once during onboarding and rarely touch it after. See \"Settings, step by step\" below for the recommended order.",
    },
    {
      title: "When in doubt, record the simple truth",
      detail: "Enter the real date, correct location, and best available quantity first. Clean, basic records beat detailed but wrong records.",
    },
  ]
}

export const buildDecisionRules = (
  enabledModules: string[],
  options: { isTailored: boolean; userRole: AppTrainingManualProps["userRole"] },
) => {
  const operationsEntryPoints = getOperationsOverviewLabels(enabledModules)
  const financeEntryPoints = compact([
    hasModule(enabledModules, "accounts") ? "Costs" : null,
    hasModule(enabledModules, "billing") ? "Billing" : null,
    hasModule(enabledModules, "receivables") ? "Receivables" : null,
  ])
  const supportAnswers = compact([
    hasModule(enabledModules, "documents") ? "Documents for files and supporting paperwork" : null,
    hasModule(enabledModules, "journal") ? "Journal for simple written notes" : null,
    hasModule(enabledModules, "resources") ? "Resources for training guides and references" : null,
  ])
  const insightLabels = getInsightLabels(enabledModules).filter((label) => label !== "Compliance")
  const settingsAnswer =
    options.isTailored && options.userRole !== "owner"
      ? "Go to Settings. The \"Settings, step by step\" section below walks through the right order. Do not try to solve permissions from inside the data tabs."
      : "Go to Settings or the owner/admin console. The \"Settings, step by step\" section below walks through the right order. Do not try to solve permissions from inside the data tabs."

  return compact([
    {
      title: "Coffee or stock moved",
      answer: `Go to Operations. Start with ${joinReadableList(operationsEntryPoints) || "the matching operations tab"} depending on what actually happened. Use Stock & Inventory only when adding new stock or correcting a count.`,
    },
    {
      title: "Money was spent, paid, billed, or collected",
      answer: `Go to Finance. Start with ${joinReadableList(financeEntryPoints) || "Costs"}.`,
    },
    hasModule(enabledModules, "market-pricing")
      ? {
          title: "You're about to sell and want to check buyer prices",
          answer: "Open Market Rates in Finance to compare recent buyer prices, or set a price alert, before you commit to a sale.",
        }
      : null,
    {
      title: "You need proof, notes, or paperwork",
      answer: supportAnswers.length
        ? `Use ${joinReadableList(supportAnswers)}.`
        : "Keep a simple note or supporting file with the work if those tabs are enabled in your workspace.",
    },
    {
      title: "You want trends, forecasts, weather, or crop health",
      answer: insightLabels.length
        ? `Go to Reports. Use ${joinReadableList(insightLabels)} after the base records are already in. Rain & Weather lives in Operations, not Reports.`
        : "Go to Reports after the base records are already in.",
    },
    hasModule(enabledModules, "compliance")
      ? {
          title: "A certification or audit deadline is coming up",
          answer: "Open Compliance in Reports to check certificate validity and close out anything on the checklist.",
        }
      : null,
    {
      title: "You need to add users or change what people can see",
      answer: settingsAnswer,
    },
  ])
}

export const buildDailyRoutines = (
  enabledModules: string[],
  options: { isTailored: boolean; userRole: AppTrainingManualProps["userRole"] },
) => {
  const supervisorActions = compact([
    hasModule(enabledModules, "processing") ? "Processing" : null,
    hasModule(enabledModules, "pepper") ? "Pepper Processing" : null,
    hasModule(enabledModules, "curing") ? "Curing & Drying" : null,
    hasModule(enabledModules, "quality") ? "Quality Grading" : null,
    hasModule(enabledModules, "dispatch") ? "Dispatch" : null,
    hasModule(enabledModules, "sales") ? "Sales" : null,
    hasModule(enabledModules, "other-sales") ? "Other Sales" : null,
  ])
  const supportActions = compact([
    hasModule(enabledModules, "journal") ? "Journal notes" : null,
    hasModule(enabledModules, "documents") ? "Documents" : null,
  ])
  const ownerInsightLabels = getInsightLabels(enabledModules)

  return [
    {
      title: "First-time admin",
      steps: compact([
        "Finish welcome setup.",
        "Add locations and check user access in Settings.",
        hasModule(enabledModules, "processing")
          ? "Log the first real pulping or inventory record."
          : hasModule(enabledModules, "inventory")
            ? "Log the first real inventory record."
            : "Log the first real record.",
        "Confirm the dashboard numbers changed the way you expected.",
      ]),
    },
    {
      title: "Estate supervisor",
      steps: compact([
        "Open Dashboard and see what is waiting.",
        supervisorActions.length ? `Record ${joinReadableList(supervisorActions)} as the day happens.` : null,
        supportActions.length ? `Add ${joinReadableList(supportActions)} if there is proof or context to keep.` : null,
        hasModule(enabledModules, "inventory")
          ? "Use Stock & Inventory when new stock arrives or a count needs correcting, not for every daily check."
          : null,
      ]),
    },
    {
      title: "Finance/admin operator",
      steps: compact([
        hasModule(enabledModules, "accounts") ? "Use the Record Labour or Record Expense shortcuts on the home screen to jump straight into Accounts, or open Accounts directly from the Finance section." : null,
        hasModule(enabledModules, "billing") ? "Raise invoices in Billing when needed." : null,
        hasModule(enabledModules, "receivables") ? "Track unpaid money in Receivables." : null,
        hasModule(enabledModules, "market-pricing") ? "Check Market Rates before agreeing a price with a buyer." : null,
        hasModule(enabledModules, "balance-sheet")
          ? "Use Balance Sheet as a management summary, not as the first place to enter data."
          : null,
      ]),
    },
    {
      title: "Owner review",
      steps: compact([
        "Look at Dashboard first for the fast picture.",
        hasModule(enabledModules, "accounts") || hasModule(enabledModules, "balance-sheet") ? "Check Finance for money position, including the P&L Report if Accounts is on." : null,
        ownerInsightLabels.length ? `Use ${joinReadableList(ownerInsightLabels)} for trend review.` : null,
        hasModule(enabledModules, "compliance") ? "Glance at Compliance for anything due soon." : null,
        options.isTailored && options.userRole !== "owner"
          ? "Use Settings for users, locations, and workspace setup changes."
          : "Use admin pages for tenants, access, and system health only if you are the platform owner.",
      ]),
    },
  ]
}

export const buildClimateManualItem = (enabledModules: string[]): ManualItem | null => {
  const hasRainfall = hasModule(enabledModules, "rainfall")
  const hasWeather = hasModule(enabledModules, "weather")

  if (!hasRainfall && !hasWeather) {
    return null
  }

  return {
    name: "Rain & Weather",
    whatItIs: hasRainfall && hasWeather
      ? "Climate context for field and production decisions: rainfall logs plus a short-range forecast, in one place inside Operations."
      : hasWeather
        ? "A short-range weather view for field and drying decisions, inside Operations."
        : "Rainfall logging for field and production decisions, inside Operations.",
    openItWhen: hasRainfall && hasWeather
      ? "You are explaining flowering, ripening, disease pressure, drying windows, or yield swings, or you need the next weather window before field work."
      : hasWeather
        ? "You need the next weather window before field work, drying, or dispatch."
        : "You are explaining flowering, ripening, disease pressure, or yield swings.",
    doneLooksLike: "Climate context helps explain what changed in the field or the factory. Nothing physically moved here, but it lives with the other Operations tabs for quick reference.",
  }
}

export const buildManualGroups = (
  enabledModules: string[],
  options: { isTailored: boolean; userRole: AppTrainingManualProps["userRole"] },
): ManualGroup[] => {
  const operationsItems = compact([
    hasModule(enabledModules, "inventory") || hasModule(enabledModules, "transactions")
      ? {
          name: "Stock & Inventory",
          whatItIs: "Your stock record. Current quantities live in Stock Levels; every in/out movement across locations is in the Transaction History subtab when it's turned on.",
          openItWhen: "Stock is being added, a quantity is wrong, or you need to trace exactly what moved and when.",
          doneLooksLike: "FarmFlow stock matches the real estate stock closely enough to trust decisions, and any movement can be traced in Transaction History.",
        }
      : null,
    hasModule(enabledModules, "processing")
      ? {
          name: "Processing",
          whatItIs: "The coffee post-harvest tab for cherry intake, pulping, and output tracking. When Pepper is enabled, it shares this same tab as an extra subtab (Pepper Processing) instead of opening a separate tab.",
          openItWhen: "Cherry intake, pulping, fermentation, drying progress, or output lot creation happens.",
          doneLooksLike: "Each coffee lot has date, quantity, location, and traceable output.",
        }
      : null,
    hasModule(enabledModules, "curing")
      ? {
          name: "Curing & Drying",
          whatItIs: "Drying-bed tracking for the stage right after pulping: intake, moisture drop, lot, and outturn.",
          openItWhen: "A batch is on the drying bed and you're tracking moisture loss toward a finished outturn.",
          doneLooksLike: "Each batch shows starting and ending moisture and the outturn it produced.",
        }
      : null,
    hasModule(enabledModules, "quality")
      ? {
          name: "Quality Grading",
          whatItIs: "Grade, screen size, defect counts, moisture, and sample weight recorded per lot.",
          openItWhen: "You are checking a lot's grade or defects before it is sold or dispatched.",
          doneLooksLike: "Each important lot has a grading record that can support a sale or dispatch decision.",
        }
      : null,
    hasModule(enabledModules, "dispatch")
      ? {
          name: "Dispatch",
          whatItIs: "Records for stock leaving a location, store, or estate.",
          openItWhen: "Bags are loaded, transferred, or sent out to a buyer or another point.",
          doneLooksLike: "You know what left, when it left, from where, and where it went.",
        }
      : null,
    hasModule(enabledModules, "sales") || hasModule(enabledModules, "other-sales")
      ? {
          name: "Sales",
          whatItIs: "Commercial sale records tied to what was sold and for how much. When Other Sales is enabled, non-coffee revenue (pepper, fruit, timber, side-products) shows as its own subtab in the same place, so it never mixes into coffee totals.",
          openItWhen: "A dispatch becomes a sale, or any product is sold for revenue.",
          doneLooksLike: "Revenue, sold quantities, and buyer-facing records line up with dispatch and stock, with coffee and non-coffee revenue kept separate.",
        }
      : null,
    hasModule(enabledModules, "pepper")
      ? {
          name: "Pepper Processing",
          whatItIs: "A subtab inside Processing for pepper picking and green-to-dry conversion.",
          openItWhen: "Pepper harvest and drying need tracking without opening a separate main tab.",
          doneLooksLike: "Pepper stays visible for the team without mixing into coffee pulping records.",
        }
      : null,
    buildClimateManualItem(enabledModules),
  ])

  const financeItems = compact([
    hasModule(enabledModules, "accounts")
      ? {
          name: "Costs",
          whatItIs: "Daily Labour, Expenses, Attendance, and Cost Codes always live here. Turn on Picking Log for piece-rate picking pay, or Labour Management for a full Worker Roster plus an advances/deductions Ledger and Payroll. Tap Cost Patterns for a spending analysis when you need it.",
          openItWhen: "People worked, money was spent, or you need to maintain accounting categories.",
          doneLooksLike: "Costs are captured with enough detail to explain the season and labour use. Cost Patterns shows where money is going without cluttering the entry view.",
        }
      : null,
    hasModule(enabledModules, "balance-sheet")
      ? {
          name: "Balance Sheet",
          whatItIs: "A management summary of the financial position, kept current as records are entered.",
          openItWhen: "You want the owner view of assets, liabilities, and position.",
          doneLooksLike: "You understand the financial snapshot and know where the underlying records come from.",
        }
      : null,
    hasModule(enabledModules, "accounts") && options.userRole !== "user"
      ? {
          name: "P&L Report",
          whatItIs: "A season profit-and-loss view that appears automatically for admins and owners once Accounts is enabled. There is no separate module toggle for it.",
          openItWhen: "You want season revenue set against season cost in one place, not just cost on its own.",
          doneLooksLike: "You can explain whether the season is ahead or behind on margin.",
        }
      : null,
    hasModule(enabledModules, "receivables")
      ? {
          name: "Receivables",
          whatItIs: "A list of money customers still owe you.",
          openItWhen: "Invoices are unpaid and you need follow-up visibility.",
          doneLooksLike: "Outstanding amounts are current and collections are easier to manage.",
        }
      : null,
    hasModule(enabledModules, "billing")
      ? {
          name: "Billing",
          whatItIs: "Invoice and billing workflow.",
          openItWhen: "You need to issue bills, track billing records, or align invoicing with sales.",
          doneLooksLike: "Billing documents match the commercial reality and are easy to follow up.",
        }
      : null,
    hasModule(enabledModules, "market-pricing")
      ? {
          name: "Market Rates",
          whatItIs: "A buyer directory (cooperative, trader, exporter, processor) with a price log by grade and variety, a price trend view, and an optional price alert.",
          openItWhen: "You are about to sell and want to compare buyer prices, or you want to be notified when the price crosses a level you care about.",
          doneLooksLike: "You can point to a specific buyer and price before agreeing to a sale, instead of relying on memory.",
        }
      : null,
  ])

  const insightItems = compact([
    hasModule(enabledModules, "season")
      ? {
          name: "Season Summary",
          whatItIs: "A season scoreboard that pulls together operational patterns.",
          openItWhen: "You want to review overall progress and compare how the season is moving.",
          doneLooksLike: "You can explain where the season is strong, weak, or delayed.",
        }
      : null,
    hasModule(enabledModules, "yield-forecast")
      ? {
          name: "Harvest Forecast",
          whatItIs: "A forward estimate of likely production.",
          openItWhen: "You have enough real data to project upcoming output.",
          doneLooksLike: "Forecasts are grounded in current season signals, not guesswork.",
        }
      : null,
    hasModule(enabledModules, "documents")
      ? {
          name: "Documents",
          whatItIs: "A place to keep proof files like slips, receipts, or supporting paperwork.",
          openItWhen: "You need evidence attached to how the estate operated.",
          doneLooksLike: "Important documents are easy to find without searching outside FarmFlow.",
        }
      : null,
    hasModule(enabledModules, "journal")
      ? {
          name: "Journal",
          whatItIs: "A simple note log for events that matter but do not fit a stricter form.",
          openItWhen: "You need to record a decision, issue, visit, observation, or follow-up note.",
          doneLooksLike: "Context is captured in plain language so people remember why something happened.",
        }
      : null,
    hasModule(enabledModules, "resources")
      ? {
          name: "Resources",
          whatItIs: "The built-in library for field guides, training content, and references.",
          openItWhen: "A team needs training, a checklist, or visual guidance.",
          doneLooksLike: "Users can learn without needing a separate handbook outside the app.",
        }
      : null,
    hasModule(enabledModules, "plant-health")
      ? {
          name: "Crop Health",
          whatItIs: "Crop condition, disease, and health tracking.",
          openItWhen: "You need to record plant issues or review crop-health patterns.",
          doneLooksLike: "Plant-health notes are consistent enough to support field action.",
        }
      : null,
    hasModule(enabledModules, "compliance")
      ? {
          name: "Compliance",
          whatItIs: "Certification records (organic, Rainforest Alliance, Fair Trade, and similar) with validity dates, plus a linked checklist of due tasks.",
          openItWhen: "A certification is due for renewal, an audit is coming up, or a checklist task needs closing out.",
          doneLooksLike: "Every active certification has a known expiry, and nothing on the checklist is silently overdue.",
        }
      : null,
    hasModule(enabledModules, "ai-analysis")
      ? {
          name: "AI Insights",
          whatItIs: "A narrative summary and recommendation layer.",
          openItWhen: "You want a faster read of patterns across operations and finance.",
          doneLooksLike: "It helps you ask better questions. It does not replace the source records.",
        }
      : null,
    hasModule(enabledModules, "news")
      ? {
          name: "Market News",
          whatItIs: "Market or industry news reference.",
          openItWhen: "You want outside context around the market, not when entering estate records.",
          doneLooksLike: "The news informs decisions but does not distract from daily execution.",
        }
      : null,
    {
      name: "Audit Log",
      whatItIs: "An audit trail of what changed and who changed it.",
      openItWhen: "You are troubleshooting edits, checking history, or validating accountability.",
      doneLooksLike: "You can explain important record changes without guessing.",
    },
  ])

  const adminItems = compact([
    {
      name: "Settings",
      whatItIs: "Estate setup, people, access, and reporting rules, organised into six groups. See \"Settings, step by step\" below for the full walkthrough of each one.",
      openItWhen: "The estate needs a new user, changed permissions, updated estate details, or module updates.",
      doneLooksLike: "The workspace stays clean and people only see what they should use.",
    },
    !options.isTailored || options.userRole === "owner"
      ? {
          name: "Owner Console",
          whatItIs: "Multi-tenant control for platform owners only.",
          openItWhen: "You run the whole platform, not just one estate.",
          doneLooksLike: "Tenants, health checks, seed data, and access stay manageable at platform level.",
        }
      : null,
  ])

  return compact([
    {
      id: "core",
      title: "Core workspace",
      description: "The screens almost every user will touch.",
      icon: LayoutDashboard,
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      items: [
        {
          name: "Workspace Navigator",
          whatItIs: "The home screen that organises the workspace into Operations, Finance, and Reports. Quick-action shortcuts let you jump straight to a tab you use often without navigating manually.",
          openItWhen: "You are starting a session, switching between sections, or want to use a quick shortcut.",
          doneLooksLike: "You reach the right tab in one or two taps from the home screen.",
        },
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
      ],
    },
    operationsItems.length
      ? {
          id: "operations",
          title: "Operations",
          description: "Use these tabs when crop, lots, or stock physically move. Rain & Weather also lives here for quick reference.",
          icon: Factory,
          badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
          items: operationsItems,
        }
      : null,
    financeItems.length
      ? {
          id: "finance",
          title: "Finance",
          description: "Use these tabs when labour, expenses, invoices, or money due need control, or when you're comparing buyer prices.",
          icon: Scale,
          badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
          items: financeItems,
        }
      : null,
    insightItems.length
      ? {
          id: "insights",
          title: "Reports",
          description: "Use these tabs to explain, review, or support the operation after the base records exist.",
          icon: BarChart3,
          badgeClassName: "border-cyan-200 bg-cyan-50 text-cyan-700",
          items: insightItems,
        }
      : null,
    adminItems.length
      ? {
          id: "admin",
          title: "Admin and owner controls",
          description: "Use these areas for settings, access, and oversight rather than daily record entry.",
          icon: ShieldCheck,
          badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
          items: adminItems,
        }
      : null,
  ])
}

export const buildSettingsManualGroups = (options: {
  isTailored: boolean
  userRole: AppTrainingManualProps["userRole"]
}): ManualGroup[] => {
  const showAdminGroups = !options.isTailored || isAdminOrOwnerRole(options.userRole)
  const showOwnerGroups = !options.isTailored || options.userRole === "owner"

  return compact([
    {
      id: "settings-profile",
      title: "Profile",
      description: "Your personal settings, separate from estate-wide configuration. Every signed-in user sees this group.",
      icon: UserCircle,
      badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
      items: [
        {
          name: "Digest Email",
          whatItIs: "The address that receives the weekly digest and operational alerts. It's your personal account email, and it is not visible to other users.",
          openItWhen: "You want alerts going to a different inbox, or you're setting one up for the first time.",
          doneLooksLike: "The address you actually check regularly is saved, and next week's digest lands there.",
        },
        {
          name: "Language",
          whatItIs: "Your personal display language for the app.",
          openItWhen: "You want the interface in a different language than the estate default.",
          doneLooksLike: "Menus and labels show in the language you picked.",
        },
        {
          name: "Account Security",
          whatItIs: "Change your login password.",
          openItWhen: "You want to update your password, or think it may have been shared.",
          doneLooksLike: "You can sign in again with the new password.",
        },
      ],
    },
    showAdminGroups
      ? {
          id: "settings-estate",
          title: "Estate",
          description: "Identity, footprint, dashboard defaults, and exception thresholds that shape how the workspace behaves. Visible to estate admins and owners.",
          icon: Building2,
          badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
          items: [
            {
              name: "Estate Identity",
              whatItIs: "The estate name shown in the dashboard header, exports, and buyer-facing documents.",
              openItWhen: "You are setting up for the first time, or the estate's public-facing name changed.",
              doneLooksLike: "The name your team and buyers already use matches what appears everywhere in FarmFlow.",
            },
            {
              name: "Estate Footprint & Weather",
              whatItIs: "Acreage for per-acre season reporting, plus exact latitude and longitude so Rain & Weather reflects your real location instead of a regional average.",
              openItWhen: "Season reporting needs a per-acre baseline, or the weather forecast looks off for your estate.",
              doneLooksLike: "Season views can report per-acre, and Rain & Weather is locked to the exact estate.",
            },
            {
              name: "Dashboard Preferences",
              whatItIs: "A toggle to hide empty, zero-value highlight cards on the dashboard.",
              openItWhen: "The dashboard feels cluttered with metrics that are always zero for your workspace.",
              doneLooksLike: "The dashboard only shows highlights that actually have something to say.",
            },
            {
              name: "Thresholds",
              whatItIs: "The exception thresholds and targets that decide when the dashboard flags something as unusual.",
              openItWhen: "You're getting alerts for things that are actually normal for your estate, or missing ones that matter.",
              doneLooksLike: "Alerts match what an experienced manager would actually flag.",
            },
          ],
        }
      : null,
    showAdminGroups
      ? {
          id: "settings-operations",
          title: "Operations (a Settings group, not the dashboard's Operations tabs)",
          description: "The live structures daily work depends on: labour wage defaults, locations for traceability, and import tools for bulk setup.",
          icon: Settings2,
          badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
          items: [
            {
              name: "Labour Wage Defaults",
              whatItIs: "Default in-house and outside worker wage rates that pre-fill new labour entries. Each entry can still be adjusted individually.",
              openItWhen: "Your standard day rates change, or you're setting up for the first time.",
              doneLooksLike: "New labour entries start with the right numbers already filled in, so you only adjust exceptions.",
            },
            {
              name: "Locations",
              whatItIs: "The estate blocks, stores, or processing points your team records against.",
              openItWhen: "Before the team starts entering daily work, or when the estate's physical footprint changes.",
              doneLooksLike: "Every real location your team uses has a matching entry here, with a short code for exports.",
            },
            {
              name: "Data Import",
              whatItIs: "CSV upload for backfilling history from paper records, Excel, or a previous system.",
              openItWhen: "You're onboarding and already have historical processing, dispatch, sales, pepper, rainfall, inventory, or accounts data to load in bulk.",
              doneLooksLike: "Historical records are in FarmFlow, and day-to-day entry moves to the normal tabs afterward.",
            },
          ],
        }
      : null,
    showAdminGroups
      ? {
          id: "settings-user-access",
          title: "User Access",
          description: "Who can enter data, who gets exceptions from tenant defaults, and which modules the estate is allowed to use.",
          icon: Users,
          badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
          items: compact([
            {
              name: "People and Roles",
              whatItIs: "Add estate users, set them as Estate Admin or Estate User, and remove access when someone leaves.",
              openItWhen: "Someone new joins the team, a role needs to change, or someone should lose access.",
              doneLooksLike: "Everyone who should have a login has one, with the right role, and no one who shouldn't still has one.",
            },
            {
              name: "Per-User Exceptions",
              whatItIs: "Give one specific person access different from the estate default. Meant to stay rare.",
              openItWhen: "One person genuinely needs to see, or not see, something the rest of the team doesn't.",
              doneLooksLike: "Only a few, well-understood exceptions exist, and most users stay on estate defaults.",
            },
            showOwnerGroups
              ? {
                  name: "Allowed Modules",
                  whatItIs: "The estate-wide ceiling on which modules are visible at all. Apply a plan bundle first, then fine-tune individual modules within it. Owner-only.",
                  openItWhen: "The estate's plan changed, or a specific module should be switched on or off for everyone.",
                  doneLooksLike: "Every user inherits sensible defaults, and only modules the estate actually uses are visible.",
                }
              : null,
          ]),
        }
      : null,
    {
      id: "settings-privacy",
      title: "Privacy",
      description: "Consent, export, correction, and deletion requests under India's DPDP Act. This group only appears if your workspace has DPDP privacy tools turned on.",
      icon: Lock,
      badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
      items: [
        {
          name: "Privacy & DPDP",
          whatItIs: "Accept the privacy notice, opt in or out of product updates, export your personal data, correct your username, or request deletion.",
          openItWhen: "You need to handle a personal-data request, or review your own consent status.",
          doneLooksLike: "Consent status is current, and any data-rights request has a clear paper trail.",
        },
      ],
    },
    showOwnerGroups
      ? {
          id: "settings-advanced",
          title: "Advanced",
          description: "Owner-only tools, experience tuning, and audit history. Tucked away unless you're deliberately changing platform behavior.",
          icon: Layers2,
          badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
          items: [
            {
              name: "Owner Tools",
              whatItIs: "Links to the platform-wide Owner Console and database inspection tools. For the platform owner, not estate admins.",
              openItWhen: "You need to manage another tenant or inspect platform-level data.",
              doneLooksLike: "Estate-level settings stay in this page; platform-wide changes happen from the Owner Console instead.",
            },
            {
              name: "Tenant Experience",
              whatItIs: "UI variant and feature-flag tuning for how this specific tenant's workspace behaves.",
              openItWhen: "A tenant needs a different layout profile, or an experimental feature toggled just for them.",
              doneLooksLike: "The tenant's experience matches what they actually need, and the change is deliberate, not accidental.",
            },
            {
              name: "Audit Log",
              whatItIs: "A searchable history of who changed what, filterable by record type.",
              openItWhen: "You're investigating a change, resolving a dispute about what happened, or doing a periodic access review.",
              doneLooksLike: "You can answer \"who changed this and when\" with real evidence, not guesswork.",
            },
          ],
        }
      : null,
  ])
}
