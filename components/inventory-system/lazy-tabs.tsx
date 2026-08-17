"use client"

import dynamic from "next/dynamic"

import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton"

/**
 * Lazily-loaded tab panels for the dashboard shell.
 *
 * Every workspace tab is code-split: a tenant on the basic plan never downloads the curing,
 * quality or receivables bundles. Keeping the whole set here rather than inline in
 * inventory-system.tsx keeps ~90 lines of boilerplate out of a file that is already far past
 * the 1000-line target, and gives one obvious place to add a tab.
 *
 * `ssr: false` throughout — these panels read browser-only state (window size, service worker,
 * IndexedDB) and rendering them on the server only to discard the markup costs time to first
 * byte for no benefit.
 */

function TabPanelLoading({ label: _label }: { label: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={6} cols={4} className="rounded-2xl border border-stone-100 bg-white" />
    </div>
  )
}

const AiAnalysisCharts = dynamic(() => import("@/components/ai-analysis-charts"), {
  loading: () => <TabPanelLoading label="AI analysis" />,
})
const AccountsPage = dynamic(() => import("@/components/accounts-page"), {
  loading: () => <TabPanelLoading label="Accounts" />,
})
const AttendanceWorkspace = dynamic(() => import("@/components/attendance-workspace"), {
  loading: () => <TabPanelLoading label="Muster" />,
})
const PickingLogTab = dynamic(() => import("@/components/picking-log-tab"), {
  loading: () => <TabPanelLoading label="Picking Log" />,
})
const ActivityLogTab = dynamic(() => import("@/components/activity-log-tab"), {
  loading: () => <TabPanelLoading label="Activity log" />,
})
const DispatchTab = dynamic(() => import("@/components/dispatch-tab"), {
  loading: () => <TabPanelLoading label="Dispatch" />,
})
const ProcessingTab = dynamic(() => import("@/components/processing-tab"), {
  loading: () => <TabPanelLoading label="Pulping" />,
})
const RainfallWeatherTab = dynamic(() => import("@/components/rainfall-weather-tab"), {
  loading: () => <TabPanelLoading label="Rainfall and weather" />,
})
const SalesTab = dynamic(() => import("@/components/sales-tab"), {
  loading: () => <TabPanelLoading label="Sales" />,
})
const NewsTab = dynamic(() => import("@/components/news-tab"), {
  loading: () => <TabPanelLoading label="News" />,
})
const MarketPricingTab = dynamic(() => import("@/components/market-pricing-tab"), {
  loading: () => <TabPanelLoading label="Market pricing" />,
})
const ComplianceTab = dynamic(() => import("@/components/compliance-tab"), {
  loading: () => <TabPanelLoading label="Compliance" />,
})
const SeasonDashboard = dynamic(() => import("@/components/season-dashboard"), {
  loading: () => <TabPanelLoading label="Season view" />,
})
const CuringTab = dynamic(() => import("@/components/curing-tab"), {
  loading: () => <TabPanelLoading label="Curing" />,
})
const QualityGradingTab = dynamic(() => import("@/components/quality-grading-tab"), {
  loading: () => <TabPanelLoading label="Quality" />,
})
const BillingTab = dynamic(() => import("@/components/billing-tab"), {
  loading: () => <TabPanelLoading label="Billing" />,
})
const ReceivablesTab = dynamic(() => import("@/components/receivables-tab"), {
  loading: () => <TabPanelLoading label="Receivables" />,
})
const BalanceSheetTab = dynamic(() => import("@/components/balance-sheet-tab"), {
  loading: () => <TabPanelLoading label="Balance sheet" />,
})
const SeasonPlTab = dynamic(() => import("@/components/season-pl-tab"), {
  loading: () => <TabPanelLoading label="P&L" />,
})
const JournalTab = dynamic(() => import("@/components/journal-tab"), {
  loading: () => <TabPanelLoading label="Journal" />,
})
const ResourcesTab = dynamic(() => import("@/components/resources-tab"), {
  loading: () => <TabPanelLoading label="Resources" />,
})
const PlantHealthTab = dynamic(() => import("@/components/plant-health-tab"), {
  loading: () => <TabPanelLoading label="Plant health" />,
})
const DocumentsTab = dynamic(() => import("@/components/documents-tab"), {
  loading: () => <TabPanelLoading label="Documents" />,
})
const YieldForecastTab = dynamic(() => import("@/components/yield-forecast-tab"), {
  loading: () => <TabPanelLoading label="Yield forecast" />,
})
const PepperTab = dynamic(() => import("@/components/pepper-tab").then((module) => module.PepperTab), {
  loading: () => <TabPanelLoading label="Pepper processing" />,
})
const MorningBriefCard = dynamic(() => import("@/components/morning-brief-card"), { ssr: false })
const WorkspaceLauncher = dynamic(() => import("@/components/workspace-launcher"), { ssr: false })
const InventoryDialogs = dynamic(() => import("@/components/inventory-dialogs"), { ssr: false })

export {
  AiAnalysisCharts,
  AccountsPage,
  AttendanceWorkspace,
  ActivityLogTab,
  PickingLogTab,
  DispatchTab,
  ProcessingTab,
  RainfallWeatherTab,
  SalesTab,
  NewsTab,
  MarketPricingTab,
  ComplianceTab,
  SeasonDashboard,
  CuringTab,
  QualityGradingTab,
  BillingTab,
  ReceivablesTab,
  BalanceSheetTab,
  SeasonPlTab,
  JournalTab,
  ResourcesTab,
  PlantHealthTab,
  DocumentsTab,
  YieldForecastTab,
  PepperTab,
  MorningBriefCard,
  WorkspaceLauncher,
  InventoryDialogs,
}
