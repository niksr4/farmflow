import type React from "react"
import {
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  CloudRain,
  FileText,
  Factory,
  History,
  Leaf,
  List,
  Newspaper,
  NotebookPen,
  Receipt,
  Scale,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react"

export type DashboardTabItem = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  subtabs?: string[]
}

export type DashboardTabItemsInput = {
  // operations
  canShowProcessingWorkspace: boolean
  processingWorkspaceLabel: string
  processingWorkspaceIcon: React.ComponentType<{ className?: string }>
  canShowProcessing: boolean
  canShowPepper: boolean
  canShowRubber: boolean
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
  // finance
  canShowAccounts: boolean
  canShowBalanceSheet: boolean
  canShowSeasonPl: boolean
  canShowReceivables: boolean
  canShowBilling: boolean
  // insights
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
 * Builds the three grouped navigation lists (operations / finance / insights) from the
 * tenant's enabled modules. Pure so it can be unit-tested and keeps the shell lean.
 */
export function buildDashboardTabItems(input: DashboardTabItemsInput): {
  operations: DashboardTabItem[]
  finance: DashboardTabItem[]
  insights: DashboardTabItem[]
} {
  const compact = (items: Array<DashboardTabItem | null>) => items.filter(Boolean) as DashboardTabItem[]

  const operations = compact([
    input.canShowProcessingWorkspace
      ? {
          value: "processing",
          label: input.processingWorkspaceLabel,
          icon: input.processingWorkspaceIcon,
          subtabs: [
            input.canShowProcessing && "Coffee Pulping",
            input.canShowPepper && "Pepper Processing",
            input.canShowRubber && "Rubber Tapping",
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

  const finance = compact([
    input.canShowAccounts
      ? {
          value: "accounts",
          label: "Accounts",
          icon: Users,
          subtabs: ["Daily Labour", "Expenses", "Attendance", "Cost Codes"],
        }
      : null,
    input.canShowBalanceSheet ? { value: "balance-sheet", label: "Live Balance", icon: Scale } : null,
    input.canShowSeasonPl ? { value: "season-pl", label: "P&L Report", icon: TrendingUp } : null,
    input.canShowReceivables ? { value: "receivables", label: "Receivables", icon: Receipt } : null,
    input.canShowBilling ? { value: "billing", label: "Billing", icon: Receipt } : null,
  ])

  const insights = compact([
    input.canShowSeason ? { value: "season", label: "Season Summary", icon: BarChart3 } : null,
    input.canShowYieldForecast ? { value: "yield-forecast", label: "Harvest Forecast", icon: TrendingUp } : null,
    input.canShowPlantHealth ? { value: "plant-health", label: "Crop Health", icon: Leaf } : null,
    input.canShowAiAnalysis ? { value: "ai-analysis", label: "AI Insights", icon: Brain } : null,
    input.canShowNews ? { value: "news", label: "Market News", icon: Newspaper } : null,
    input.canShowDocuments ? { value: "documents", label: "Documents", icon: FileText } : null,
    input.canShowJournal ? { value: "journal", label: "Journal", icon: NotebookPen } : null,
    input.canShowResources ? { value: "resources", label: "Resources", icon: BookOpen } : null,
    input.canShowActivityLog ? { value: "activity-log", label: "Audit Log", icon: History } : null,
  ])

  return { operations, finance, insights }
}
