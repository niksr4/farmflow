import type React from "react"
import { BarChart3, BookOpen, Brain, Check, CheckCircle2, CloudRain, CreditCard, Factory, FileText, History, Leaf, LineChart, List, Newspaper, NotebookPen, Receipt, Scale, Sprout, TrendingUp, Truck, Users, Wheat } from "lucide-react"

export type DashboardTabItem = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  subtabs?: string[]
}

export type DashboardTabItemsInput = {
  // operations
  canShowAttendance: boolean
  canShowAccounts: boolean
  canShowPicking: boolean
  canShowProcessingWorkspace: boolean
  processingWorkspaceLabel: string
  processingWorkspaceIcon: React.ComponentType<{ className?: string }>
  canShowProcessing: boolean
  canShowPepper: boolean
  canShowCuring: boolean
  canShowQuality: boolean
  canShowDispatch: boolean
  canShowSalesWorkspace: boolean
  canShowSales: boolean
  canShowOtherSales: boolean
  canShowInventoryWorkspace: boolean
  showTransactionHistory: boolean
  canShowRainfallSection: boolean
  canShowRainfall: boolean
  canShowWeather: boolean
  // insights (financial reports + reference/analysis)
  canShowBalanceSheet: boolean
  canShowSeasonPl: boolean
  canShowReceivables: boolean
  canShowBilling: boolean
  canShowSeason: boolean
  canShowYieldForecast: boolean
  canShowPlantHealth: boolean
  canShowAiAnalysis: boolean
  canShowNews: boolean
  canShowDocuments: boolean
  canShowJournal: boolean
  canShowResources: boolean
  canShowActivityLog: boolean
}

/**
 * Builds the two grouped navigation lists (operations / insights) from the tenant's
 * enabled modules. Pure so it can be unit-tested and keeps the shell lean.
 */
export function buildDashboardTabItems(input: DashboardTabItemsInput): {
  operations: DashboardTabItem[]
  insights: DashboardTabItem[]
} {
  const compact = (items: Array<DashboardTabItem | null>) => items.filter(Boolean) as DashboardTabItem[]

  const operations = compact([
    input.canShowAttendance ? { value: "attendance", label: "Muster", icon: Check } : null,
    input.canShowAccounts
      ? {
          value: "accounts",
          // "Costs" everywhere. The desktop rail and the phone's bottom nav were reconciled
          // earlier today; this tab strip was the third surface naming the same tab, and it is
          // the one a mobile user actually reads while standing in the roll.
          label: "Costs",
          icon: Users,
          subtabs: ["Daily Labour", "Non-Labour Expenses", "Cost Codes"],
        }
      : null,
    input.canShowPicking ? { value: "picking", label: "Picking Log", icon: Wheat } : null,
    input.canShowProcessingWorkspace
      ? {
          value: "processing",
          label: input.processingWorkspaceLabel,
          icon: input.processingWorkspaceIcon,
          subtabs: [
            input.canShowProcessing && "Coffee Pulping",
            input.canShowPepper && "Pepper Processing",
          ].filter(Boolean) as string[],
        }
      : null,
    input.canShowCuring ? { value: "curing", label: "Curing & Drying", icon: Factory } : null,
    input.canShowQuality ? { value: "quality", label: "Quality Grading", icon: CheckCircle2 } : null,
    input.canShowDispatch ? { value: "dispatch", label: "Dispatch", icon: Truck } : null,
    input.canShowSalesWorkspace
      ? {
          value: "sales",
          label: "Sales",
          icon: TrendingUp,
          subtabs:
            input.canShowSales && input.canShowOtherSales
              ? ["Coffee Sales", "Other Sales"]
              : input.canShowSales
                ? ["Coffee Sales"]
                : ["Other Sales"],
        }
      : null,
    // Inventory handles stock movement and sits with the core operations tabs.
    input.canShowInventoryWorkspace
      ? {
          value: "inventory",
          label: "Stock & Inventory",
          icon: List,
          subtabs: input.showTransactionHistory ? ["Stock Levels", "Transaction History"] : ["Stock Levels"],
        }
      : null,
    input.canShowRainfallSection
      ? {
          value: "rainfall",
          label: "Rain & Weather",
          icon: CloudRain,
          subtabs:
            input.canShowRainfall && input.canShowWeather
              ? ["Rainfall Logs", "Forecast"]
              : input.canShowWeather
                ? ["Forecast", "Estate Coordinates"]
                : ["Rainfall Logs"],
        }
      : null,
  ])

  const insights = compact([
    input.canShowBalanceSheet ? { value: "balance-sheet", label: "Live Balance", icon: Scale } : null,
    input.canShowSeasonPl ? { value: "season-pl", label: "P&L Report", icon: LineChart } : null,
    input.canShowReceivables ? { value: "receivables", label: "Receivables", icon: Receipt } : null,
    input.canShowBilling ? { value: "billing", label: "Billing", icon: CreditCard } : null,
    input.canShowSeason ? { value: "season", label: "Season Summary", icon: BarChart3 } : null,
    input.canShowYieldForecast ? { value: "yield-forecast", label: "Harvest Forecast", icon: Sprout } : null,
    input.canShowPlantHealth ? { value: "plant-health", label: "Crop Health", icon: Leaf } : null,
    input.canShowAiAnalysis ? { value: "ai-analysis", label: "AI Insights", icon: Brain } : null,
    input.canShowNews ? { value: "news", label: "Market News", icon: Newspaper } : null,
    input.canShowDocuments ? { value: "documents", label: "Documents", icon: FileText } : null,
    input.canShowJournal ? { value: "journal", label: "Journal", icon: NotebookPen } : null,
    input.canShowResources ? { value: "resources", label: "Resources", icon: BookOpen } : null,
    input.canShowActivityLog ? { value: "activity-log", label: "Audit Log", icon: History } : null,
  ])

  return { operations, insights }
}
