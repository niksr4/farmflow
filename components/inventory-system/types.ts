export interface LocationOption {
  id: string
  name: string
  code?: string | null
}

export interface WorkspaceBootstrapPayload {
  modules: string[] | null
  locations: LocationOption[]
  planId?: string | null
  plans?: import("@/lib/modules").ModuleBundle[]
}

export interface IntelligenceCodePattern {
  code: string
  reference: string
  totalAmount: number
  entryCount: number
}

export interface IntelligenceDayPattern {
  date: string
  totalAmount: number
  entryCount: number
}

export interface IntelligenceBrief {
  dateRange: {
    startDate: string
    endDate: string
  }
  generatedAt: string
  highlights: string[]
  actions: Array<{
    label: string
    tab: string
  }>
  reconciliation: {
    totalReceivedKgs: number
    totalSoldKgs: number
    saleableKgs: number
    overdrawnKgs: number
    overdrawnSlots: Array<{
      coffeeType: string
      bagType: string
      overdrawnKgs: number
    }>
  } | null
  accountsPatterns: {
    totalLabor: number
    totalExpenses: number
    totalSpend: number
    laborSharePct: number
    expenseSharePct: number
    topCostCodes: IntelligenceCodePattern[]
    mostFrequentCodes: IntelligenceCodePattern[]
    highestLaborDays: IntelligenceDayPattern[]
    highestExpenseDays: IntelligenceDayPattern[]
    laborTrendPct: number | null
    expenseTrendPct: number | null
  } | null
}

export interface ExceptionSummaryAlert {
  id: string
  title: string
  severity: "low" | "medium" | "high" | "critical"
  location?: string
  coffeeType?: string
  metric?: string
}
