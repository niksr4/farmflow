/**
 * Shapes the Accounts page reads.
 *
 * Moved out of components/accounts-page.tsx unchanged on 2026-09-21. Types only -- no runtime
 * code, so importing this cannot change behaviour.
 */

import type { LegacyAccountsExportFormat } from "@/lib/accounts-export"

export interface AccountActivity {
  code: string
  reference: string
  labor_count?: number
  expense_count?: number
  assignment_count?: number
}

export interface Activity {
  code: string
  reference: string
}

export interface ActivitySuggestion {
  code: string
  reference: string
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

export interface AccountsIntelligence {
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
  highlights: string[]
}

export type AccountsTabValue = "labour" | "expenses" | "activities" | "picking"
export type AccountsView = AccountsTabValue | "dashboard" | "export"

export type AccountsPageProps = {
  showDataToolsControls?: boolean // kept for API compatibility
  requestedExport?: { requestId: number; format: LegacyAccountsExportFormat } | null
  onRequestedExportHandled?: (requestId: number) => void
  initialTab?: AccountsTabValue
  showLaborManagement?: boolean
  showPickingLog?: boolean
}
