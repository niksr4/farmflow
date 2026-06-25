"use client"

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import {
  Check,
  Download,
  Upload,
  List,
  Home,
  LogOut,
  Edit,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  SortAsc,
  SortDesc,
  History,
  Brain,
  Loader2,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Newspaper,
  Truck,
  Users,
  Factory,
  Leaf,
  Droplets,
  NotebookPen,
  Receipt,
  Settings,
  Info,
  BookOpen,
  Scale,
  FileText,
  Coins,
  Sun,
  Moon,
  LifeBuoy,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BrandLoading } from "@/components/ui/brand-loading"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useStandaloneMode } from "@/hooks/use-standalone-mode"
import { useAuth } from "@/hooks/use-auth"
import { useTenantExperience } from "@/hooks/use-tenant-experience"
import { useRouter, useSearchParams } from "next/navigation"
import OnboardingChecklist, { type OnboardingStep } from "@/components/onboarding-checklist"
import HomeTab from "@/components/home-tab"
import UniversalSearch from "@/components/universal-search"
import Link from "next/link"
import Image from "next/image"
import { isWithinLast24Hours } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { type AccountsExportFormat } from "@/lib/accounts-export"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { getCurrentEstatePhase } from "@/lib/coffee-estate-calendar"
import { normalizeInventoryItemType } from "@/lib/inventory-item-type"
import { ASSISTANT_PROMPT_EVENT, type AssistantPromptEventDetail } from "@/lib/assistant-events"
import { getModuleDefaultEnabled } from "@/lib/modules"
import { appendOwnerPreviewContext, normalizeOwnerPreviewContext } from "@/lib/owner-preview"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import type { WorkspaceHintAction } from "@/lib/tenant-guidance"
import { cn } from "@/lib/utils"
import AppSidebar from "@/components/app-sidebar"
import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import { roleLabel } from "@/lib/roles"
import { buildHeroContent, type BuildHeroContentParams } from "@/lib/workspace-hero-content"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import {
  EXPORT_DATASETS,
  isExportDatasetId,
  TAB_DEFAULT_EXPORT_DATASET,
  type ExportDatasetId,
} from "@/lib/data-tools"
import {
  API_INVENTORY,
  API_TRANSACTIONS,
  DASHBOARD_LAUNCHER_TAB,
  DEFAULT_DASHBOARD_TAB_PRIORITY,
  DRILLDOWN_ALERT_ID_PARAM,
  DRILLDOWN_ALERT_METRIC_PARAM,
  DRILLDOWN_ITEM_PARAM,
  DRILLDOWN_TXN_SEARCH_PARAM,
  FARMFLOW_RECORD_SAVED_EVENT,
  LOCATION_ALL,
  LOCATION_UNASSIGNED,
  PREVIEW_TENANT_COOKIE,
  UNASSIGNED_LABEL,
} from "@/components/inventory-system/constants"
import type {
  DrilldownOptions,
  ExceptionSummaryAlert,
  HeroChip,
  HeroContent,
  HeroStat,
  IntelligenceBrief,
  LocationOption,
  SmartNextStep,
  WorkspaceBootstrapPayload,
} from "@/components/inventory-system/types"
import {
  buildTransactionDateFromInput,
  createDefaultTransaction,
  formatDate,
  getTodayDateInputValue,
  parseCustomDateString,
  parseJsonResponse,
  safeGet,
  transactionDateToInputValue,
} from "@/components/inventory-system/utils"
import { downloadDataToolsTemplate, exportOpsCsv, getDataToolsSelection } from "@/components/inventory-system/data-tools-export"
import RecordMovementPanel from "@/components/inventory-system/record-movement-panel"
import MobileSidebarDrawer from "@/components/inventory-system/mobile-sidebar-drawer"
import PreviewModeBanner from "@/components/inventory-system/preview-mode-banner"
import WelcomeCard from "@/components/inventory-system/welcome-card"
import DataToolsPanel from "@/components/inventory-system/data-tools-panel"
import WriteQueueCard from "@/components/inventory-system/write-queue-card"
import PlatformConsoleCard from "@/components/inventory-system/platform-console-card"
import TrialBanner from "@/components/inventory-system/trial-banner"
import SetupCompleteCard from "@/components/inventory-system/setup-complete-card"
import RecentActivityFeed from "@/components/inventory-system/recent-activity-feed"
import EstatePulseSection, { type EstatePulseData } from "@/components/inventory-system/estate-pulse-section"
import MobileHomeSection from "@/components/inventory-system/mobile-home-section"
import ExecutionScorecardCard from "@/components/inventory-system/execution-scorecard-card"
import EstateOverviewCard from "@/components/inventory-system/estate-overview-card"
import SmartInsightsCard from "@/components/inventory-system/smart-insights-card"
import InventoryWorkspaceBanner from "@/components/inventory-system/inventory-workspace-banner"
import WorkspaceHeader from "@/components/inventory-system/workspace-header"
import InventoryQuickActionsSidebar from "@/components/inventory-system/inventory-quick-actions-sidebar"
import InventorySystemAlerts from "@/components/inventory-system/inventory-system-alerts"
import ProcessingWorkspace from "@/components/inventory-system/processing-workspace"
import AiAnalysisCard from "@/components/inventory-system/ai-analysis-card"
import HomeNavCard from "@/components/inventory-system/home-nav-card"
import { useHeroTotals } from "@/hooks/use-hero-totals"
import SimpleMarkdown from "@/components/ui/simple-markdown"
import InventoryDrilldownPanel from "@/components/inventory-system/inventory-drilldown-panel"
import SeasonProgressStrip from "@/components/inventory-system/season-progress-strip"
import SeasonCompareCard from "@/components/inventory-system/season-compare-card"
import PriorityAlertsCard from "@/components/inventory-system/priority-alerts-card"
import HomeKpiCardsGrid from "@/components/inventory-system/home-kpi-cards-grid"
import MobileBottomNav from "@/components/mobile-bottom-nav"
import DailyPulseCard from "@/components/daily-pulse-card"
import TodayGapsCard from "@/components/today-gaps-card"
import QuickLogPanel from "@/components/quick-log-panel"
import WeekBatchEntry from "@/components/week-batch-entry"
import { getSeasonAwareTabOrder, getSeasonQuickActions } from "@/lib/season-utils"
import {
  INITIAL_ONBOARDING_STATUS,
  buildOnboardingSteps,
  getOnboardingStatusRequests,
  type OnboardingAccess,
  type OnboardingStatusKey,
  type OnboardingStatusSnapshot,
} from "@/components/inventory-system/onboarding"

import posthog from "posthog-js"

const WRITE_QUEUE_STATUS_EVENT = "farmflow:write-queue-status"

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
const PepperTab = dynamic(() => import("./pepper-tab").then((module) => module.PepperTab), {
  loading: () => <TabPanelLoading label="Pepper processing" />,
})
const RubberTab = dynamic(() => import("./rubber-tab").then((module) => module.RubberTab), {
  loading: () => <TabPanelLoading label="Rubber tapping" />,
})
const MorningBriefCard = dynamic(() => import("@/components/morning-brief-card"), { ssr: false })
const WorkspaceLauncher = dynamic(() => import("@/components/workspace-launcher"), { ssr: false })
const InventoryDialogs = dynamic(() => import("@/components/inventory-dialogs"), { ssr: false })

type WriteQueueBlockedEntry = {
  id: number
  method: string
  pathname: string
  url: string
  queuedAt: number
  attempts: number
  lastError?: string
  lastStatus?: number | null
  blockedReason?: string
}

type WriteQueueStatusSnapshot = {
  pendingCount: number
  blockedAuthCount: number
  blockedReviewCount: number
  blockedAuthEntries: WriteQueueBlockedEntry[]
  blockedReviewEntries: WriteQueueBlockedEntry[]
  updatedAt: number | null
}

type OpsExportFailureSnapshot = {
  dataset: ExportDatasetId
  message: string
  occurredAt: number
}

type TransactionWriteFailureSnapshot = {
  message: string
  occurredAt: number
  locationId: string | null
  transaction: Transaction
}

type AccountsWorkspaceTab = "labour" | "expenses" | "attendance" | "activities" | "workers" | "picking" | "ledger" | "payroll"

const ACCOUNTS_WORKSPACE_TABS: AccountsWorkspaceTab[] = [
  "labour",
  "expenses",
  "attendance",
  "activities",
  "workers",
  "picking",
  "ledger",
  "payroll",
]

const isAccountsWorkspaceTab = (value: string | null | undefined): value is AccountsWorkspaceTab =>
  ACCOUNTS_WORKSPACE_TABS.includes(String(value || "").trim() as AccountsWorkspaceTab)

export default function InventorySystem() {
  type InventoryWorkspaceView = "inventory" | "transactions"
  type SalesWorkspaceView = "coffee" | "other-sales"
  type ProcessingWorkspaceView = "coffee" | "pepper" | "rubber"
  // UI / paging
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [activeTab, setActiveTab] = useState(DASHBOARD_LAUNCHER_TAB)
  const [showTabSwitchLoader, setShowTabSwitchLoader] = useState(false)
  const visitedTabsRef = useRef<Set<string>>(new Set([DASHBOARD_LAUNCHER_TAB]))
  const [inventoryWorkspaceView, setInventoryWorkspaceView] = useState<InventoryWorkspaceView>("inventory")
  const [salesWorkspaceView, setSalesWorkspaceView] = useState<SalesWorkspaceView>("coffee")
  const [processingWorkspaceView, setProcessingWorkspaceView] = useState<ProcessingWorkspaceView>("coffee")
  const [loadedTabs, setLoadedTabs] = useState<string[]>([DASHBOARD_LAUNCHER_TAB])
  const [dataToolsDataset, setDataToolsDataset] = useState<ExportDatasetId>("processing")
  const [searchOpen, setSearchOpen] = useState(false)
  const [isExportingDataTools, setIsExportingDataTools] = useState(false)
  const [showDataToolsPanel, setShowDataToolsPanel] = useState(false)
  const [accountsInitialTab, setAccountsInitialTab] = useState<AccountsWorkspaceTab | undefined>(undefined)
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null)
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)
  const [isModulesLoading, setIsModulesLoading] = useState(false)
  const [hasResolvedModules, setHasResolvedModules] = useState(false)

  // data & states
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const laborDeployments: any[] = []
  const [summary, setSummary] = useState({ total_inventory_value: 0, total_items: 0, total_quantity: 0 })
  const [accountsTotals, setAccountsTotals] = useState({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
  const [accountsTotalsLoading, setAccountsTotalsLoading] = useState(false)
  // hero totals state lives in useHeroTotals — wired below)
  const [costPerKgData, setCostPerKgData] = useState<{
    laborCost: number
    expenseCost: number
    totalCost: number
    totalOutputKg: number
    costPerKg: number | null
    totalRevenue: number
    totalSoldKg: number
    revenuePerKg: number | null
    grossMarginPerKg: number | null
    grossMarginPct: number | null
    laborPct: number | null
    expensePct: number | null
    hasData: boolean
    loading: boolean
  }>({
    laborCost: 0,
    expenseCost: 0,
    totalCost: 0,
    totalOutputKg: 0,
    costPerKg: null,
    totalRevenue: 0,
    totalSoldKg: 0,
    revenuePerKg: null,
    grossMarginPerKg: null,
    grossMarginPct: null,
    laborPct: null,
    expensePct: null,
    hasData: false,
    loading: false,
  })
  const [seasonProjection, setSeasonProjection] = useState<{
    seasonTotalKg: number
    recentAvgDailyKg: number
    trendDirection: "rising" | "flat" | "declining"
    projectedSeasonTotal: number | null
    projectedEndDate: string | null
    hasData: boolean
    loading: boolean
  }>({
    seasonTotalKg: 0,
    recentAvgDailyKg: 0,
    trendDirection: "flat",
    projectedSeasonTotal: null,
    projectedEndDate: null,
    hasData: false,
    loading: false,
  })
  const [estatePulseData, setEstatePulseData] = useState<{
    data: EstatePulseData | null
    loading: boolean
  }>({
    data: null,
    loading: false,
  })
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>(LOCATION_ALL)
  const [transactionLocationId, setTransactionLocationId] = useState<string>(LOCATION_UNASSIGNED)
  const [inventoryEditLocationId, setInventoryEditLocationId] = useState<string>(LOCATION_UNASSIGNED)
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [writeQueueStatus, setWriteQueueStatus] = useState<WriteQueueStatusSnapshot>({
    pendingCount: 0,
    blockedAuthCount: 0,
    blockedReviewCount: 0,
    blockedAuthEntries: [],
    blockedReviewEntries: [],
    updatedAt: null,
  })
  const [isRequestingQueueRetry, setIsRequestingQueueRetry] = useState(false)
  const [accountsExportRequest, setAccountsExportRequest] = useState<{
    requestId: number
    format: AccountsExportFormat
  } | null>(null)
  const [lastOpsExportFailure, setLastOpsExportFailure] = useState<OpsExportFailureSnapshot | null>(null)
  const [lastTransactionWriteFailure, setLastTransactionWriteFailure] = useState<TransactionWriteFailureSnapshot | null>(null)

  // edit/create UI
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false)
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null)
  const [isInventoryEditDialogOpen, setIsInventoryEditDialogOpen] = useState(false)
  const [inventoryEditForm, setInventoryEditForm] = useState({ name: "", unit: "kg", quantity: "" })
  const [isSavingInventoryEdit, setIsSavingInventoryEdit] = useState(false)
  const [newItemForm, setNewItemForm] = useState({
    name: "",
    unit: "kg",
    quantity: "",
    price: "",
    notes: "",
    locationId: LOCATION_UNASSIGNED,
  })
  const [isSavingNewItem, setIsSavingNewItem] = useState(false)
  const [isMovementDrawerOpen, setIsMovementDrawerOpen] = useState(false)
  const [isInventoryDrilldownOpen, setIsInventoryDrilldownOpen] = useState(false)

  // transaction creation/editing
  const [newTransaction, setNewTransaction] = useState<Transaction | null>(createDefaultTransaction())
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSavingTransactionEdit, setIsSavingTransactionEdit] = useState(false)
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<number | null>(null)

  // UI controls
  const [inventorySearchTerm, setInventorySearchTerm] = useState("")
  const [transactionSearchTerm, setTransactionSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("All Types")
  const [inventoryDrilldownItemName, setInventoryDrilldownItemName] = useState("")
  const [itemDrilldownTransactions, setItemDrilldownTransactions] = useState<Transaction[]>([])
  const [isLoadingItemDrilldown, setIsLoadingItemDrilldown] = useState(false)
  const [drilldownShowAll, setDrilldownShowAll] = useState(false)
  const [inventorySortOrder, setInventorySortOrder] = useState<"asc" | "desc" | null>(null)
  const [inventoryBannerDismissed, setInventoryBannerDismissed] = useState(false)
  const [transactionSortOrder, setTransactionSortOrder] = useState<"asc" | "desc">("desc")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState("")
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const LIVE_TENANT_SKIP_TENANTS = useMemo(
    () => new Set<string>(["41b4b10c-428c-4155-882f-1cc7f6e89a78"]),
    [],
  )
  const [isOnboardingExpanded, setIsOnboardingExpanded] = useState(false)
  const [intelligenceBrief, setIntelligenceBrief] = useState<IntelligenceBrief | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)
  const [proactiveInsights, setProactiveInsights] = useState<Array<{ text: string; severity: "good" | "warning" | "info" }> | null>(null)
  const [proactiveInsightsLoading, setProactiveInsightsLoading] = useState(false)
  const [proactiveInsightsError, setProactiveInsightsError] = useState<string | null>(null)
  const [seasonCompareNarrative, setSeasonCompareNarrative] = useState<string | null>(null)
  const [seasonCompareLoading, setSeasonCompareLoading] = useState(false)
  const [seasonCompareError, setSeasonCompareError] = useState<string | null>(null)
  const [seasonCompareFYLabels, setSeasonCompareFYLabels] = useState<{ curr: string; prev: string } | null>(null)
  const [recentActivity, setRecentActivity] = useState<Array<{ module: string; label: string; detail: string; date: string }> | null>(null)
  const [recentActivityLoading, setRecentActivityLoading] = useState(false)
  const hasTrackedInsightViewRef = useRef(false)
  const lastExecutionOutcomeSignatureRef = useRef("")
  // Each ref remembers the tenant it last loaded successfully for, so revisiting the
  // Home tab within the same session doesn't re-fire these fetches every time.
  const intelligenceBriefLoadedRef = useRef<string | null>(null)
  const activityStreakLoadedRef = useRef<string | null>(null)
  const proactiveInsightsLoadedRef = useRef<string | null>(null)
  const seasonCompareLoadedRef = useRef<string | null>(null)
  const recentActivityLoadedRef = useRef<string | null>(null)
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatusSnapshot>(INITIAL_ONBOARDING_STATUS)
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false)
  const [hasLoadedOnboardingStatus, setHasLoadedOnboardingStatus] = useState(false)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [newLocationName, setNewLocationName] = useState("")
  const [newLocationCode, setNewLocationCode] = useState("")
  const hasLoadedOnboardingOnce = useRef(false)
  const [isCreatingLocation, setIsCreatingLocation] = useState(false)
  const [isAddingStarterCodes, setIsAddingStarterCodes] = useState(false)
  const [onboardingEstateName, setOnboardingEstateName] = useState("")
  const [onboardingBagWeightKg, setOnboardingBagWeightKg] = useState("")
  const [isSavingOnboardingDefaults, setIsSavingOnboardingDefaults] = useState(false)
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null)
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false)
  const [activityStreak, setActivityStreak] = useState<number>(0)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  // auth + router
  const { user, logout, status } = useAuth()
  const { settings: tenantSettings, isFeatureEnabled, updateSettings } = useTenantExperience()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantId = user?.tenantId || null
  const previewTenantId = (searchParams.get("previewTenantId") || "").trim()
  const previewTenantName = (searchParams.get("previewTenantName") || "").trim()
  const previewRoleParam = (searchParams.get("previewRole") || "").toLowerCase()
  const previewRole = previewRoleParam === "admin" || previewRoleParam === "user" ? previewRoleParam : null
  const isPlatformOwner = !!user?.role && user.role.toLowerCase() === "owner"
  const isPreviewMode = Boolean(isPlatformOwner && previewTenantId && previewRole)
  const ownerPreviewContext = useMemo(
    () =>
      isPreviewMode
        ? normalizeOwnerPreviewContext({
            previewTenantId,
            previewRole,
            previewTenantName,
          })
        : null,
    [isPreviewMode, previewRole, previewTenantId, previewTenantName],
  )
  const effectiveRole = isPreviewMode ? previewRole : user?.role?.toLowerCase() || ""
  const roleBadgeLabel = isPreviewMode ? `Preview: ${roleLabel(effectiveRole)}` : roleLabel(user?.role)
  const tenantLabel = isPreviewMode
    ? previewTenantName || `Tenant ${previewTenantId.slice(0, 8)}`
    : tenantSettings.estateName
      ? `Estate: ${tenantSettings.estateName}`
      : "Estate: add a name in Settings"
  const activityTenantId = isPreviewMode ? previewTenantId : tenantId
  const hideEmptyMetrics = Boolean(tenantSettings.uiPreferences?.hideEmptyMetrics)
  const isAdmin = effectiveRole === "admin"
  const isOwner = effectiveRole === "owner"
  const isScopedUser = effectiveRole === "user"
  const showFinancialHomeCards = isAdmin || isOwner
  const canManageData = !isPreviewMode && (isAdmin || isOwner)
  const canManageRecords = !isPreviewMode && (isAdmin || isOwner || isScopedUser)
  const showDataToolsControls = canManageData && showDataToolsPanel
  const isTenantLoading = status === "loading"
  const buildWorkspaceHref = useCallback(
    (href: string) => appendOwnerPreviewContext(href, ownerPreviewContext),
    [ownerPreviewContext],
  )
  const preventNegativeKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "-" || event.key === "e" || event.key === "E") {
      event.preventDefault()
    }
  }
  const preventNumberScrollChange = (event: React.WheelEvent<HTMLInputElement>) => {
    event.currentTarget.blur()
  }
  const normalizeQuantityValue = (value: unknown) => {
    if (value === "" || value === null || value === undefined) return null
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) return null
    return Number((Math.round((numeric + Number.EPSILON) * 100) / 100).toFixed(2))
  }
  const coerceNonNegativeNumber = (value: string) => {
    if (!value.trim()) return ""
    return normalizeQuantityValue(value)
  }
  const isModuleEnabled = useCallback(
    (moduleId: string) => {
      if (isOwner && !isPreviewMode) {
        return true
      }
      if (!enabledModules) {
        return getModuleDefaultEnabled(moduleId)
      }
      return enabledModules.includes(moduleId)
    },
    [enabledModules, isOwner, isPreviewMode],
  )

  // helpers
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isStandaloneMode = useStandaloneMode()
  const isStandaloneMobileApp = isMobile && isStandaloneMode
  const { theme, setTheme } = useTheme()
  const currentFiscalYear = useMemo(() => getCurrentFiscalYear(), [])
  const seasonProgress = useMemo(() => {
    const start = new Date(currentFiscalYear.startDate).getTime()
    const end = new Date(currentFiscalYear.endDate).getTime()
    const now = Date.now()
    const pct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
    const daysRemaining = Math.max(0, Math.ceil((end - now) / 86_400_000))
    return { pct, daysRemaining }
  }, [currentFiscalYear])
  const showTransactionHistory = isModuleEnabled("transactions")
  const canShowInventory = isModuleEnabled("inventory")
  const canShowAccounts = isModuleEnabled("accounts")
  const canShowBalanceSheet = isModuleEnabled("balance-sheet") && (isAdmin || isOwner)
  const canShowSeasonPl = isModuleEnabled("accounts") && (isAdmin || isOwner)
  const canShowProcessing = isModuleEnabled("processing")
  const canShowDispatch = isModuleEnabled("dispatch")
  const canShowSales = isModuleEnabled("sales") && isAdmin
  const canShowOtherSales = isModuleEnabled("other-sales") && !isScopedUser
  const canShowInventoryWorkspace = canShowInventory || showTransactionHistory
  const canShowSalesWorkspace = canShowSales || canShowOtherSales
  const canShowCuring = isModuleEnabled("curing")
  const canShowQuality = isModuleEnabled("quality")
  const canShowRainfall = isModuleEnabled("rainfall")
  const canShowPepper = isModuleEnabled("pepper")
  const canShowRubber = isModuleEnabled("rubber")
  const canShowAiAnalysis = isModuleEnabled("ai-analysis")
  const canLaunchAssistant = !isOwner || isPreviewMode
  const canShowNews = isModuleEnabled("news")
  const canShowMarketPricing = isModuleEnabled("market-pricing")
  const canShowCompliance = isModuleEnabled("compliance")
  const canShowWeather = isModuleEnabled("weather")
  const canShowSeason = isModuleEnabled("season")
  const canShowYieldForecast = canShowSeason
  const canShowActivityLog = (isAdmin || isOwner) && isFeatureEnabled("showActivityLogTab")
  const canShowLaborManagement = isModuleEnabled("labour")
  const canShowPickingLog = isModuleEnabled("picking")
  const canShowReceivables = isModuleEnabled("receivables")
  const canShowBilling = isModuleEnabled("billing")
  const canShowDocuments = isModuleEnabled("documents")
  const canShowJournal = isModuleEnabled("journal")
  const canShowResources = isModuleEnabled("resources") && isFeatureEnabled("showResourcesTab")
  const canShowPlantHealth = isOwner || isModuleEnabled("plant-health") || canShowResources || canShowAiAnalysis
  const canShowWelcomeCard = isFeatureEnabled("showWelcomeCard")
  const canShowRainfallSection = canShowRainfall || canShowWeather
  const canShowIntelligence = !isScopedUser && (canShowDispatch || canShowSalesWorkspace || canShowAccounts || canShowSeason)
  const canShowProcessingWorkspace = canShowProcessing || canShowPepper || canShowRubber
  const processingWorkspaceLabel = canShowProcessing ? "Pulping" : canShowPepper ? "Pepper Processing" : "Rubber"
  const processingWorkspaceIcon = canShowProcessing ? Factory : Leaf
  const shouldLoadHomeMetrics = activeTab === "home"
  const shouldLoadExceptionSummary = activeTab === "home" || activeTab === "season"

  const {
    processingTotals,
    dispatchHeroTotals,
    salesHeroTotals,
    otherSalesHeroTotals,
    curingHeroTotals,
    qualityHeroTotals,
    pepperHeroTotals,
    rubberHeroTotals,
    rainfallHeroTotals,
    receivablesHeroTotals,
    exceptionsSummary,
    exceptionsLoading,
    exceptionsError,
  } = useHeroTotals({
    tenantId,
    shouldLoadHomeMetrics,
    shouldLoadExceptionSummary,
    isPreviewMode,
    previewTenantId,
    currentFiscalYear,
    canShowProcessing,
    canShowDispatch,
    canShowSales,
    canShowOtherSales,
    canShowReceivables,
    canShowCuring,
    canShowQuality,
    canShowPepper,
    canShowRubber,
    canShowRainfall,
    canShowSeason,
  })

  const resolvedProcessingWorkspaceView: ProcessingWorkspaceView =
    processingWorkspaceView === "pepper" && canShowPepper
      ? "pepper"
      : processingWorkspaceView === "rubber" && canShowRubber
        ? "rubber"
        : canShowProcessing
          ? "coffee"
          : canShowPepper
            ? "pepper"
            : canShowRubber
              ? "rubber"
              : "coffee"
  const estateMetrics = useMemo(() => {
    const inventoryCount = inventory.length
    const locationCount = locations.length
    const recentActivity = transactions.filter((t) => isWithinLast24Hours(t.transaction_date)).length

    return {
      inventoryCount,
      locationCount,
      recentActivity,
      inventoryValue: summary.total_inventory_value,
    }
  }, [inventory.length, locations.length, summary.total_inventory_value, transactions])

  // Cmd+K / Ctrl+K global shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    setProcessingWorkspaceView((currentView) => {
      if (currentView === "pepper" && canShowPepper) return currentView
      if (currentView === "rubber" && canShowRubber) return currentView
      if (canShowProcessing) return "coffee"
      if (canShowPepper) return "pepper"
      if (canShowRubber) return "rubber"
      return "coffee"
    })
  }, [canShowPepper, canShowRubber, canShowProcessing])

  useEffect(() => {
    setOnboardingEstateName(String(tenantSettings.estateName || ""))
    setOnboardingBagWeightKg(
      Number.isFinite(Number(tenantSettings.bagWeightKg)) && Number(tenantSettings.bagWeightKg) > 0
        ? String(Number(tenantSettings.bagWeightKg))
        : "50",
    )
  }, [tenantSettings.bagWeightKg, tenantSettings.estateName])

  useEffect(() => {
    if (!user) {
      // If auth removed, push to homepage
      router.push("/")
    }
  }, [user, router])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (isPreviewMode && previewTenantId) {
      document.cookie = `${PREVIEW_TENANT_COOKIE}=${encodeURIComponent(previewTenantId)}; path=/; SameSite=Lax`
      return
    }
    document.cookie = `${PREVIEW_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  }, [isPreviewMode, previewTenantId])

  const loadWorkspaceBootstrap = useCallback(async () => {
    if (!tenantId || isOwner || isPreviewMode) {
      return false
    }

    setHasResolvedModules(false)
    setIsModulesLoading(true)
    let resolved = false
    try {
      const response = await fetch("/api/dashboard/bootstrap", { cache: "no-store" })
      const data = (await response.json()) as { success?: boolean; error?: string } & WorkspaceBootstrapPayload
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load workspace bootstrap")
      }

      setEnabledModules(Array.isArray(data.modules) ? data.modules.map((moduleId) => String(moduleId)) : null)
      setLocations(Array.isArray(data.locations) ? data.locations : [])
      setCurrentPlanId(data.planId ? String(data.planId) : null)
      if (typeof data.trialDaysRemaining === "number") {
        if (data.trialDaysRemaining === 0) {
          router.replace("/trial-expired")
          return false
        }
        setTrialDaysRemaining(data.trialDaysRemaining)
      }
      resolved = true
      return true
    } catch (error) {
      console.error("Failed to load workspace bootstrap:", error)
      return false
    } finally {
      setIsModulesLoading(false)
      setHasResolvedModules(resolved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is a stable Next.js singleton; adding it would recreate the callback needlessly
  }, [isOwner, isPreviewMode, tenantId])

  const loadTenantModules = useCallback(async () => {
    if (isPreviewMode) {
      setHasResolvedModules(false)
      setIsModulesLoading(true)
      try {
        const response = await fetch(`/api/admin/tenant-modules?tenantId=${encodeURIComponent(previewTenantId)}`, {
          cache: "no-store",
        })
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load tenant modules")
        }
        if (Array.isArray(data.modules)) {
          const moduleIds = data.modules
            .filter((module: any) => {
              if (typeof module === "string") return true
              return Boolean(module?.enabled)
            })
            .map((module: any) => (typeof module === "string" ? module : String(module.id)))
          setEnabledModules(moduleIds)
        } else {
          setEnabledModules(null)
        }
      } catch (error) {
        console.error("Failed to load preview tenant modules:", error)
        setEnabledModules(null)
      } finally {
        setIsModulesLoading(false)
        setHasResolvedModules(true)
      }
      return
    }
    if (!tenantId || isOwner) {
      setEnabledModules(null)
      setHasResolvedModules(true)
      return
    }
    setHasResolvedModules(false)
    setIsModulesLoading(true)
    try {
      const response = await fetch("/api/tenant-modules", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load tenant modules")
      }
      if (Array.isArray(data.modules)) {
        setEnabledModules(data.modules.map((module: string) => String(module)))
      } else {
        setEnabledModules(null)
      }
    } catch (error) {
      console.error("Failed to load tenant modules:", error)
      setEnabledModules(null)
    } finally {
      setIsModulesLoading(false)
      setHasResolvedModules(true)
    }
  }, [isOwner, isPreviewMode, previewTenantId, tenantId])

  const loadLocations = useCallback(async () => {
    if (!tenantId) return
    try {
      const endpoint =
        isPreviewMode && previewTenantId
          ? `/api/locations?tenantId=${encodeURIComponent(previewTenantId)}`
          : "/api/locations"
      const response = await fetch(endpoint)
      const data = await response.json()
      const loaded = Array.isArray(data.locations) ? data.locations : []
      setLocations(loaded)
    } catch (error) {
      console.error("Failed to load locations:", error)
    }
  }, [isPreviewMode, previewTenantId, tenantId])

  useEffect(() => {
    if (!tenantId) return

    let cancelled = false

    const loadInitialWorkspaceState = async () => {
      if (!isOwner && !isPreviewMode) {
        const bootstrapped = await loadWorkspaceBootstrap()
        if (bootstrapped || cancelled) {
          return
        }
      }

      await Promise.allSettled([loadTenantModules(), loadLocations()])
    }

    void loadInitialWorkspaceState()

    return () => {
      cancelled = true
    }
  }, [isOwner, isPreviewMode, loadLocations, loadTenantModules, loadWorkspaceBootstrap, tenantId])

  useEffect(() => {
    if (!tenantId) return
    if (activeTab !== "accounts" && activeTab !== "billing" && activeTab !== "balance-sheet" && activeTab !== "home") {
      setAccountsTotalsLoading(false)
      return
    }

    let isActive = true
    const fetchAccountsTotals = async () => {
      try {
        setAccountsTotalsLoading(true)
        const params = new URLSearchParams({
          startDate: currentFiscalYear.startDate,
          endDate: currentFiscalYear.endDate,
        })
        const response = await fetch(`/api/accounts-totals?${params.toString()}`)
        const data = await response.json()

        if (!response.ok || !data.success) {
          console.error("Failed to load accounts totals:", data)
          if (isActive) {
            setAccountsTotals({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
          }
          return
        }

        if (isActive) {
          setAccountsTotals({
            laborTotal: Number(data.laborTotal) || 0,
            otherTotal: Number(data.otherTotal) || 0,
            grandTotal: Number(data.grandTotal) || 0,
          })
        }
      } catch (error) {
        console.error("Error loading accounts totals:", error)
        if (isActive) {
          setAccountsTotals({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
        }
      } finally {
        if (isActive) {
          setAccountsTotalsLoading(false)
        }
      }
    }

    fetchAccountsTotals()

    return () => {
      isActive = false
    }
  }, [activeTab, currentFiscalYear.endDate, currentFiscalYear.startDate, tenantId])

  useEffect(() => {
    if (!tenantId || activeTab !== "home") return
    let active = true

    const fetchIntelligence = async () => {
      setCostPerKgData((p) => ({ ...p, loading: true }))
      setSeasonProjection((p) => ({ ...p, loading: true }))
      setEstatePulseData((p) => ({ ...p, loading: true }))

      const [cpkRes, projRes, pulseRes] = await Promise.allSettled([
        fetch("/api/dashboard/cost-per-kg").then((r) => r.json()),
        fetch("/api/dashboard/season-projection").then((r) => r.json()),
        fetch("/api/dashboard/estate-pulse").then((r) => r.json()),
      ])

      if (!active) return

      if (cpkRes.status === "fulfilled" && cpkRes.value?.success) {
        const d = cpkRes.value
        setCostPerKgData({
          laborCost: d.laborCost ?? 0,
          expenseCost: d.expenseCost ?? 0,
          totalCost: d.totalCost ?? 0,
          totalOutputKg: d.totalOutputKg ?? 0,
          costPerKg: d.costPerKg ?? null,
          totalRevenue: d.totalRevenue ?? 0,
          totalSoldKg: d.totalSoldKg ?? 0,
          revenuePerKg: d.revenuePerKg ?? null,
          grossMarginPerKg: d.grossMarginPerKg ?? null,
          grossMarginPct: d.grossMarginPct ?? null,
          laborPct: d.laborPct ?? null,
          expensePct: d.expensePct ?? null,
          hasData: d.hasData ?? false,
          loading: false,
        })
      } else {
        setCostPerKgData((p) => ({ ...p, loading: false }))
      }

      if (projRes.status === "fulfilled" && projRes.value?.success) {
        const d = projRes.value
        setSeasonProjection({
          seasonTotalKg: d.seasonTotalKg ?? 0,
          recentAvgDailyKg: d.recentAvgDailyKg ?? 0,
          trendDirection: d.trendDirection ?? "flat",
          projectedSeasonTotal: d.projectedSeasonTotal ?? null,
          projectedEndDate: d.projectedEndDate ?? null,
          hasData: d.hasData ?? false,
          loading: false,
        })
      } else {
        setSeasonProjection((p) => ({ ...p, loading: false }))
      }

      if (pulseRes.status === "fulfilled" && pulseRes.value?.success) {
        setEstatePulseData({ data: pulseRes.value as EstatePulseData, loading: false })
      } else {
        setEstatePulseData((p) => ({ ...p, loading: false }))
      }
    }

    void fetchIntelligence()
    return () => { active = false }
  }, [activeTab, tenantId])

  useEffect(() => {
    if (selectedLocationId !== LOCATION_ALL) {
      setTransactionLocationId(selectedLocationId)
    }
  }, [selectedLocationId])

  // One-time: when locations first arrive, auto-select the sole location so new
  // transactions don't silently fall into the unassigned bucket.
  const locationDefaultApplied = useRef(false)
  useEffect(() => {
    if (!locationDefaultApplied.current && locations.length > 0) {
      locationDefaultApplied.current = true
      if (locations.length === 1) {
        setTransactionLocationId(locations[0].id)
      }
    }
  }, [locations])

  useEffect(() => {
    if (
      transactionLocationId !== LOCATION_UNASSIGNED &&
      transactionLocationId !== LOCATION_ALL &&
      !locations.find((loc) => loc.id === transactionLocationId)
    ) {
      setTransactionLocationId(locations.length === 1 ? locations[0].id : LOCATION_UNASSIGNED)
    }
  }, [locations, transactionLocationId])

  // load initial data
  const refreshData = useCallback(async (_force = false) => {
    if (!tenantId) {
      return
    }
    try {
      setLoading(true)
      setSyncError(null)
      const locationQuery = selectedLocationId !== LOCATION_ALL ? `?locationId=${encodeURIComponent(selectedLocationId)}` : ""
      const inventoryUrl = `${API_INVENTORY}${locationQuery}`
      const transactionsUrl = `${API_TRANSACTIONS}?limit=100${selectedLocationId !== LOCATION_ALL ? `&locationId=${encodeURIComponent(selectedLocationId)}` : ""}`
      const shouldFetchTransactions = isOwner || !enabledModules || enabledModules.includes("transactions")
      // fetch inventory and transactions in parallel
      const [invRes, txRes] = await Promise.all([
        fetch(inventoryUrl),
        shouldFetchTransactions ? fetch(transactionsUrl) : Promise.resolve(null),
      ])

      if (!invRes.ok) {
        const err = await invRes.json().catch(() => ({}))
        setSyncError(err?.message || "Failed to fetch inventory")
      } else {
        const invJson = await invRes.json()
        setInventory(invJson.items || invJson.inventory || [])
        if (invJson.summary) {
          setSummary(invJson.summary)
        }
      }

      if (!txRes) {
        setTransactions([])
      } else if (!txRes.ok) {
        const err = await txRes.json().catch(() => ({}))
        setSyncError((prev) => prev ? prev + "; " + (err?.message || "Failed transactions") : (err?.message || "Failed transactions"))
      } else {
        const txJson = await txRes.json()
        setTransactions(txJson.transactions || [])
      }

      setLastSync(new Date())
      setLoading(false)
    } catch (error: any) {
      setLoading(false)
      setSyncError(error.message || "Unexpected error during sync")
      console.error("refreshData error:", error)
    }
  }, [enabledModules, isOwner, selectedLocationId, tenantId])

  useEffect(() => {
    if (!tenantId) return
    refreshData()
  }, [tenantId, refreshData])

  const loadOnboardingStatus = useCallback(async () => {
    if (!tenantId || isOwner || !hasResolvedModules) {
      return
    }
    setIsOnboardingLoading(true)
    setHasLoadedOnboardingStatus(false)
    setOnboardingError(null)
    try {
      const onboardingAccess: OnboardingAccess = {
        canShowInventory: isModuleEnabled("inventory"),
        canShowAccountCodes: isModuleEnabled("accounts"),
        canShowLabor: isModuleEnabled("accounts"),
        canShowProcessing: isModuleEnabled("processing"),
        canShowDispatch: isModuleEnabled("dispatch"),
        canShowSales: isAdmin && isModuleEnabled("sales"),
        canManageUsers: isAdmin,
      }
      const locationsEndpoint =
        isPreviewMode && previewTenantId
          ? `/api/locations?tenantId=${encodeURIComponent(previewTenantId)}`
          : "/api/locations"
      const requests = getOnboardingStatusRequests(locationsEndpoint, onboardingAccess, tenantId)

      if (requests.length === 0) {
        setOnboardingStatus(INITIAL_ONBOARDING_STATUS)
        setHasLoadedOnboardingStatus(true)
        setIsOnboardingLoading(false)
        return
      }

      const results = await Promise.allSettled(requests.map((request) => fetch(request.endpoint)))

      const parseJson = async (result: PromiseSettledResult<Response>) => {
        if (result.status !== "fulfilled") {
          return null
        }
        const response = result.value
        if (!response.ok) {
          return null
        }
        try {
          return await response.json()
        } catch {
          return null
        }
      }

      const payloads = await Promise.all(results.map((result) => parseJson(result)))
      const nextStatus: OnboardingStatusSnapshot = { ...INITIAL_ONBOARDING_STATUS }

      const hasRecords = (data: any) =>
        (Number(data?.totalCount) || 0) > 0 || (Array.isArray(data?.records) && data.records.length > 0)

      requests.forEach((request, index) => {
        const payload = payloads[index]
        if (request.key === "locations") {
          nextStatus.locations = Array.isArray(payload?.locations) && payload.locations.length > 0
          return
        }
        if (request.key === "account_codes") {
          nextStatus.account_codes = Array.isArray(payload?.activities) && payload.activities.length > 0
          return
        }
        if (request.key === "inventory") {
          nextStatus.inventory =
            Number(payload?.summary?.total_items) > 0 ||
            (Array.isArray(payload?.inventory) && payload.inventory.length > 0) ||
            (Array.isArray(payload?.items) && payload.items.length > 0)
          return
        }
        if (request.key === "team_member") {
          // Done when at least one additional user exists beyond the admin themselves
          nextStatus.team_member = Array.isArray(payload?.users) && payload.users.length > 1
          return
        }

        nextStatus[request.key as Exclude<OnboardingStatusKey, "locations" | "account_codes" | "inventory" | "team_member">] = hasRecords(payload)
      })

      setOnboardingStatus(nextStatus)

      const hasError = results.some(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
      )
      if (hasError) {
        setOnboardingError("Some checklist data could not be loaded.")
      }
    } catch (error: any) {
      setOnboardingError(error?.message || "Failed to load setup checklist.")
    } finally {
      setIsOnboardingLoading(false)
      setHasLoadedOnboardingStatus(true)
      hasLoadedOnboardingOnce.current = true
    }
  }, [hasResolvedModules, isAdmin, isModuleEnabled, isOwner, isPreviewMode, previewTenantId, tenantId])

  useEffect(() => {
    if (!tenantId || isOwner || !hasResolvedModules) return
    loadOnboardingStatus()
  }, [hasResolvedModules, tenantId, isOwner, loadOnboardingStatus])

  // Auto-refresh checklist whenever inventory data syncs (catches step completions in other tabs)
  useEffect(() => {
    if (!lastSync || !hasLoadedOnboardingOnce.current) return
    loadOnboardingStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync])

  // Refresh checklist when labour, expense, or picking tabs save a record
  useEffect(() => {
    const handler = () => {
      if (!hasLoadedOnboardingOnce.current) return
      loadOnboardingStatus()
    }
    window.addEventListener(FARMFLOW_RECORD_SAVED_EVENT, handler)
    return () => window.removeEventListener(FARMFLOW_RECORD_SAVED_EVENT, handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) {
      toast({
        title: "Location name required",
        description: "Enter a location name to continue.",
        variant: "destructive",
      })
      return
    }

    setIsCreatingLocation(true)
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLocationName.trim(),
          code: newLocationCode.trim() || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create location")
      }

      toast({
        title: "Location added",
        description: `${data.location?.name || newLocationName.trim()} is ready.`,
      })
      setNewLocationName("")
      setNewLocationCode("")
      loadLocations()
      loadOnboardingStatus()
    } catch (error: any) {
      toast({
        title: "Failed to add location",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCreatingLocation(false)
    }
  }

  const handleAddStarterCodes = async () => {
    const starterCodes = [
      { code: "LABOR", reference: "Wages and picker payments" },
      { code: "SUPPLIES", reference: "Materials and farm inputs" },
      { code: "MAINTENANCE", reference: "Equipment and estate upkeep" },
      { code: "ADMIN", reference: "Office and administrative costs" },
    ]
    setIsAddingStarterCodes(true)
    try {
      await Promise.allSettled(
        starterCodes.map((entry) =>
          fetch("/api/add-activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          }),
        ),
      )
      toast({
        title: "Starter codes added",
        description: "LABOR, SUPPLIES, MAINTENANCE, and ADMIN codes are ready to use.",
      })
      loadOnboardingStatus()
    } catch {
      toast({
        title: "Failed to add codes",
        description: "Please try again or add codes manually in Accounts.",
        variant: "destructive",
      })
    } finally {
      setIsAddingStarterCodes(false)
    }
  }

  const handleSaveOnboardingDefaults = async () => {
    const nextEstateName = onboardingEstateName.trim()
    const nextBagWeightKg = Number(onboardingBagWeightKg)

    if (!nextEstateName) {
      toast({
        title: "Estate name required",
        description: "Enter the estate name before saving defaults.",
        variant: "destructive",
      })
      return
    }

    if (!Number.isFinite(nextBagWeightKg) || nextBagWeightKg < 40 || nextBagWeightKg > 70) {
      toast({
        title: "Bag weight must be between 40 and 70 kg",
        description: "Use the standard bag weight your estate actually works with.",
        variant: "destructive",
      })
      return
    }

    setIsSavingOnboardingDefaults(true)
    try {
      const saved = await updateSettings({
        estateName: nextEstateName,
        bagWeightKg: nextBagWeightKg,
      })
      setOnboardingEstateName(saved.estateName)
      setOnboardingBagWeightKg(String(saved.bagWeightKg))
      toast({
        title: "Estate defaults saved",
        description: "Bag weight and estate name are now ready for daily operations.",
      })
    } catch (error: any) {
      toast({
        title: "Failed to save defaults",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSavingOnboardingDefaults(false)
    }
  }

  const handleLogout = async () => {
    posthog.capture("user_signed_out", {
      username: user?.username,
      role: user?.role,
      tenant_id: user?.tenantId || "global",
    })
    if (typeof document !== "undefined") {
      document.cookie = `${PREVIEW_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    }
    await logout()
    router.push("/")
  }

  const toggleInventorySort = () => {
    if (inventorySortOrder === null) setInventorySortOrder("asc")
    else if (inventorySortOrder === "asc") setInventorySortOrder("desc")
    else setInventorySortOrder(null)
  }

  const toggleTransactionSort = () => {
    setTransactionSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
  }

  const locationMap = useMemo(() => {
    return new Map(locations.map((loc) => [loc.id, loc]))
  }, [locations])

  const resolveLocationLabel = useCallback(
    (locationId?: string | null, fallback?: string) => {
      if (!locationId) return UNASSIGNED_LABEL
      const location = locationMap.get(locationId)
      if (location) {
        return location.name || location.code || "Unknown"
      }
      if (fallback) return fallback
      return "Unknown"
    },
    [locationMap],
  )

  const selectedLocationLabel = useMemo(() => {
    if (selectedLocationId === LOCATION_ALL) return "All locations"
    if (selectedLocationId === LOCATION_UNASSIGNED) return UNASSIGNED_LABEL
    return resolveLocationLabel(selectedLocationId)
  }, [selectedLocationId, resolveLocationLabel])

  const postMessageToServiceWorker = useCallback((payload: Record<string, unknown>) => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload)
    }
    void navigator.serviceWorker.getRegistration()
      .then((registration) => {
        if (!registration) return
        registration.active?.postMessage(payload)
        registration.waiting?.postMessage(payload)
        registration.installing?.postMessage(payload)
      })
      .catch(() => undefined)
  }, [])

  const requestWriteQueueStatus = useCallback(() => {
    postMessageToServiceWorker({ type: "GET_WRITE_QUEUE_STATUS" })
  }, [postMessageToServiceWorker])

  const handleRetryWriteQueue = useCallback(() => {
    setIsRequestingQueueRetry(true)
    postMessageToServiceWorker({ type: "FLUSH_WRITE_QUEUE" })
    posthog.capture("offline_queue_retry_requested", {
      pending_count: writeQueueStatus.pendingCount,
      blocked_auth_count: writeQueueStatus.blockedAuthCount,
      blocked_review_count: writeQueueStatus.blockedReviewCount,
    })
    window.setTimeout(() => {
      requestWriteQueueStatus()
      setIsRequestingQueueRetry(false)
    }, 900)
  }, [
    postMessageToServiceWorker,
    requestWriteQueueStatus,
    writeQueueStatus.blockedAuthCount,
    writeQueueStatus.blockedReviewCount,
    writeQueueStatus.pendingCount,
  ])

  const handleRemoveQueuedEntry = useCallback(
    (entryId: number) => {
      if (!entryId) return
      postMessageToServiceWorker({ type: "DELETE_QUEUED_REQUEST", id: entryId })
      posthog.capture("offline_queue_entry_removed", { queue_entry_id: entryId })
      window.setTimeout(() => {
        requestWriteQueueStatus()
      }, 250)
    },
    [postMessageToServiceWorker, requestWriteQueueStatus],
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    const toQueueEntryArray = (value: unknown): WriteQueueBlockedEntry[] => {
      if (!Array.isArray(value)) return []
      return value
        .map((entry) => {
          const source = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
          return {
            id: Number(source.id || 0),
            method: String(source.method || "POST").toUpperCase(),
            pathname: String(source.pathname || ""),
            url: String(source.url || ""),
            queuedAt: Number(source.queuedAt || 0),
            attempts: Number(source.attempts || 0),
            lastError: String(source.lastError || ""),
            lastStatus: source.lastStatus == null ? null : Number(source.lastStatus || 0),
            blockedReason: String(source.blockedReason || ""),
          }
        })
        .filter((entry) => entry.id > 0)
    }

    const handleQueueStatusEvent = (rawEvent: Event) => {
      const detail = (rawEvent as CustomEvent<Record<string, unknown>>).detail || {}
      setWriteQueueStatus({
        pendingCount: Number(detail.pendingCount || 0),
        blockedAuthCount: Number(detail.blockedAuthCount || detail.blockedCount || 0),
        blockedReviewCount: Number(detail.blockedReviewCount || detail.reviewCount || 0),
        blockedAuthEntries: toQueueEntryArray(detail.blockedAuthEntries),
        blockedReviewEntries: toQueueEntryArray(detail.blockedReviewEntries),
        updatedAt: Number(detail.updatedAt || Date.now()),
      })
    }

    window.addEventListener(WRITE_QUEUE_STATUS_EVENT, handleQueueStatusEvent as EventListener)
    requestWriteQueueStatus()

    return () => {
      window.removeEventListener(WRITE_QUEUE_STATUS_EVENT, handleQueueStatusEvent as EventListener)
    }
  }, [requestWriteQueueStatus])

  // computed lists
  const allItemTypesForDropdown = Array.from(
    new Set(
      [...inventory.map((i) => normalizeInventoryItemType(i.name)), ...transactions.map((t) => normalizeInventoryItemType(t.item_type))].filter(Boolean),
    ),
  ).sort()
  const hasMovementItemTypes = allItemTypesForDropdown.length > 0
  const movementUnitByItemType = useMemo(() => {
    const units = new Map<string, string>()
    inventory.forEach((item) => {
      const itemType = normalizeInventoryItemType(item.name)
      const unit = String(item.unit || "").trim() || "kg"
      if (itemType && !units.has(itemType)) {
        units.set(itemType, unit)
      }
    })
    return units
  }, [inventory])
  const resolveInventoryUnitForItemType = useCallback(
    (itemType: string, fallbackUnit?: string) => {
      const normalizedItemType = normalizeInventoryItemType(itemType)
      if (!normalizedItemType) return String(fallbackUnit || "").trim() || "kg"
      return movementUnitByItemType.get(normalizedItemType) || String(fallbackUnit || "").trim() || "kg"
    },
    [movementUnitByItemType],
  )
  const selectedMovementUnit = useMemo(
    () => resolveInventoryUnitForItemType(newTransaction?.item_type || "", newTransaction?.unit),
    [newTransaction?.item_type, newTransaction?.unit, resolveInventoryUnitForItemType],
  )

  const filteredAndSortedInventory = inventory
    .filter((item) => item.name && item.name.toLowerCase().includes(inventorySearchTerm.toLowerCase()))
    .sort((a, b) => {
      if (!a.name || !b.name) return 0
      if (inventorySortOrder === "asc") return a.name.localeCompare(b.name)
      if (inventorySortOrder === "desc") return b.name.localeCompare(a.name)
      return 0
    })

  const transactionPricing = useMemo(() => {
    const agg: Record<string, { totalCost: number; totalQty: number }> = {}
    transactions.forEach((tx) => {
      const itemName = normalizeInventoryItemType(tx.item_type)
      if (!itemName) return
      const qty = Number(tx.quantity) || 0
      if (!Number.isFinite(qty) || qty <= 0) return
      const priceValue = Number(tx.price)
      const totalCostValue = Number(tx.total_cost)
      let unitPrice = 0
      if (Number.isFinite(priceValue) && priceValue > 0) {
        unitPrice = priceValue
      } else if (Number.isFinite(totalCostValue) && totalCostValue > 0) {
        unitPrice = totalCostValue / qty
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
      const existing = agg[itemName] || { totalCost: 0, totalQty: 0 }
      existing.totalCost += unitPrice * qty
      existing.totalQty += qty
      agg[itemName] = existing
    })

    const pricing: Record<string, { avgPrice: number; totalCost: number }> = {}
    Object.entries(agg).forEach(([itemName, data]) => {
      const avgPrice = data.totalQty > 0 ? data.totalCost / data.totalQty : 0
      pricing[itemName] = { avgPrice, totalCost: data.totalCost }
    })
    return pricing
  }, [transactions])

  const hasLegacyUnassignedTransactions = useMemo(
    () => transactions.some((t) => !t.location_id),
    [transactions],
  )

  const resolveItemValue = useCallback(
    (item: InventoryItem) => {
      const avgFromInventory = Number(item.avg_price) || 0
      const totalFromInventory = Number(item.total_cost) || 0
      const quantityValue = Number(item.quantity) || 0
      const avgFromTotal = totalFromInventory > 0 && quantityValue > 0 ? totalFromInventory / quantityValue : 0
      const fallback = transactionPricing[item.name] || { avgPrice: 0, totalCost: 0 }
      const avgPrice =
        avgFromInventory > 0 ? avgFromInventory : avgFromTotal > 0 ? avgFromTotal : fallback.avgPrice || 0
      const totalValue =
        totalFromInventory > 0 ? totalFromInventory : avgPrice * quantityValue
      return { avgPrice, totalValue }
    },
    [transactionPricing],
  )

  const resolvedInventoryValue = useMemo(() => {
    return inventory.reduce((sum, item) => {
      const valueInfo = resolveItemValue(item)
      return sum + (Number(valueInfo.totalValue) || 0)
    }, 0)
  }, [inventory, resolveItemValue])

  const filteredInventoryTotals = useMemo(() => {
    const totalQuantity = filteredAndSortedInventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    const totalValue = filteredAndSortedInventory.reduce((sum, item) => {
      const valueInfo = resolveItemValue(item)
      return sum + (valueInfo.totalValue || 0)
    }, 0)
    const units = Array.from(new Set(filteredAndSortedInventory.map((item) => item.unit || "unit")))
    return {
      totalQuantity,
      totalValue,
      itemCount: filteredAndSortedInventory.length,
      unitLabel: units.length === 1 ? units[0] : "mixed units",
    }
  }, [filteredAndSortedInventory, resolveItemValue])

  const selectedInventoryDrilldownItem = useMemo(() => {
    if (!inventoryDrilldownItemName) return null
    return filteredAndSortedInventory.find((item) => item.name === inventoryDrilldownItemName) || null
  }, [filteredAndSortedInventory, inventoryDrilldownItemName])

  const selectedInventoryDrilldownValue = useMemo(() => {
    if (!selectedInventoryDrilldownItem) return null
    return resolveItemValue(selectedInventoryDrilldownItem)
  }, [selectedInventoryDrilldownItem, resolveItemValue])

  const openInventoryDrilldown = useCallback((itemName: string) => {
    setInventoryDrilldownItemName(itemName)
    setIsInventoryDrilldownOpen(true)
    setDrilldownShowAll(false)
  }, [])

  useEffect(() => {
    if (!inventoryDrilldownItemName) {
      setItemDrilldownTransactions([])
      return
    }
    setIsLoadingItemDrilldown(true)
    fetch(`${API_TRANSACTIONS}?item_type=${encodeURIComponent(inventoryDrilldownItemName)}`)
      .then((res) => res.json())
      .then((data) => setItemDrilldownTransactions(data.transactions || []))
      .catch(() => {})
      .finally(() => setIsLoadingItemDrilldown(false))
  }, [inventoryDrilldownItemName])

  const recentDrilldownTransactions = useMemo(() => {
    if (!inventoryDrilldownItemName) return []
    const sorted = [...itemDrilldownTransactions].sort((a, b) => {
      const dateA = a.transaction_date ? parseCustomDateString(a.transaction_date) : null
      const dateB = b.transaction_date ? parseCustomDateString(b.transaction_date) : null
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0)
    })
    return drilldownShowAll ? sorted : sorted.slice(0, 6)
  }, [itemDrilldownTransactions, inventoryDrilldownItemName, drilldownShowAll])

  useEffect(() => {
    if (!inventoryDrilldownItemName) return
    const stillVisible = filteredAndSortedInventory.some((item) => item.name === inventoryDrilldownItemName)
    if (!stillVisible) {
      setInventoryDrilldownItemName("")
      setIsInventoryDrilldownOpen(false)
    }
  }, [filteredAndSortedInventory, inventoryDrilldownItemName])

  const formatCount = useCallback((value: number) => formatNumber(value, 0), [])
  const totalTransactions = transactions.length
  const unassignedTransactions = transactions.filter((t) => !t.location_id).length
  const unassignedLabel = `Unassigned moves: ${formatCount(unassignedTransactions)}`
  const bagWeightValue = Number(tenantSettings.bagWeightKg || 50)
  const bagWeightLabel = `Standard bag weight: ${formatNumber(bagWeightValue, 0)} kg`
  const recentActivityLabel = `24h activity: ${formatCount(estateMetrics.recentActivity)}`

  const filterEmptyMetrics = useCallback(
    <T extends { metricValue?: number | null }>(items: T[]) => {
      if (!hideEmptyMetrics) return items
      const filtered = items.filter((item) => item.metricValue === undefined || item.metricValue === null || item.metricValue !== 0)
      return filtered.length ? filtered : items
    },
    [hideEmptyMetrics],
  )

  const heroContent: HeroContent = useMemo(() => buildHeroContent({
    activeTab,
    resolvedInventoryValue,
    resolvedProcessingWorkspaceView,
    canShowPepper,
    canShowRubber,
    enabledModuleIds: new Set(enabledModules ?? []),
    currentFiscalYearLabel: currentFiscalYear.label,
    bagWeightLabel,
    bagWeightValue,
    recentActivityLabel,
    unassignedLabel,
    loading,
    accountsTotalsLoading,
    estateMetrics,
    unassignedTransactions,
    totalTransactions,
    exceptionsSummary,
    filteredInventoryTotals,
    accountsTotals,
    processingTotals,
    dispatchHeroTotals,
    salesHeroTotals,
    otherSalesHeroTotals,
    curingHeroTotals,
    qualityHeroTotals,
    pepperHeroTotals,
    rubberHeroTotals,
    rainfallHeroTotals,
    receivablesHeroTotals,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: deps list individual object properties (e.g. accountsTotals.grandTotal) not whole objects, to avoid recomputing hero content when unrelated fields change
  } satisfies BuildHeroContentParams), [
    activeTab,
    accountsTotals.grandTotal,
    accountsTotals.laborTotal,
    accountsTotals.otherTotal,
    accountsTotalsLoading,
    bagWeightLabel,
    bagWeightValue,
    canShowPepper,
    canShowRubber,
    currentFiscalYear.label,
    curingHeroTotals.avgDryingDays,
    curingHeroTotals.avgMoistureDrop,
    curingHeroTotals.error,
    curingHeroTotals.loading,
    curingHeroTotals.totalOutputKg,
    curingHeroTotals.totalRecords,
    dispatchHeroTotals.arabicaBags,
    dispatchHeroTotals.arabicaKgs,
    dispatchHeroTotals.error,
    dispatchHeroTotals.loading,
    dispatchHeroTotals.robustaBags,
    dispatchHeroTotals.robustaKgs,
    dispatchHeroTotals.totalDispatches,
    enabledModules,
    estateMetrics.locationCount,
    estateMetrics.recentActivity,
    exceptionsSummary.count,
    filteredInventoryTotals.totalQuantity,
    filteredInventoryTotals.unitLabel,
    loading,
    processingTotals.arabicaKg,
    processingTotals.arabicaBags,
    processingTotals.loading,
    processingTotals.robustaKg,
    processingTotals.robustaBags,
    pepperHeroTotals.avgDryPercent,
    pepperHeroTotals.error,
    pepperHeroTotals.loading,
    pepperHeroTotals.totalDryKg,
    pepperHeroTotals.totalPickedKg,
    pepperHeroTotals.totalRecords,
    rubberHeroTotals.avgDrcPct,
    rubberHeroTotals.error,
    rubberHeroTotals.loading,
    rubberHeroTotals.totalLatexKg,
    rubberHeroTotals.totalSheetsKg,
    rubberHeroTotals.totalRecords,
    qualityHeroTotals.avgCupScore,
    qualityHeroTotals.avgDefects,
    qualityHeroTotals.avgOutturnPct,
    qualityHeroTotals.error,
    qualityHeroTotals.loading,
    qualityHeroTotals.totalRecords,
    rainfallHeroTotals.error,
    rainfallHeroTotals.latestDate,
    rainfallHeroTotals.loading,
    rainfallHeroTotals.totalInches,
    rainfallHeroTotals.totalRecords,
    receivablesHeroTotals.error,
    receivablesHeroTotals.loading,
    receivablesHeroTotals.totalCount,
    receivablesHeroTotals.totalInvoiced,
    receivablesHeroTotals.totalOutstanding,
    receivablesHeroTotals.totalOverdue,
    recentActivityLabel,
    resolvedProcessingWorkspaceView,
    resolvedInventoryValue,
    salesHeroTotals.arabicaBags,
    salesHeroTotals.arabicaKgs,
    salesHeroTotals.error,
    salesHeroTotals.loading,
    salesHeroTotals.robustaBags,
    salesHeroTotals.robustaKgs,
    salesHeroTotals.totalRevenue,
    salesHeroTotals.totalSales,
    otherSalesHeroTotals.error,
    otherSalesHeroTotals.loading,
    otherSalesHeroTotals.totalRevenue,
    totalTransactions,
    unassignedLabel,
    unassignedTransactions,
  ])

  const visibleHeroContent = useMemo(
    () => ({
      ...heroContent,
      chips: filterEmptyMetrics(heroContent.chips),
      stats: filterEmptyMetrics(heroContent.stats),
    }),
    [filterEmptyMetrics, heroContent],
  )

  const filteredTransactions = transactions
    .filter((t) => {
      if (!t) return false
      const passesFilterType = filterType === "All Types" || (t.item_type && t.item_type === filterType)
      if (!passesFilterType) return false
      const searchLower = transactionSearchTerm.toLowerCase()
      if (searchLower === "") return true
      const itemMatch = t.item_type ? t.item_type.toLowerCase().includes(searchLower) : false
      const notesMatch = t.notes ? t.notes.toLowerCase().includes(searchLower) : false
      const userMatch = t.user_id ? t.user_id.toLowerCase().includes(searchLower) : false
      const typeMatch = t.transaction_type ? t.transaction_type.toLowerCase().includes(searchLower) : false
      const locationMatch = resolveLocationLabel(t.location_id, t.location_name || t.location_code).toLowerCase().includes(searchLower)
      return itemMatch || notesMatch || userMatch || typeMatch || locationMatch
    })
    .sort((a, b) => {
      try {
        const dateA = a.transaction_date ? parseCustomDateString(a.transaction_date) : null
        const dateB = b.transaction_date ? parseCustomDateString(b.transaction_date) : null
        if (!dateA || !dateB) return 0
        if (transactionSortOrder === "asc") {
          return dateA.getTime() - dateB.getTime()
        }
        return dateB.getTime() - dateA.getTime()
      } catch (e) {
        console.error("Error sorting transactions by date:", e)
        return 0
      }
    })

  // pagination
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
  const validatedCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1))
  const startIndex = (validatedCurrentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTransactions.length)
  const currentTransactions = filteredTransactions.slice(startIndex, endIndex)

  useEffect(() => {
    if (currentPage !== validatedCurrentPage) {
      setCurrentPage(validatedCurrentPage)
    }
  }, [currentPage, validatedCurrentPage])

  const renderTransactionHistoryPanel = () => {
    const noTransactionsRecorded = transactions.length === 0
    const noFilteredTransactions = transactions.length > 0 && filteredTransactions.length === 0

    return (
      <div className="rounded-2xl border border-black/5 bg-white/85 p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center text-lg font-semibold text-emerald-700">
            <History className="mr-2 h-5 w-5" /> Transaction History
          </h2>
          <p className="text-xs text-muted-foreground">Inventory restocks, stock usage, and corrections across the estate.</p>
        </div>
        {showDataToolsControls && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportToCSV} className="h-10 bg-transparent">
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-grow">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search transactions..."
              value={transactionSearchTerm}
              onChange={(e) => setTransactionSearchTerm(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-40 h-10 border-stone-200 bg-white">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value="All Types">All Types</SelectItem>
              {allItemTypesForDropdown.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-full sm:w-48 h-10 border-stone-200 bg-white">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
              {(hasLegacyUnassignedTransactions || selectedLocationId === LOCATION_UNASSIGNED) && (
                <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
              )}
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name || loc.code || "Unnamed location"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleTransactionSort}
          className="flex h-10 w-full items-center justify-center gap-1 whitespace-nowrap bg-transparent sm:w-auto sm:justify-start"
        >
          {transactionSortOrder === "desc" ? (
            <>
              <SortDesc className="h-4 w-4 mr-1" /> Date: Newest First
            </>
          ) : (
            <>
              <SortAsc className="h-4 w-4 mr-1" /> Date: Oldest First
            </>
          )}
        </Button>
      </div>
      {hasLegacyUnassignedTransactions && selectedLocationId !== LOCATION_UNASSIGNED && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-emerald-700/80">
          <span>Legacy transactions without location live under {UNASSIGNED_LABEL}.</span>
          <Button
            variant="link"
            size="sm"
            onClick={() => setSelectedLocationId(LOCATION_UNASSIGNED)}
            className="h-auto p-0 text-emerald-700"
          >
            View unassigned
          </Button>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {noTransactionsRecorded && (
            <WorkflowEmptyState
              title="No inventory movements yet"
              description="Start with the first real stock arrival or usage entry. Inventory history becomes useful as soon as the first movement is recorded."
              steps={[
                hasMovementItemTypes
                  ? "Pick the real item and location that changed today."
                  : "Create the first inventory item your team actually buys or uses.",
                "Use Restock when stock arrives or you are setting the opening baseline.",
                "Use Deplete only when stock was actually used, lost, or corrected.",
              ]}
              tip="If you are just starting, one clean opening restock is enough to begin. You do not need to backfill everything on day one."
              askPrompt="How do I record my first inventory movement?"
              primaryAction={
                hasMovementItemTypes
                  ? { label: "Record movement", onClick: () => openMovementDrawer("restock") }
                  : { label: "Add first item", onClick: openNewItemDialog }
              }
              secondaryAction={hasMovementItemTypes ? { label: "Add item", onClick: openNewItemDialog } : undefined}
            />
          )}
          {noFilteredTransactions && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 py-10 text-center text-stone-400 dark:border-white/[0.06] dark:bg-white/[0.02]">
              No transactions found matching your current filters.
            </div>
          )}
          {currentTransactions.map((transaction, index) => {
            const typeValue = String(transaction.transaction_type ?? "").toLowerCase()
            const isDepleting = typeValue.includes("deplet")
            const isRestocking = typeValue.includes("restock")
            const isExpenseUsage = transaction.source_type === "expense"
            const typeLabel = isExpenseUsage
              ? transaction.source_label || "Expense Usage"
              : isDepleting
                ? "Stock Out"
                : isRestocking
                  ? "Restocking"
                  : transaction.transaction_type
            const typeClass = isExpenseUsage
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : isDepleting
              ? "bg-red-100 text-red-700 border-red-200"
              : isRestocking
                ? "bg-green-100 text-green-700 border-green-200"
                : "bg-blue-100 text-blue-700 border-blue-200"
            return (
              <div
                key={transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}
                className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-white/[0.06] dark:bg-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{transaction.item_type}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(transaction.transaction_date)}</p>
                  </div>
                  <Badge variant="outline" className={typeClass}>
                    {typeLabel}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quantity</p>
                    <p className="font-medium text-neutral-900">
                      {formatNumber(Number(transaction.quantity) || 0)} {transaction.unit}
                    </p>
                  </div>
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Location</p>
                    <p className="font-medium text-neutral-900">
                      {resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}
                    </p>
                  </div>
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Price</p>
                    <p className="font-medium text-neutral-900">
                      {transaction.price ? formatCurrency(Number(transaction.price) || 0) : "-"}
                    </p>
                  </div>
                  <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">User</p>
                    <p className="font-medium text-neutral-900">{transaction.user_id || "-"}</p>
                  </div>
                </div>
                {transaction.notes && (
                  <p className="mt-2 rounded-md border border-black/5 bg-white px-2 py-1.5 text-xs text-muted-foreground">
                    {transaction.notes}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditTransaction(transaction)}
                    className="h-10 flex-1 justify-center gap-1.5 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                  {canManageRecords && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteConfirm(transaction.id)}
                      className="h-10 flex-1 justify-center gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-stone-200 bg-emerald-700 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300 dark:border-white/[0.05]">
                <th className="py-4 px-4 text-left">Date</th>
                <th className="py-4 px-4 text-left">Location</th>
                <th className="py-4 px-4 text-left">Item Type</th>
                <th className="py-4 px-4 text-left">Quantity</th>
                <th className="py-4 px-4 text-left">Transaction</th>
                <th className="py-4 px-4 text-left">Price</th>
                <th className="py-4 px-4 text-left">Notes</th>
                <th className="py-4 px-4 text-left">User</th>
                <th className="py-4 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentTransactions.map((transaction, index) => {
                const typeValue = String(transaction.transaction_type ?? "").toLowerCase()
                const isDepleting = typeValue.includes("deplet")
                const isRestocking = typeValue.includes("restock")
                const isExpenseUsage = transaction.source_type === "expense"
                const typeLabel = isExpenseUsage
                  ? transaction.source_label || "Expense Usage"
                  : isDepleting
                    ? "Stock Out"
                    : isRestocking
                      ? "Restocking"
                      : transaction.transaction_type
                const typeClass = isExpenseUsage
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : isDepleting
                  ? "bg-red-100 text-red-700 border-red-200"
                  : isRestocking
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-blue-100 text-blue-700 border-blue-200"

                return (
                  <tr
                    key={transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}
                    className={`border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-white/[0.04] dark:hover:bg-white/[0.02] ${index % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-stone-50/50 dark:bg-white/[0.01]"}`}
                  >
                    <td className="py-4 px-4">{formatDate(transaction.transaction_date)}</td>
                    <td className="py-4 px-4">
                      {resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}
                    </td>
                    <td className="py-4 px-4">{transaction.item_type}</td>
                    <td className="py-4 px-4">
                      {formatNumber(Number(transaction.quantity) || 0)} {transaction.unit}
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant="outline" className={typeClass}>
                        {typeLabel}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      {transaction.price ? formatCurrency(Number(transaction.price) || 0) : "-"}
                    </td>
                    <td className="py-4 px-4 max-w-xs">
                      {transaction.notes ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate cursor-default">{transaction.notes}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{transaction.notes}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </td>
                    <td className="py-4 px-4">{transaction.user_id}</td>
                    <td className="py-4 px-4">
                      <TooltipProvider>
                        <div className="flex gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditTransaction(transaction)}
                                className="text-amber-600 p-2 h-auto"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit transaction</TooltipContent>
                          </Tooltip>
                          {canManageRecords && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteConfirm(transaction.id)}
                                  className="text-red-600 p-2 h-auto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete transaction</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          {noTransactionsRecorded && (
            <div className="p-4">
              <WorkflowEmptyState
                title="No inventory movements yet"
                description="Start with the first real stock arrival or usage entry. Inventory history becomes trustworthy from the first honest movement."
                steps={[
                  hasMovementItemTypes
                    ? "Choose the real item and location that changed."
                    : "Create the first item you want to track in stock.",
                  "Restock for arrivals or opening balance, then deplete only when usage actually happens.",
                  "Keep notes short and factual so later corrections are easy to explain.",
                ]}
                tip="This page is your stock audit trail. Keep it factual and it will save time later when balances need explaining."
                askPrompt="How should I start transaction history in FarmFlow?"
                primaryAction={
                  hasMovementItemTypes
                    ? { label: "Record movement", onClick: () => openMovementDrawer("restock") }
                    : { label: "Add first item", onClick: openNewItemDialog }
                }
                secondaryAction={hasMovementItemTypes ? { label: "Add item", onClick: openNewItemDialog } : undefined}
              />
            </div>
          )}
          {noFilteredTransactions && (
            <div className="text-center py-10 text-muted-foreground">
              No transactions found matching your current filters.
            </div>
          )}
        </div>
      )}

      {filteredTransactions.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min(startIndex + 1, filteredTransactions.length)} to {endIndex} of {filteredTransactions.length} transactions
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
    )
  }

  // helpers for transaction object safety
  const ensureTransactionSafety = (transaction: Transaction | null): Transaction => {
    const safeQuantity = transaction?.quantity === "" ? "" : safeGet(normalizeQuantityValue(transaction?.quantity), 0)
    return {
      item_type: String(safeGet(transaction?.item_type, "")).trim(),
      quantity: safeQuantity,
      transaction_type: safeGet(transaction?.transaction_type, "deplete"),
      notes: safeGet(transaction?.notes, ""),
      transaction_date: safeGet(transaction?.transaction_date, createDefaultTransaction().transaction_date),
      user_id: safeGet(transaction?.user_id, user?.username || "unknown"),
      price: safeGet(Number(transaction?.price), 0),
      total_cost: safeGet(Number(transaction?.total_cost), 0),
      unit: safeGet(transaction?.unit, "kg"),
      location_id: transaction?.location_id ?? null,
      location_name: transaction?.location_name ?? undefined,
      location_code: transaction?.location_code ?? undefined,
      id: transaction?.id,
    } as Transaction
  }

  const handleNewTransactionChange = (field: keyof Transaction, value: any) => {
    setNewTransaction((prev) => {
      const base = prev ? ensureTransactionSafety(prev) : createDefaultTransaction()
      const updated = { ...base, [field]: value } as Transaction
      // update derived fields
      updated.total_cost = (Number(updated.price) || 0) * (Number(updated.quantity) || 0)
      return updated
    })
  }

  const handleFieldChange = (field: keyof Transaction, value: any) => {
    handleNewTransactionChange(field, value)
  }

  // POST a transaction to the API
  const submitTransaction = async (sourceTransaction: Transaction, locationOverride?: string | null) => {
    const tx = ensureTransactionSafety(sourceTransaction)
    if (!tx.item_type || !tx.transaction_type) {
      toast({ title: "Missing fields", description: "Please select item and transaction type.", variant: "destructive" })
      return
    }
    const normalizedQty = normalizeQuantityValue(tx.quantity)
    if (!normalizedQty || normalizedQty <= 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be a positive number.", variant: "destructive" })
      return
    }
    tx.quantity = normalizedQty
    const normalizedTransactionDate = buildTransactionDateFromInput(transactionDateToInputValue(tx.transaction_date))
    if (!normalizedTransactionDate) {
      toast({
        title: "Movement date required",
        description: "Select the date when this movement happened.",
        variant: "destructive",
      })
      return
    }
    tx.transaction_date = normalizedTransactionDate
    tx.unit = resolveInventoryUnitForItemType(tx.item_type, tx.unit)
    tx.total_cost = (Number(tx.price) || 0) * normalizedQty

    const locationSource = locationOverride ?? transactionLocationId
    const normalizedLocationSource = typeof locationSource === "string" ? locationSource.trim() : ""
    const locationValue =
      normalizedLocationSource && normalizedLocationSource !== LOCATION_UNASSIGNED && normalizedLocationSource !== LOCATION_ALL
        ? normalizedLocationSource
        : null

    try {
      const res = await fetch(API_TRANSACTIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tx, location_id: locationValue }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to record transaction")
      }
      toast({ title: "Transaction recorded", description: "Transaction saved successfully.", variant: "default" })
      // refresh after adding
      await refreshData(true)
      // reset
      setNewTransaction(createDefaultTransaction())
      setLastTransactionWriteFailure(null)
    } catch (error: any) {
      console.error("Record transaction error:", error)
      const failureMessage = error.message || "Try again"
      setLastTransactionWriteFailure({
        message: failureMessage,
        occurredAt: Date.now(),
        locationId: locationValue,
        transaction: tx,
      })
      toast({ title: "Transaction failed", description: failureMessage, variant: "destructive" })
    }
  }

  const handleRecordTransaction = async () => {
    const tx = ensureTransactionSafety(newTransaction)
    await submitTransaction(tx)
  }

  const handleRetryTransactionWrite = () => {
    if (!lastTransactionWriteFailure) return
    void submitTransaction(lastTransactionWriteFailure.transaction, lastTransactionWriteFailure.locationId)
  }

  // Edit / Delete flows (simplified; use your route shapes as needed)
  const handleEditTransaction = (transaction: Transaction) => {
    const safe = ensureTransactionSafety(transaction)
    const normalizedType = String(safe.transaction_type || "").toLowerCase().includes("restock") ? "restock" : "deplete"
    setEditingTransaction({ ...safe, transaction_type: normalizedType })
    setIsEditDialogOpen(true)
  }

  const handleEditTransactionChange = (field: keyof Transaction, value: any) => {
    setEditingTransaction((prev) => {
      if (!prev) return prev
      const updated = { ...prev, [field]: value } as Transaction
      const qty = Number(updated.quantity) || 0
      const price = Number(updated.price) || 0
      updated.total_cost = qty * price
      return updated
    })
  }

  const handleUpdateTransaction = async () => {
    if (!editingTransaction) return
    const tx = ensureTransactionSafety(editingTransaction)
    if (!tx.item_type || !tx.transaction_type) {
      toast({ title: "Missing fields", description: "Item type and transaction type are required.", variant: "destructive" })
      return
    }
    const normalizedQty = normalizeQuantityValue(tx.quantity)
    if (!normalizedQty || normalizedQty <= 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be a positive number.", variant: "destructive" })
      return
    }
    tx.quantity = normalizedQty
    tx.total_cost = (Number(tx.price) || 0) * normalizedQty

    setIsSavingTransactionEdit(true)
    try {
      const res = await fetch("/api/transactions-neon/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tx, location_id: tx.location_id ?? null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update transaction")
      }
      toast({ title: "Transaction updated", description: "Changes saved successfully.", variant: "default" })
      await refreshData(true)
      setIsEditDialogOpen(false)
      setEditingTransaction(null)
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setIsSavingTransactionEdit(false)
    }
  }

  const handleDeleteConfirm = (id?: number) => {
    if (!id) return
    setTransactionToDelete(id)
    setDeleteConfirmDialogOpen(true)
  }

  const handleDeleteTransaction = async () => {
    if (transactionToDelete == null) return
    try {
      const res = await fetch(`${API_TRANSACTIONS}/${transactionToDelete}`, { method: "DELETE" })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        const fallback =
          res.status === 401 || res.status === 403 ? "Not authorized to delete this transaction." : "Delete failed"
        throw new Error(json?.message || fallback || text)
      }
      toast({ title: "Transaction deleted", description: "Transaction removed.", variant: "default" })
      await refreshData(true)
    } catch (error: any) {
      toast({ title: "Deletion failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setDeleteConfirmDialogOpen(false)
      setTransactionToDelete(null)
    }
  }

  const handleOpenInventoryEdit = (item: InventoryItem) => {
    if (selectedLocationId === LOCATION_ALL) {
      toast({
        title: "Select a location",
        description: "Choose a specific location before adjusting inventory quantities.",
        variant: "destructive",
      })
      return
    }
    setEditingInventoryItem(item)
    setInventoryEditForm({
      name: item.name || "",
      unit: item.unit || "kg",
      quantity: Number(item.quantity ?? 0).toString(),
    })
    const defaultLocation =
      selectedLocationId !== LOCATION_ALL
        ? selectedLocationId
        : transactionLocationId !== LOCATION_ALL
          ? transactionLocationId
          : LOCATION_UNASSIGNED
    setInventoryEditLocationId(defaultLocation)
    setIsInventoryEditDialogOpen(true)
  }

  const handleSaveInventoryEdit = async () => {
    if (!editingInventoryItem) return
    const originalName = editingInventoryItem.name
    const originalUnit = editingInventoryItem.unit || "kg"
    const originalQty = Number(editingInventoryItem.quantity) || 0
    const nextName = inventoryEditForm.name.trim()
    const nextUnit = inventoryEditForm.unit.trim() || originalUnit
    const nextQty = Number(inventoryEditForm.quantity)

    if (!nextName) {
      toast({ title: "Missing name", description: "Item name is required.", variant: "destructive" })
      return
    }
    if (Number.isNaN(nextQty) || nextQty < 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be 0 or more.", variant: "destructive" })
      return
    }

    setIsSavingInventoryEdit(true)
    try {
      if (nextName !== originalName || nextUnit !== originalUnit) {
        const res = await fetch(API_INVENTORY, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_type: originalName,
            new_item_type: nextName,
            unit: nextUnit,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Failed to update item")
        }
      }

      const adjustmentLocationId =
        inventoryEditLocationId !== LOCATION_UNASSIGNED && inventoryEditLocationId !== LOCATION_ALL
          ? inventoryEditLocationId
          : null

      const delta = Number((nextQty - originalQty).toFixed(2))
      if (Math.abs(delta) > 0.0001) {
        const res = await fetch(API_TRANSACTIONS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_type: nextName,
            quantity: Math.abs(delta),
            transaction_type: delta > 0 ? "restock" : "deplete",
            notes: `Inventory adjustment (${originalQty} -> ${nextQty} ${nextUnit})`,
            user_id: user?.username || "system",
            price: 0,
            location_id: adjustmentLocationId,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Failed to adjust quantity")
        }
      }

      toast({ title: "Inventory updated", description: "Changes saved successfully.", variant: "default" })
      await refreshData(true)
      setIsInventoryEditDialogOpen(false)
      setEditingInventoryItem(null)
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setIsSavingInventoryEdit(false)
    }
  }

  const handleDeleteInventoryItem = async (itemToDelete: InventoryItem) => {
    if (!tenantId) return
    const deleteAllLocations = selectedLocationId === LOCATION_ALL
    const confirmMessage = deleteAllLocations
      ? `Delete "${itemToDelete.name}" across all locations? This removes it from inventory and logs depletion.`
      : `Delete "${itemToDelete.name}" from ${selectedLocationLabel}? This removes it from inventory and logs depletion.`
    if (!confirm(confirmMessage)) return
    const deleteLocationId = deleteAllLocations ? "all" : selectedLocationId
    try {
      const res = await fetch(API_INVENTORY, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: itemToDelete.name,
          location_id: deleteLocationId,
          scope: deleteAllLocations ? "all" : "single",
        }),
      })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        const fallback =
          res.status === 401 || res.status === 403 ? "Not authorized to delete inventory." : "Failed to delete item"
        throw new Error(json?.message || fallback || text)
      }
      toast({ title: "Item deleted", description: "Inventory updated.", variant: "default" })
      await refreshData(true)
    } catch (err: any) {
      console.error("delete inventory item error", err)
      toast({
        title: "Failed to delete item",
        description: err.message || "Please try again",
        variant: "destructive",
      })
    }
  }

  const openNewItemDialog = () => {
    const defaultLocation =
      selectedLocationId !== LOCATION_ALL ? selectedLocationId : transactionLocationId !== LOCATION_ALL ? transactionLocationId : LOCATION_UNASSIGNED
    setNewItemForm((prev) => ({
      ...prev,
      locationId: defaultLocation,
    }))
    setIsNewItemDialogOpen(true)
  }

  const openMovementDrawer = (transactionType?: "restock" | "deplete") => {
    if (selectedLocationId !== LOCATION_ALL) {
      setTransactionLocationId(selectedLocationId)
    }
    if (transactionType) {
      setNewTransaction((prev) => {
        const base = prev ? ensureTransactionSafety(prev) : createDefaultTransaction()
        return { ...base, transaction_type: transactionType }
      })
    }
    setIsMovementDrawerOpen(true)
  }

  const resetNewItemForm = () => {
    setNewItemForm({
      name: "",
      unit: "kg",
      quantity: "",
      price: "",
      notes: "",
      locationId: LOCATION_UNASSIGNED,
    })
  }

  const handleCreateNewItem = async () => {
    const itemName = newItemForm.name.trim()
    const unit = newItemForm.unit.trim() || "kg"
    const quantityValue = Number(newItemForm.quantity || 0)
    const priceValue = Number(newItemForm.price || 0)
    const notes = newItemForm.notes.trim()

    if (!itemName) {
      toast({ title: "Missing name", description: "Item name is required.", variant: "destructive" })
      return
    }
    if (Number.isNaN(quantityValue) || quantityValue < 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be 0 or more.", variant: "destructive" })
      return
    }
    if (Number.isNaN(priceValue) || priceValue < 0) {
      toast({ title: "Invalid price", description: "Price must be 0 or more.", variant: "destructive" })
      return
    }

    const locationValue =
      newItemForm.locationId !== LOCATION_UNASSIGNED && newItemForm.locationId !== LOCATION_ALL
        ? newItemForm.locationId
        : null

    setIsSavingNewItem(true)
    try {
      const res = await fetch(API_INVENTORY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: itemName,
          quantity: quantityValue,
          unit,
          price: priceValue,
          notes: notes || undefined,
          user_id: user?.username || "system",
          location_id: locationValue,
        }),
      })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || text || "Failed to add item")
      }
      toast({ title: "Item added", description: "Inventory item created successfully.", variant: "default" })
      await refreshData(true)
      setIsNewItemDialogOpen(false)
      resetNewItemForm()
    } catch (error: any) {
      toast({ title: "Add failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setIsSavingNewItem(false)
    }
  }

  // CSV export (transactions & inventory)
  const exportInventoryToCSV = () => {
    const headers = ["Item Name", "Quantity", "Unit", "Value"]
    const rows = filteredAndSortedInventory.map((item) => {
      const valueInfo = resolveItemValue(item)
      const itemValue = valueInfo.totalValue || 0
      return [item.name, String(item.quantity), item.unit || "kg", `₹${itemValue.toFixed(2)}`]
    })
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportToCSV = () => {
    const headers = ["Date", "Location", "Item Type", "Quantity", "Unit Price", "Total Cost", "Transaction Type", "Notes", "User"]
    const rows = filteredTransactions.map((t) => [
      t.transaction_date ?? "",
      resolveLocationLabel(t.location_id, t.location_name || t.location_code),
      t.item_type ?? "",
      `${t.quantity} ${t.unit ?? ""}`,
      t.price !== undefined ? `₹${Number(t.price).toFixed(2)}` : "-",
      t.total_cost !== undefined ? `₹${Number(t.total_cost).toFixed(2)}` : "-",
      t.transaction_type ?? "",
      (t.notes ?? "").replace(/\n/g, " "),
      t.user_id ?? "",
    ])
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  useEffect(() => {
    const defaultDataset = TAB_DEFAULT_EXPORT_DATASET[activeTab]
    if (defaultDataset && defaultDataset !== dataToolsDataset) {
      setDataToolsDataset(defaultDataset)
    }
  }, [activeTab, dataToolsDataset])

  const selectedDataTools = useMemo(
    () => getDataToolsSelection(dataToolsDataset),
    [dataToolsDataset],
  )
  const selectedDataToolsConfig = selectedDataTools.exportConfig
  const selectedDataToolsTemplateConfig = selectedDataTools.templateConfig
  const dataToolsImportHref = selectedDataTools.importHref
  const lastOpsExportFailureLabel = useMemo(() => {
    if (!lastOpsExportFailure) return ""
    return getDataToolsSelection(lastOpsExportFailure.dataset).exportConfig.label
  }, [lastOpsExportFailure])

  const handleDownloadDataTemplate = useCallback(() => {
    if (!selectedDataToolsTemplateConfig) {
      toast({
        title: "Template unavailable",
        description: "This export dataset does not have an import template.",
      })
      return
    }
    downloadDataToolsTemplate(selectedDataToolsTemplateConfig)
    toast({
      title: "Template downloaded",
      description: `${selectedDataToolsTemplateConfig.label} template is ready.`,
    })
  }, [selectedDataToolsTemplateConfig])

  const handleDataToolsExport = useCallback(async (format: "csv" | "xlsx" = "csv") => {
    setIsExportingDataTools(true)
    try {
      const exportResult = await exportOpsCsv({
        dataset: dataToolsDataset,
        exportConfig: selectedDataToolsConfig,
        format,
        startDate: currentFiscalYear.startDate,
        endDate: currentFiscalYear.endDate,
        isPreviewMode,
        previewTenantId,
      })
      const { wasTruncated, maxRows, returnedRows } = exportResult
      posthog.capture("ops_export_downloaded", {
        dataset: dataToolsDataset,
        format,
        truncated: wasTruncated,
        returned_rows: returnedRows,
        max_rows: maxRows,
        source_tab: activeTab,
      })
      if (wasTruncated) {
        toast({
          title: "Export capped at row limit",
          description: `${selectedDataToolsConfig.label} ${format.toUpperCase()} exported ${returnedRows || maxRows} rows (limit ${maxRows || "configured"}). Narrow date range for full data.`,
        })
      } else {
        toast({
          title: "Export ready",
          description: `${selectedDataToolsConfig.label} ${format.toUpperCase()} downloaded.`,
        })
      }
      setLastOpsExportFailure(null)
    } catch (error: unknown) {
      const failureMessage = error instanceof Error ? error.message : "Unable to export now."
      posthog.capture("ops_export_failed", {
        dataset: dataToolsDataset,
        format,
        source_tab: activeTab,
        message: failureMessage,
      })
      setLastOpsExportFailure({
        dataset: dataToolsDataset,
        message: failureMessage,
        occurredAt: Date.now(),
      })
      toast({
        title: "Export failed",
        description: failureMessage,
        variant: "destructive",
      })
    } finally {
      setIsExportingDataTools(false)
    }
  }, [
    currentFiscalYear.endDate,
    currentFiscalYear.startDate,
    dataToolsDataset,
    isPreviewMode,
    previewTenantId,
    activeTab,
    selectedDataToolsConfig,
  ])

  const handleRetryLastOpsExport = useCallback(() => {
    void handleDataToolsExport("csv")
  }, [handleDataToolsExport])

  const handleOpenItemDrilldownHistory = () => {
    if (!inventoryDrilldownItemName) return
    setDrilldownShowAll(true)
  }

  // AI Analysis trigger (calls your AI API route)
  const generateAIAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalysisError("")
    setAiAnalysis(null)
    try {
      const payload = { inventory, transactions: transactions.slice(0, 50), laborDeployments: laborDeployments.slice(0, 50) }
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?.message || text || "AI analysis could not answer right now.")
      }
      setAiAnalysis(String(json.analysis || "No analysis returned"))
    } catch (err: any) {
      console.error("AI Analysis error:", err)
      setAnalysisError(err.message || "Failed to generate AI analysis")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const showOperationsTabs =
    canShowInventoryWorkspace ||
    canShowProcessingWorkspace ||
    canShowCuring ||
    canShowQuality ||
    canShowDispatch ||
    canShowSalesWorkspace ||
    canShowRainfallSection
  const showFinanceTabs =
    canShowAccounts || canShowBalanceSheet || canShowReceivables || canShowBilling
  const showInsightsTabs =
    canShowSeason ||
    canShowYieldForecast ||
    canShowActivityLog ||
    canShowDocuments ||
    canShowJournal ||
    canShowResources ||
    canShowPlantHealth ||
    canShowAiAnalysis ||
    canShowNews

  const operationsTabItems = useMemo(
    () =>
      [
        canShowProcessingWorkspace
          ? {
              value: "processing",
              label: processingWorkspaceLabel,
              icon: processingWorkspaceIcon,
              subtabs: [
                canShowProcessing && "Coffee Pulping",
                canShowPepper && "Pepper Processing",
                canShowRubber && "Rubber Tapping",
              ].filter(Boolean) as string[],
            }
          : null,
        canShowCuring ? { value: "curing", label: "Curing & Drying", icon: Factory } : null,
        canShowQuality ? { value: "quality", label: "Quality Grading", icon: CheckCircle2 } : null,
        canShowDispatch ? { value: "dispatch", label: "Dispatch", icon: Truck } : null,
        canShowSalesWorkspace
          ? {
              value: "sales",
              label: "Sales",
              icon: TrendingUp,
              subtabs:
                canShowSales && canShowOtherSales
                  ? ["Coffee Sales", "Other Sales"]
                  : canShowSales
                    ? ["Coffee Sales"]
                    : ["Other Sales"],
            }
          : null,
        // Inventory handles stock movement and sits with the core operations tabs.
        canShowInventoryWorkspace
          ? {
              value: "inventory",
              label: "Stock & Inventory",
              icon: List,
              subtabs: showTransactionHistory ? ["Stock Levels", "Transaction History"] : ["Stock Levels"],
            }
          : null,
        canShowRainfallSection
          ? {
              value: "rainfall",
              label: "Rain & Weather",
              icon: CloudRain,
              subtabs:
                canShowRainfall && canShowWeather
                  ? ["Rainfall Logs", "Forecast"]
                  : canShowWeather
                    ? ["Forecast", "Estate Coordinates"]
                    : ["Rainfall Logs"],
            }
          : null,
      ].filter(Boolean) as Array<{
        value: string
        label: string
        icon: React.ComponentType<{ className?: string }>
        subtabs?: string[]
      }>,
    [
      canShowCuring,
      canShowDispatch,
      canShowInventoryWorkspace,
      canShowOtherSales,
      canShowPepper,
      canShowProcessingWorkspace,
      canShowQuality,
      canShowProcessing,
      canShowRainfall,
      canShowRainfallSection,
      canShowRubber,
      canShowSales,
      canShowSalesWorkspace,
      canShowWeather,
      processingWorkspaceIcon,
      processingWorkspaceLabel,
      showTransactionHistory,
    ],
  )

  const financeTabItems = useMemo(
    () =>
      [
        canShowAccounts
          ? {
              value: "accounts",
              label: "Accounts",
              icon: Users,
              subtabs: ["Daily Labour", "Expenses", "Attendance", "Cost Codes"],
            }
          : null,
        canShowBalanceSheet ? { value: "balance-sheet", label: "Live Balance", icon: Scale } : null,
        canShowSeasonPl ? { value: "season-pl", label: "P&L Report", icon: TrendingUp } : null,
        canShowReceivables ? { value: "receivables", label: "Receivables", icon: Receipt } : null,
        canShowBilling ? { value: "billing", label: "Billing", icon: Receipt } : null,
      ].filter(Boolean) as Array<{
        value: string
        label: string
        icon: React.ComponentType<{ className?: string }>
        subtabs?: string[]
      }>,
    [canShowAccounts, canShowBalanceSheet, canShowBilling, canShowReceivables, canShowSeasonPl],
  )

  const insightsTabItems = useMemo(
    () =>
      [
        canShowSeason ? { value: "season", label: "Season Summary", icon: BarChart3 } : null,
        canShowYieldForecast ? { value: "yield-forecast", label: "Harvest Forecast", icon: TrendingUp } : null,
        canShowPlantHealth ? { value: "plant-health", label: "Crop Health", icon: Leaf } : null,
        canShowAiAnalysis ? { value: "ai-analysis", label: "AI Insights", icon: Brain } : null,
        canShowNews ? { value: "news", label: "Market News", icon: Newspaper } : null,
        canShowDocuments ? { value: "documents", label: "Documents", icon: FileText } : null,
        canShowJournal ? { value: "journal", label: "Journal", icon: NotebookPen } : null,
        canShowResources ? { value: "resources", label: "Resources", icon: BookOpen } : null,
        canShowActivityLog ? { value: "activity-log", label: "Audit Log", icon: History } : null,
      ].filter(Boolean) as Array<{
        value: string
        label: string
        icon: React.ComponentType<{ className?: string }>
        subtabs?: string[]
      }>,
    [
      canShowActivityLog,
      canShowAiAnalysis,
      canShowDocuments,
      canShowJournal,
      canShowNews,
      canShowPlantHealth,
      canShowResources,
      canShowSeason,
      canShowYieldForecast,
    ],
  )

  useEffect(() => {
    if (!tenantId || !canShowIntelligence) {
      setIntelligenceBrief(null)
      setIntelligenceError(null)
      return
    }
    if (!shouldLoadHomeMetrics) return
    if (intelligenceBriefLoadedRef.current === tenantId) return
    let ignore = false

    const loadIntelligenceBrief = async () => {
      setIntelligenceLoading(true)
      setIntelligenceError(null)
      try {
        const params = new URLSearchParams({
          startDate: currentFiscalYear.startDate,
          endDate: currentFiscalYear.endDate,
        })
        const response = await fetch(`/api/intelligence-brief?${params.toString()}`, { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load intelligence brief")
        }
        if (!ignore) {
          const brief = data as IntelligenceBrief
          setIntelligenceBrief(brief)
          const highlightCount = Array.isArray(brief.highlights) ? brief.highlights.length : 0
          const actionCount = Array.isArray(brief.actions) ? brief.actions.length : 0
          const hasInsight = highlightCount > 0 || actionCount > 0 || Boolean(brief.reconciliation)
          if (!hasTrackedInsightViewRef.current && hasInsight) {
            posthog.capture("funnel_first_dashboard_insight_viewed", {
              source: "intelligence-brief",
              highlight_count: highlightCount,
              action_count: actionCount,
              has_reconciliation: Boolean(brief.reconciliation),
              fiscal_year_start: currentFiscalYear.startDate,
              fiscal_year_end: currentFiscalYear.endDate,
              tenant_id: tenantId || "global",
              role: effectiveRole || "unknown",
            })
            hasTrackedInsightViewRef.current = true
          }
        }
      } catch (error: any) {
        if (!ignore) {
          setIntelligenceBrief(null)
          setIntelligenceError(error?.message || "Failed to load intelligence brief")
        }
      } finally {
        if (!ignore) {
          setIntelligenceLoading(false)
          intelligenceBriefLoadedRef.current = tenantId
        }
      }
    }

    loadIntelligenceBrief()
    return () => {
      ignore = true
    }
  }, [canShowIntelligence, currentFiscalYear.endDate, currentFiscalYear.startDate, effectiveRole, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!tenantId || !shouldLoadHomeMetrics) return
    if (activityStreakLoadedRef.current === tenantId) return
    activityStreakLoadedRef.current = tenantId
    fetch("/api/activity-streak", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.streak > 0) setActivityStreak(d.streak) })
      .catch(() => {})
  }, [shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!canShowAiAnalysis || !shouldLoadHomeMetrics) return
    if (proactiveInsightsLoadedRef.current === tenantId) return
    let ignore = false
    const loadProactiveInsights = async () => {
      setProactiveInsightsLoading(true)
      setProactiveInsightsError(null)
      try {
        const response = await fetch("/api/ai-proactive-insights", { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to load insights")
        if (!ignore) setProactiveInsights(Array.isArray(data.insights) ? data.insights : [])
      } catch (error: any) {
        if (!ignore) setProactiveInsightsError(error?.message || "Failed to load insights")
      } finally {
        if (!ignore) {
          setProactiveInsightsLoading(false)
          proactiveInsightsLoadedRef.current = tenantId
        }
      }
    }
    loadProactiveInsights()
    return () => { ignore = true }
  }, [canShowAiAnalysis, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!canShowAiAnalysis || !shouldLoadHomeMetrics) return
    if (seasonCompareLoadedRef.current === tenantId) return
    let ignore = false
    const loadSeasonCompare = async () => {
      setSeasonCompareLoading(true)
      setSeasonCompareError(null)
      try {
        const response = await fetch("/api/ai-season-compare", { cache: "no-store" })
        const { json, text } = await parseJsonResponse(response)
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || json?.message || text || "Season comparison is temporarily unavailable.")
        }
        if (!ignore) {
          setSeasonCompareNarrative(json.narrative || null)
          setSeasonCompareFYLabels(json.currentFY && json.prevFY ? { curr: json.currentFY, prev: json.prevFY } : null)
        }
      } catch (error: any) {
        if (!ignore) {
          setSeasonCompareNarrative(null)
          setSeasonCompareFYLabels(null)
          setSeasonCompareError(error?.message || "Season comparison is temporarily unavailable.")
        }
      } finally {
        if (!ignore) {
          setSeasonCompareLoading(false)
          seasonCompareLoadedRef.current = tenantId
        }
      }
    }
    loadSeasonCompare()
    return () => { ignore = true }
  }, [canShowAiAnalysis, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!shouldLoadHomeMetrics) return
    if (recentActivityLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setRecentActivityLoading(true)
      try {
        const res = await fetch("/api/recent-activity", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!ignore && data?.success && Array.isArray(data.entries)) {
          setRecentActivity(data.entries)
        }
      } catch {
        // silent — feed just stays hidden
      } finally {
        if (!ignore) {
          setRecentActivityLoading(false)
          recentActivityLoadedRef.current = tenantId
        }
      }
    }
    load()
    return () => { ignore = true }
  }, [shouldLoadHomeMetrics, tenantId])

  const commandStripItems = useMemo(() => {
    const processingTotalKg = processingTotals.arabicaKg + processingTotals.robustaKg
    const dispatchTotalBags = dispatchHeroTotals.arabicaBags + dispatchHeroTotals.robustaBags
    const dispatchTotalKgs = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
    const salesTotalKgs = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
    const dispatchToSalesRate = dispatchTotalKgs > 0 ? (salesTotalKgs / dispatchTotalKgs) * 100 : 0

    return [
      {
        id: "processing-strip",
        tab: "processing",
        visible: canShowProcessing,
        label: "Pulping Output",
        value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotalKg, 0)} kg`,
        subValue: processingTotals.loading
          ? "Updating totals"
          : `Arabica ${formatNumber(processingTotals.arabicaKg, 0)} kg · Robusta ${formatNumber(processingTotals.robustaKg, 0)} kg`,
      },
      {
        id: "dispatch-strip",
        tab: "dispatch",
        visible: canShowDispatch,
        label: "Dispatch Received",
        value: dispatchHeroTotals.loading ? "Loading..." : `${formatNumber(dispatchTotalKgs, 0)} kg`,
        subValue: dispatchHeroTotals.loading
          ? "Updating totals"
          : `${formatNumber(dispatchTotalBags, 0)} bags · ${formatCount(dispatchHeroTotals.totalDispatches)} entries`,
      },
      {
        id: "sales-strip",
        tab: "sales",
        visible: canShowSales,
        label: "Sales Sold",
        value: salesHeroTotals.loading ? "Loading..." : `${formatNumber(salesTotalKgs, 0)} kg`,
        subValue: salesHeroTotals.loading
          ? "Updating totals"
          : `${formatNumber(dispatchToSalesRate, 0)}% of dispatch-received stock sold`,
      },
    ]
  }, [
    canShowDispatch,
    canShowProcessing,
    canShowSales,
    dispatchHeroTotals.arabicaBags,
    dispatchHeroTotals.arabicaKgs,
    dispatchHeroTotals.loading,
    dispatchHeroTotals.robustaBags,
    dispatchHeroTotals.robustaKgs,
    dispatchHeroTotals.totalDispatches,
    formatCount,
    processingTotals.arabicaKg,
    processingTotals.loading,
    processingTotals.robustaKg,
    salesHeroTotals.arabicaKgs,
    salesHeroTotals.loading,
    salesHeroTotals.robustaKgs,
  ])
  const visibleCommandStripItems = commandStripItems.filter((item) => item.visible)
  const dispatchReceivedKgsTotal = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
  const salesSoldKgsTotal = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
  const saleableCoffeeKgs = Math.max(0, dispatchReceivedKgsTotal - salesSoldKgsTotal)
  const overdrawnCoffeeKgs = Math.max(0, salesSoldKgsTotal - dispatchReceivedKgsTotal)
  const resolvedInventoryWorkspaceView: InventoryWorkspaceView =
    !canShowInventory && showTransactionHistory ? "transactions" : inventoryWorkspaceView
  const coffeeRevenueTotal = salesHeroTotals.totalRevenue
  const otherRevenueTotal = otherSalesHeroTotals.totalRevenue
  const totalRevenueAmount = coffeeRevenueTotal + otherRevenueTotal
  const revenueTotalsLoading = salesHeroTotals.loading || otherSalesHeroTotals.loading
  const revenueTotalsError = salesHeroTotals.error || otherSalesHeroTotals.error
  const reconciliationStatusLabel = overdrawnCoffeeKgs > 0 ? "Overdrawn" : "Healthy"
  const reconciliationStatusTone =
    overdrawnCoffeeKgs > 0 ? "text-rose-700 border-rose-200 bg-rose-50/70" : "text-emerald-700 border-emerald-200 bg-emerald-50/70"
  const intelligenceHighlights = useMemo(() => intelligenceBrief?.highlights || [], [intelligenceBrief])
  const intelligenceInsights = useMemo(() => intelligenceBrief?.insights || [], [intelligenceBrief])
  const intelligenceActions = useMemo(() => intelligenceBrief?.actions || [], [intelligenceBrief])
  const intelligenceTopCostCode = intelligenceBrief?.accountsPatterns?.topCostCodes?.[0] || null
  const intelligenceTopFrequencyCode = intelligenceBrief?.accountsPatterns?.mostFrequentCodes?.[0] || null
  const visibleTabs = useMemo(() => {
    const tabs: string[] = ["home"]
    if (canShowInventoryWorkspace) tabs.push("inventory")
    if (canShowAccounts) tabs.push("accounts")
    if (canShowBalanceSheet) tabs.push("balance-sheet")
    if (canShowSeasonPl) tabs.push("season-pl")
    if (canShowProcessingWorkspace) tabs.push("processing")
    if (canShowDispatch) tabs.push("dispatch")
    if (canShowSalesWorkspace) tabs.push("sales")
    if (canShowCuring) tabs.push("curing")
    if (canShowQuality) tabs.push("quality")
    if (canShowSeason) tabs.push("season")
    if (canShowYieldForecast) tabs.push("yield-forecast")
    if (canShowActivityLog) tabs.push("activity-log")
    if (canShowRainfallSection) tabs.push("rainfall")
    if (canShowDocuments) tabs.push("documents")
    if (canShowJournal) tabs.push("journal")
    if (canShowResources) tabs.push("resources")
    if (canShowPlantHealth) tabs.push("plant-health")
    if (canShowAiAnalysis) tabs.push("ai-analysis")
    if (canShowNews) tabs.push("news")
    if (canShowMarketPricing) tabs.push("market-pricing")
    if (canShowCompliance) tabs.push("compliance")
    if (canShowReceivables) tabs.push("receivables")
    if (canShowBilling) tabs.push("billing")
    // Apply season-aware ordering so harvest tabs surface in Oct-Mar,
    // maintenance tabs (accounts, rainfall, inventory) lead in off-season
    return getSeasonAwareTabOrder(tabs)
  }, [
    canShowAccounts,
    canShowBalanceSheet,
    canShowAiAnalysis,
    canShowBilling,
    canShowDispatch,
    canShowDocuments,
    canShowActivityLog,
    canShowInventoryWorkspace,
    canShowJournal,
    canShowPlantHealth,
    canShowResources,
    canShowNews,
    canShowProcessingWorkspace,
    canShowCuring,
    canShowQuality,
    canShowRainfallSection,
    canShowReceivables,
    canShowSalesWorkspace,
    canShowSeason,
    canShowYieldForecast,
    canShowMarketPricing,
    canShowCompliance,
    canShowSeasonPl,
  ])
  const markTabAsLoaded = useCallback((tab: string) => {
    setLoadedTabs((previousTabs) => (previousTabs.includes(tab) ? previousTabs : [...previousTabs, tab]))
  }, [])
  const isTabLoaded = useCallback(
    (tab: string) => {
      return activeTab === tab || loadedTabs.includes(tab)
    },
    [activeTab, loadedTabs],
  )
  useEffect(() => {
    markTabAsLoaded(activeTab)
  }, [activeTab, markTabAsLoaded])
  const showFirstVisitTabLoader = useCallback((tab: string) => {
    if (visitedTabsRef.current.has(tab)) return
    visitedTabsRef.current.add(tab)
    setShowTabSwitchLoader(true)
    setTimeout(() => setShowTabSwitchLoader(false), 400)
  }, [])
  useEffect(() => {
    setLoadedTabs((previousTabs) => {
      const filteredTabs = previousTabs.filter(
        (tab) => tab === DASHBOARD_LAUNCHER_TAB || tab === "home" || visibleTabs.includes(tab),
      )
      return filteredTabs.length === previousTabs.length ? previousTabs : filteredTabs
    })
  }, [visibleTabs])
  const tabMeta = useMemo(
    () =>
      ({
        home: { label: "Dashboard", icon: Home },
        inventory: { label: "Stock & Inputs", icon: List },
        processing: { label: processingWorkspaceLabel, icon: processingWorkspaceIcon },
        dispatch: { label: "Dispatch", icon: Truck },
        sales: { label: "Sales", icon: TrendingUp },
        pepper: { label: "Pepper", icon: Leaf },
        rubber: { label: "Rubber", icon: Leaf },
        accounts: { label: "Labour & Costs", icon: Users },
        "balance-sheet": { label: "Financial Summary", icon: Scale },
        "season-pl": { label: "Profit & Loss", icon: TrendingUp },
        receivables: { label: "Money Owed", icon: Receipt },
        billing: { label: "Billing", icon: Receipt },
        season: { label: "This Season", icon: BarChart3 },
        "yield-forecast": { label: "Harvest Forecast", icon: TrendingUp },
        "activity-log": { label: "Activity Log", icon: History },
        rainfall: { label: "Rain & Weather", icon: CloudRain },
        documents: { label: "Documents", icon: FileText },
        journal: { label: "All Transactions", icon: NotebookPen },
        resources: { label: "Resources", icon: BookOpen },
        "plant-health": { label: "Crop Health", icon: Leaf },
        "ai-analysis": { label: "AI Insights", icon: Brain },
        news: { label: "Market News", icon: Newspaper },
        curing: { label: "Curing & Drying", icon: Factory },
        quality: { label: "Quality Grading", icon: CheckCircle2 },
        "market-pricing": { label: "Market Rates", icon: TrendingUp },
        compliance: { label: "Compliance", icon: ShieldCheck },
        picking: { label: "Picking Log", icon: List },
      }) as Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>,
    [processingWorkspaceIcon, processingWorkspaceLabel],
  )
  const mobileHomeQuickActions = useMemo(() => {
    return getSeasonQuickActions(visibleTabs).map((tab) => ({
      tab,
      label: tabMeta[tab]?.label || tab,
      icon: tabMeta[tab]?.icon || Home,
    }))
  }, [tabMeta, visibleTabs])
  type ExecutionOutcomeStatus = "good" | "attention" | "blocked"
  type ExecutionOutcomeCheck = {
    id: string
    title: string
    goal: string
    metric: string
    status: ExecutionOutcomeStatus
    actionLabel: string
    actionTab: string
  }

  const recentThirtyDayTransactions = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    return transactions.filter((tx) => {
      const parsed = tx.transaction_date ? parseCustomDateString(tx.transaction_date) : null
      if (!parsed) return false
      return parsed.getTime() >= cutoff
    })
  }, [transactions])
  const availableExportDatasetCount = useMemo(() => {
    const datasets = new Set<string>()
    if (canShowProcessing) datasets.add("processing")
    if (canShowDispatch) datasets.add("dispatch")
    if (canShowSales) datasets.add("sales")
    if (canShowPepper) datasets.add("pepper")
    if (canShowRainfall) datasets.add("rainfall")
    if (showTransactionHistory) datasets.add("transactions")
    if (canShowInventory) datasets.add("inventory")
    if (canShowAccounts) {
      datasets.add("labour")
      datasets.add("expenses")
    }
    if (canShowDispatch || canShowSales || canShowSeason) datasets.add("reconciliation")
    if (canShowReceivables) datasets.add("receivables-aging")
    if (canShowAccounts || canShowSales || canShowSeason) datasets.add("pnl-monthly")
    return datasets.size
  }, [
    canShowAccounts,
    canShowDispatch,
    canShowInventory,
    canShowPepper,
    canShowProcessing,
    canShowRainfall,
    canShowReceivables,
    canShowSales,
    canShowSeason,
    showTransactionHistory,
  ])
  const executionOutcomeChecks = useMemo<ExecutionOutcomeCheck[]>(() => {
    const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : null)
    const pickActionTab = (preferredTabs: string[]) =>
      preferredTabs.find((tab) => visibleTabs.includes(tab)) || "home"
    const multiLocation = locations.length > 1
    const hasTaggedLocation = (tx: Transaction) => {
      const locationId = String(tx.location_id || "").trim()
      return Boolean(locationId && locationId !== LOCATION_UNASSIGNED)
    }
    const hasNotes = (tx: Transaction) => String(tx.notes || "").trim().length > 0
    // Location tagging is only a required field when the estate has multiple locations.
    // Single-location estates have nothing to distinguish so we don't penalise them.
    const hasRequiredFields = (tx: Transaction) =>
      String(tx.item_type || "").trim().length > 0 &&
      Number(tx.quantity) > 0 &&
      String(tx.transaction_type || "").trim().length > 0 &&
      (!multiLocation || hasTaggedLocation(tx))

    const structuredTaskCount = recentThirtyDayTransactions.filter(hasRequiredFields).length
    const structuredTaskPct = pct(structuredTaskCount, recentThirtyDayTransactions.length)
    const missedFieldTaskStatus: ExecutionOutcomeStatus =
      recentThirtyDayTransactions.length === 0
        ? "attention"
        : (structuredTaskPct || 0) >= 95
          ? "good"
          : (structuredTaskPct || 0) >= 80
            ? "attention"
            : "blocked"

    const harvestKg = processingTotals.arabicaKg + processingTotals.robustaKg
    const harvestStatus: ExecutionOutcomeStatus =
      !canShowProcessing ? "blocked" : processingTotals.loading ? "attention" : harvestKg > 0 ? "good" : "attention"

    const depleteTransactions = recentThirtyDayTransactions.filter((tx) =>
      String(tx.transaction_type || "").toLowerCase().includes("deplet"),
    )
    const taggedDepleteTransactions = depleteTransactions.filter((tx) => hasTaggedLocation(tx) && Number(tx.quantity) > 0)
    const inputTrackingPct = pct(taggedDepleteTransactions.length, depleteTransactions.length)
    const inputTrackingStatus: ExecutionOutcomeStatus =
      !showTransactionHistory
        ? "blocked"
        : depleteTransactions.length === 0
          ? "attention"
          : !multiLocation
            ? "good"
            : (inputTrackingPct || 0) >= 90
              ? "good"
              : (inputTrackingPct || 0) >= 70
                ? "attention"
                : "blocked"

    const laborSharePct =
      accountsTotals.grandTotal > 0 ? Math.round((accountsTotals.laborTotal / accountsTotals.grandTotal) * 100) : null
    const laborVisibilityStatus: ExecutionOutcomeStatus =
      !canShowAccounts
        ? "blocked"
        : accountsTotalsLoading
          ? "attention"
          : accountsTotals.laborTotal > 0
            ? "good"
            : "attention"

    const notesCoveragePct = pct(
      recentThirtyDayTransactions.filter((tx) => hasNotes(tx)).length,
      recentThirtyDayTransactions.length,
    )
    const chaosReductionStatus: ExecutionOutcomeStatus =
      recentThirtyDayTransactions.length === 0
        ? "attention"
        : (notesCoveragePct || 0) >= 70 && availableExportDatasetCount >= 4
          ? "good"
          : (notesCoveragePct || 0) >= 45 && availableExportDatasetCount >= 3
            ? "attention"
            : "blocked"

    const ownerReportReady = canShowSeason && (canShowBalanceSheet || canShowAccounts)
    const exporterReportReady = canShowDispatch && canShowSales && (canShowBilling || canShowReceivables)
    const managerReportReady = canShowInventory && canShowProcessing && (canShowAccounts || showTransactionHistory)
    const audienceReadyCount = [ownerReportReady, exporterReportReady, managerReportReady].filter(Boolean).length
    const cleanerReportsStatus: ExecutionOutcomeStatus =
      audienceReadyCount >= 3 ? "good" : audienceReadyCount >= 2 ? "attention" : "blocked"

    return [
      {
        id: "missed-field-tasks",
        title: "Fewer Missed Field Tasks",
        goal: "Ensure field teams capture complete, location-tagged entries.",
        metric:
          recentThirtyDayTransactions.length === 0
            ? "No inventory tasks logged in last 30 days."
            : `${structuredTaskPct || 0}% of recent inventory tasks are complete`,
        status: missedFieldTaskStatus,
        actionLabel: "Open Transactions",
        actionTab: pickActionTab(["transactions", "inventory"]),
      },
      {
        id: "better-harvest-records",
        title: "Better Harvest Records",
        goal: "Track harvest and processing output consistently through the season.",
        metric: !canShowProcessing
          ? "Pulping module is disabled."
          : processingTotals.loading
            ? "Loading pulping totals..."
            : `${formatNumber(harvestKg, 0)} kg harvest output logged`,
        status: harvestStatus,
        actionLabel: "Open Pulping",
        actionTab: pickActionTab(["processing", "season"]),
      },
      {
        id: "input-usage-tracking",
        title: "Input Usage Tracking",
        goal: "Tie depleting usage to specific locations for accountability.",
        metric:
          depleteTransactions.length === 0
            ? "No depleting entries logged in last 30 days."
            : `${inputTrackingPct || 0}% of depleting entries are location-tagged`,
        status: inputTrackingStatus,
        actionLabel: "Open Inventory",
        actionTab: pickActionTab(["inventory", "transactions"]),
      },
      {
        id: "labour-visibility",
        title: "Labour Visibility",
        goal: "Keep labour spend visible for day-to-day decisions.",
        metric: !canShowAccounts
          ? "Accounts module is disabled."
          : accountsTotalsLoading
            ? "Loading labour totals..."
            : `${formatCurrency(accountsTotals.laborTotal, 0)} labour tracked${laborSharePct !== null ? ` (${laborSharePct}% of spend)` : ""}`,
        status: laborVisibilityStatus,
        actionLabel: "Open Accounts",
        actionTab: pickActionTab(["accounts", "balance-sheet"]),
      },
      {
        id: "less-chaos",
        title: "Structured Daily Updates",
        goal: "Keep updates recorded in FarmFlow with reusable exports.",
        metric:
          recentThirtyDayTransactions.length === 0
            ? `${availableExportDatasetCount} CSV exports ready for operations`
            : `${notesCoveragePct || 0}% entries include notes · ${availableExportDatasetCount} CSV exports ready`,
        status: chaosReductionStatus,
        actionLabel: "Open Dashboard",
        actionTab: "home",
      },
      {
        id: "cleaner-reports",
        title: "Reports for Owner, Exporter, and Manager",
        goal: "Ensure decision-ready views exist for each leadership role.",
        metric: `${audienceReadyCount}/3 role views covered (owner, exporter, manager)`,
        status: cleanerReportsStatus,
        actionLabel: "Open Season",
        actionTab: pickActionTab(["season", "accounts", "dispatch"]),
      },
    ]
  }, [
    accountsTotals.grandTotal,
    accountsTotals.laborTotal,
    accountsTotalsLoading,
    availableExportDatasetCount,
    canShowAccounts,
    canShowBalanceSheet,
    canShowBilling,
    canShowDispatch,
    canShowInventory,
    canShowProcessing,
    canShowReceivables,
    canShowSales,
    canShowSeason,
    processingTotals.arabicaKg,
    processingTotals.loading,
    processingTotals.robustaKg,
    recentThirtyDayTransactions,
    showTransactionHistory,
    visibleTabs,
    locations.length,
  ])

  useEffect(() => {
    if (!user?.tenantId || executionOutcomeChecks.length === 0) return

    const statusById = executionOutcomeChecks.reduce<Record<string, string>>((acc, check) => {
      acc[check.id] = check.status
      return acc
    }, {})
    const metricById = executionOutcomeChecks.reduce<Record<string, string>>((acc, check) => {
      acc[check.id] = check.metric
      return acc
    }, {})

    const signature = JSON.stringify({
      tenantId: user.tenantId,
      statusById,
      metricById,
    })

    if (signature === lastExecutionOutcomeSignatureRef.current) {
      return
    }
    lastExecutionOutcomeSignatureRef.current = signature

    posthog.capture("execution_scorecard_snapshot", {
      tenant_id: user.tenantId,
      role: user.role,
      active_tab: activeTab,
      checks: executionOutcomeChecks.length,
      strong_count: executionOutcomeChecks.filter((check) => check.status === "good").length,
      attention_count: executionOutcomeChecks.filter((check) => check.status === "attention").length,
      blocked_count: executionOutcomeChecks.filter((check) => check.status === "blocked").length,
      status_by_id: statusById,
      metric_by_id: metricById,
    })
  }, [activeTab, executionOutcomeChecks, user?.role, user?.tenantId])

  const smartNextSteps = useMemo<SmartNextStep[]>(() => {
    const steps: SmartNextStep[] = []
    const smartOnboardingAccess: OnboardingAccess = {
      canShowInventory,
      canShowAccountCodes: canShowAccounts,
      canShowLabor: canShowAccounts,
      canShowProcessing,
      canShowDispatch,
      canShowSales,
      canManageUsers: isAdmin,
    }
    const onboardingStepConfigs = buildOnboardingSteps(onboardingStatus, smartOnboardingAccess)
    const onboardingCompletedCountLocal = onboardingStepConfigs.filter((step) => step.done).length
    const onboardingTotalCountLocal = onboardingStepConfigs.length
    const showOnboardingLocal =
      !isOwner &&
      Boolean(user?.requiresGuidedSetup) &&
      !LIVE_TENANT_SKIP_TENANTS.has(tenantId || "") &&
      hasLoadedOnboardingStatus &&
      onboardingTotalCountLocal > 0 &&
      onboardingCompletedCountLocal < onboardingTotalCountLocal
    const nextPendingOnboardingStep = onboardingStepConfigs.find((step) => !step.done) || null
    const latestActivity = recentActivity?.[0] || null
    const primaryAlert = exceptionsSummary.alerts[0] || null
    const fallbackOutcome =
      executionOutcomeChecks.find((check) => check.status === "blocked") ||
      executionOutcomeChecks.find((check) => check.status === "attention") ||
      null

    const pickTab = (preferredTabs: string[]) => {
      for (const tab of preferredTabs) {
        const normalized = String(tab || "").trim()
        if (!normalized) continue
        if (normalized === "transactions" && showTransactionHistory) return "transactions"
        if (normalized === "inventory" && canShowInventoryWorkspace) return "inventory"
        if (normalized === "processing" && canShowProcessingWorkspace) return "processing"
        if (normalized === "sales" && canShowSalesWorkspace) return "sales"
        if (visibleTabs.includes(normalized)) return normalized
      }
      return "home"
    }

    const resolveActionLabel = (tab: string) => {
      if (tab === "transactions") return "Open Transactions"
      if (tab === "home") return "Open Dashboard"
      return `Open ${tabMeta[tab]?.label || "Workspace"}`
    }

    const addStep = (step: SmartNextStep | null) => {
      if (!step) return
      if (steps.some((existing) => existing.id === step.id || existing.actionTab === step.actionTab)) {
        return
      }
      steps.push(step)
    }

    if (nextPendingOnboardingStep) {
      addStep({
        id: `onboarding-${nextPendingOnboardingStep.key}`,
        tone: "progress",
        title: nextPendingOnboardingStep.title,
        description: nextPendingOnboardingStep.description,
        reason: `${onboardingCompletedCountLocal}/${onboardingTotalCountLocal} setup steps complete. Finish this step before daily work gets spread across too many tabs.`,
        actionLabel: nextPendingOnboardingStep.actionLabel,
        actionTab: nextPendingOnboardingStep.actionTab,
        askPrompt: `How do I complete "${nextPendingOnboardingStep.title}" in FarmFlow?`,
      })
    }

    if (primaryAlert || exceptionsSummary.count > 0) {
      const alertLocation = primaryAlert?.location ? ` for ${primaryAlert.location}` : ""
      addStep({
        id: "active-alert",
        tone: "attention",
        title: primaryAlert ? primaryAlert.title : "Review active estate alerts",
        description: primaryAlert
          ? `This is the highest-priority issue FarmFlow sees right now${alertLocation}.`
          : `${exceptionsSummary.count} estate alerts need review before they turn into reporting drift.`,
        reason:
          exceptionsSummary.highlights[0] ||
          (primaryAlert?.metric
            ? `Check ${primaryAlert.metric.toLowerCase()} and clear the blocker before it cascades into other records.`
            : "Resolve the current blocker before it starts affecting downstream records."),
        actionLabel: canShowSeason ? "Review alerts" : "Open Dashboard",
        actionTab: pickTab(["season", intelligenceActions[0]?.tab || "", "home"]),
        askPrompt: `Explain this estate alert and tell me what to do next: ${primaryAlert?.title || "current estate alerts"}.`,
      })
    }

    if (!latestActivity) {
      const starterTab = nextPendingOnboardingStep
        ? nextPendingOnboardingStep.actionTab
        : pickTab(["processing", "inventory", "accounts", "dispatch", "sales"])
      addStep({
        id: "first-live-record",
        tone: showOnboardingLocal ? "progress" : "help",
        title: showOnboardingLocal ? "Keep setup moving with one real record" : "Log the next live record",
        description: showOnboardingLocal
          ? "Do not wait for a perfect setup. One honest live record is enough to move the estate forward."
          : "There is no recent activity yet. Start with one real entry so FarmFlow can give better guidance.",
        reason: showOnboardingLocal
          ? "The first useful rhythm is locations, one stock baseline, then one live operational record."
          : "Recent activity is empty, so the dashboard has very little real usage context yet.",
        actionLabel: nextPendingOnboardingStep ? nextPendingOnboardingStep.actionLabel : resolveActionLabel(starterTab),
        actionTab: starterTab,
        askPrompt: "I am getting started in FarmFlow. What is the minimum useful record I should enter first today?",
      })
    } else {
      const latestReason = `Latest activity: ${latestActivity.label}${latestActivity.date ? ` on ${latestActivity.date}` : ""}.`
      if (latestActivity.module === "processing" && canShowDispatch) {
        addStep({
          id: "after-processing",
          tone: "progress",
          title: "Close the loop after pulping",
          description: "You recently logged pulping output. Record dispatch next so bags out and received KGs stay aligned.",
          reason: latestReason,
          actionLabel: "Open Dispatch",
          actionTab: "dispatch",
          askPrompt: "I already logged pulping output. What should I do next in FarmFlow?",
        })
      } else if (latestActivity.module === "dispatch") {
        const nextTab = pickTab(["sales", "receivables", "season"])
        addStep({
          id: "after-dispatch",
          tone: "progress",
          title: "Follow through after dispatch",
          description: "Use the next step to keep stock, buyers, and revenue aligned after bags leave the estate.",
          reason: latestReason,
          actionLabel: resolveActionLabel(nextTab),
          actionTab: nextTab,
          askPrompt: "I recorded dispatch already. Should I log sales, receivables, or review stock next?",
        })
      } else if (latestActivity.module === "sales") {
        const nextTab = pickTab(["receivables", "season", "accounts"])
        addStep({
          id: "after-sales",
          tone: "progress",
          title: "Follow up on buyers after sales",
          description: "Review the next buyer-facing step so cash collection and season reporting do not fall behind.",
          reason: latestReason,
          actionLabel: resolveActionLabel(nextTab),
          actionTab: nextTab,
          askPrompt: "I have recorded a sale. What should I review next in FarmFlow?",
        })
      } else if (latestActivity.module === "expenses") {
        const nextTab = pickTab(["inventory", "accounts"])
        addStep({
          id: "after-expenses",
          tone: "help",
          title: "Check the operational follow-through on expenses",
          description: "After entering expenses, confirm the related stock or coding context so Accounts and operations stay aligned.",
          reason: latestReason,
          actionLabel: resolveActionLabel(nextTab),
          actionTab: nextTab,
          askPrompt: "I entered an expense. Should I also review inventory, account codes, or something else?",
        })
      } else if (latestActivity.module === "labour" && canShowAccounts) {
        addStep({
          id: "after-labour",
          tone: "progress",
          title: "Review labour visibility",
          description: "Keep labour entries tied back to activities and totals so cost visibility stays usable day to day.",
          reason: latestReason,
          actionLabel: "Open Accounts",
          actionTab: "accounts",
          askPrompt: "I logged labour already. What should I review next so labour costs stay accurate?",
        })
      }
    }

    const suggestedIntelligenceAction =
      intelligenceActions.find((action) => !steps.some((step) => step.actionTab === action.tab)) || null
    if (suggestedIntelligenceAction) {
      addStep({
        id: `intelligence-${suggestedIntelligenceAction.tab}`,
        tone: "help",
        title: suggestedIntelligenceAction.label,
        description: "FarmFlow flagged this as a useful follow-up based on the latest tenant data across modules.",
        reason: intelligenceHighlights[0] || "This recommendation comes from the latest cross-module intelligence brief.",
        actionLabel: suggestedIntelligenceAction.label,
        actionTab: pickTab([suggestedIntelligenceAction.tab, "home"]),
        askPrompt: `Why is "${suggestedIntelligenceAction.label}" a useful next step for my estate today?`,
      })
    }

    if (steps.length < 3 && fallbackOutcome) {
      addStep({
        id: `scorecard-${fallbackOutcome.id}`,
        tone: fallbackOutcome.status === "blocked" ? "attention" : "help",
        title: fallbackOutcome.title,
        description: fallbackOutcome.goal,
        reason: fallbackOutcome.metric,
        actionLabel: fallbackOutcome.actionLabel,
        actionTab: fallbackOutcome.actionTab,
        askPrompt: `How do I improve "${fallbackOutcome.title}" in FarmFlow?`,
      })
    }

    if (steps.length < 3) {
      addStep({
        id: "stuck-help",
        tone: "help",
        title: "Need help finding the right tab?",
        description: "Ask FarmFlow in plain English and it will point you to the right screen or matching records.",
        reason: "Useful when you know the task, but not where it lives or what the next field should be.",
        actionLabel: "Open Dashboard",
        actionTab: "home",
        askPrompt: "I am stuck in FarmFlow. What should I do next, and where exactly should I go?",
      })
    }

    return steps.slice(0, 3)
  }, [
    canShowAccounts,
    canShowInventory,
    canShowDispatch,
    canShowInventoryWorkspace,
    canShowProcessingWorkspace,
    canShowProcessing,
    canShowSales,
    canShowSalesWorkspace,
    canShowSeason,
    exceptionsSummary.alerts,
    exceptionsSummary.count,
    exceptionsSummary.highlights,
    executionOutcomeChecks,
    hasLoadedOnboardingStatus,
    intelligenceActions,
    intelligenceHighlights,
    onboardingStatus,
    recentActivity,
    showTransactionHistory,
    tabMeta,
    tenantId,
    visibleTabs,
    isOwner,
    LIVE_TENANT_SKIP_TENANTS,
    isAdmin,
    user?.requiresGuidedSetup,
  ])

  const getPreferredDefaultTab = useCallback(
    (tabs: string[]) => DEFAULT_DASHBOARD_TAB_PRIORITY.find((tab) => tabs.includes(tab)) || tabs[0],
    [],
  )

  useEffect(() => {
    hasTrackedInsightViewRef.current = false
  }, [effectiveRole, tenantId])


  const inferBriefTabFromText = useCallback(
    (input: string) => {
      const text = String(input || "").toLowerCase()
      if (!text) return "home"
      if ((text.includes("dispatch") || text.includes("received")) && canShowDispatch) return "dispatch"
      if ((text.includes("sale") || text.includes("buyer") || text.includes("revenue")) && canShowSalesWorkspace) return "sales"
      if ((text.includes("receivable") || text.includes("outstanding") || text.includes("invoice")) && canShowReceivables) {
        return "receivables"
      }
      if ((text.includes("labour") || text.includes("expense") || text.includes("cost")) && canShowAccounts) return "accounts"
      if ((text.includes("float") || text.includes("yield") || text.includes("process")) && canShowProcessing) return "processing"
      if ((text.includes("stock") || text.includes("inventory") || text.includes("transaction")) && showTransactionHistory) {
        return "transactions"
      }
      return "home"
    },
    [canShowAccounts, canShowDispatch, canShowProcessing, canShowReceivables, canShowSalesWorkspace, showTransactionHistory],
  )

  const resolveExceptionDrilldownTab = useCallback(
    (metric?: string) => {
      const normalized = String(metric || "").trim().toLowerCase()
      if (!normalized) return canShowSeason ? "season" : "home"
      if (["float_rate", "dry_parch_yield", "float_rate_zscore", "dry_parch_yield_zscore"].includes(normalized)) {
        return canShowProcessing ? "processing" : canShowSeason ? "season" : "home"
      }
      if (["transit_loss", "dispatch_unconfirmed", "bag_weight_drift"].includes(normalized)) {
        return canShowDispatch ? "dispatch" : canShowSeason ? "season" : "home"
      }
      if (["inventory_mismatch", "sales_spike"].includes(normalized)) {
        return canShowSalesWorkspace ? "sales" : canShowSeason ? "season" : "home"
      }
      return canShowSeason ? "season" : "home"
    },
    [canShowDispatch, canShowProcessing, canShowSalesWorkspace, canShowSeason],
  )

  const openDrilldown = useCallback(
    (options: DrilldownOptions) => {
      const requestedTab = options.tab === "weather" ? "rainfall" : options.tab
      let nextTabCandidate = requestedTab
      let queryTab = requestedTab

      if (requestedTab === "transactions") {
        setInventoryWorkspaceView("transactions")
        nextTabCandidate = "inventory"
      } else if (requestedTab === "inventory") {
        setInventoryWorkspaceView(canShowInventory ? "inventory" : "transactions")
      } else if (requestedTab === "pepper") {
        setProcessingWorkspaceView("pepper")
        nextTabCandidate = "processing"
      } else if (requestedTab === "other-sales") {
        setSalesWorkspaceView("other-sales")
        nextTabCandidate = "sales"
      } else if (requestedTab === "processing") {
        setProcessingWorkspaceView(canShowProcessing ? "coffee" : "pepper")
      } else if (requestedTab === "sales") {
        setSalesWorkspaceView(canShowSales ? "coffee" : "other-sales")
      }

      const nextTab =
        nextTabCandidate === DASHBOARD_LAUNCHER_TAB || visibleTabs.includes(nextTabCandidate)
          ? nextTabCandidate
          : getPreferredDefaultTab(visibleTabs)
      if (nextTab !== nextTabCandidate) {
        queryTab = nextTab
      }
      setActiveTab(nextTab)
      markTabAsLoaded(nextTab)
      showFirstVisitTabLoader(nextTab)

      if (options.locationId) {
        const locationId = String(options.locationId)
        if (locationId === LOCATION_ALL || locationId === LOCATION_UNASSIGNED || locations.some((loc) => loc.id === locationId)) {
          setSelectedLocationId(locationId)
        }
      }
      if (options.itemType) {
        const nextItem = String(options.itemType)
        if (nextItem === "All Types" || allItemTypesForDropdown.includes(nextItem)) {
          setFilterType(nextItem)
        } else if (nextItem.trim()) {
          setFilterType(nextItem)
        }
      }
      if (options.transactionSearch !== undefined && options.transactionSearch !== null) {
        setTransactionSearchTerm(String(options.transactionSearch))
      }
      if (requestedTab === "accounts") {
        setAccountsInitialTab(isAccountsWorkspaceTab(options.panel) ? options.panel : undefined)
      } else {
        setAccountsInitialTab(undefined)
      }

      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", queryTab)
      const setOptional = (key: string, value?: string | null) => {
        const normalized = String(value || "").trim()
        if (normalized) params.set(key, normalized)
        else params.delete(key)
      }

      if (options.locationId !== undefined) {
        setOptional("locationId", options.locationId)
      }
      if (options.itemType !== undefined) {
        setOptional(DRILLDOWN_ITEM_PARAM, options.itemType)
      }
      if (requestedTab === "accounts") {
        setOptional("panel", options.panel)
      } else {
        params.delete("panel")
      }
      if (options.transactionSearch !== undefined) {
        setOptional(DRILLDOWN_TXN_SEARCH_PARAM, options.transactionSearch)
      }
      if (options.seasonAlertId !== undefined) {
        setOptional(DRILLDOWN_ALERT_ID_PARAM, options.seasonAlertId)
      }
      if (options.seasonMetric !== undefined) {
        setOptional(DRILLDOWN_ALERT_METRIC_PARAM, options.seasonMetric)
      }

      const nextQuery = params.toString()
      const currentQuery = searchParams.toString()
      if (nextQuery === currentQuery) {
        return
      }
      const nextPath = nextQuery ? `/dashboard?${nextQuery}` : "/dashboard"
      router.replace(nextPath, { scroll: false })
    },
    [allItemTypesForDropdown, canShowInventory, canShowProcessing, canShowSales, getPreferredDefaultTab, locations, markTabAsLoaded, router, searchParams, showFirstVisitTabLoader, visibleTabs],
  )
  const handleTabChange = useCallback(
    (value: string) => {
      let nextTab = value
      if (value === "transactions") {
        setInventoryWorkspaceView("transactions")
        nextTab = "inventory"
      } else if (value === "inventory") {
        setInventoryWorkspaceView(canShowInventory ? "inventory" : "transactions")
      } else if (value === "other-sales") {
        setSalesWorkspaceView("other-sales")
        nextTab = "sales"
      } else if (value === "sales") {
        setSalesWorkspaceView(canShowSales ? "coffee" : "other-sales")
      }
      openDrilldown({ tab: nextTab })
    },
    [canShowInventory, canShowSales, openDrilldown],
  )

  const handleSubNavClick = useCallback(
    (tabId: string, sub: { accountsPanel?: string; section?: string }) => {
      if (tabId === "accounts" && sub.accountsPanel && isAccountsWorkspaceTab(sub.accountsPanel)) {
        setAccountsInitialTab(sub.accountsPanel as AccountsWorkspaceTab)
        handleTabChange("accounts")
      } else {
        handleTabChange(tabId)
        if (sub.section) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("farmflow:scroll-to-section", { detail: sub.section }))
          }, 150)
        }
      }
    },
    [handleTabChange],
  )

  const handleWorkspaceHintAction = useCallback(
    (action: WorkspaceHintAction) => {
      if (action.href) {
        router.push(buildWorkspaceHref(action.href))
        return
      }
      if (action.tab) {
        openDrilldown({ tab: action.tab, panel: action.panel })
      }
    },
    [buildWorkspaceHref, openDrilldown, router],
  )

  const handleExecutionOutcomeAction = useCallback(
    (check: ExecutionOutcomeCheck) => {
      posthog.capture("execution_scorecard_action_clicked", {
        check_id: check.id,
        check_status: check.status,
        action_tab: check.actionTab,
      })
      openDrilldown({ tab: check.actionTab })
    },
    [openDrilldown],
  )

  const launchAssistantPrompt = useCallback((prompt?: string | null) => {
    if (typeof window === "undefined") return
    const nextPrompt = String(prompt || "").trim()
    window.dispatchEvent(
      new CustomEvent<AssistantPromptEventDetail>(ASSISTANT_PROMPT_EVENT, {
        detail: nextPrompt ? { prompt: nextPrompt } : {},
      }),
    )
  }, [])

  const resolveWriteQueueTab = useCallback(
    (pathname: string) => {
      const normalized = String(pathname || "").trim().toLowerCase()
      if (!normalized) return "home"
      if (normalized.startsWith("/api/processing-records")) return canShowProcessing ? "processing" : "home"
      if (normalized.startsWith("/api/dispatch")) return canShowDispatch ? "dispatch" : "home"
      if (normalized.startsWith("/api/sales")) return canShowSales ? "sales" : "home"
      if (normalized.startsWith("/api/rainfall")) return canShowRainfall ? "rainfall" : "home"
      if (normalized.startsWith("/api/pepper-records")) return canShowPepper ? "pepper" : "home"
      if (normalized.startsWith("/api/transactions-neon")) return canShowInventoryWorkspace ? "inventory" : "home"
      if (normalized.startsWith("/api/inventory-neon")) return canShowInventory ? "inventory" : "home"
      if (normalized.startsWith("/api/locations")) return canShowInventory ? "inventory" : "home"
      if (normalized.startsWith("/api/labor-neon") || normalized.startsWith("/api/expenses-neon")) {
        return canShowAccounts ? "accounts" : "home"
      }
      if (normalized.startsWith("/api/receivables")) return canShowReceivables ? "receivables" : "home"
      return "home"
    },
    [
      canShowAccounts,
      canShowDispatch,
      canShowInventory,
      canShowInventoryWorkspace,
      canShowPepper,
      canShowProcessing,
      canShowRainfall,
      canShowReceivables,
      canShowSales,
    ],
  )

  const handleOpenWriteQueueFix = useCallback(
    (entry: WriteQueueBlockedEntry) => {
      const targetTab = resolveWriteQueueTab(entry.pathname || entry.url)
      openDrilldown({ tab: targetTab })
      posthog.capture("offline_queue_fix_opened", {
        endpoint: entry.pathname || entry.url,
        target_tab: targetTab,
        queue_entry_id: entry.id,
        blocked_reason: entry.blockedReason || "unknown",
        status_code: entry.lastStatus ?? null,
      })
    },
    [openDrilldown, resolveWriteQueueTab],
  )

  const handleRequestAccountsExport = useCallback(
    (format: AccountsExportFormat) => {
      const requestId = Date.now()
      setAccountsExportRequest({ requestId, format })
      openDrilldown({ tab: "accounts" })
      posthog.capture("accounts_export_requested_from_hub", {
        format,
        source_tab: activeTab,
      })
    },
    [activeTab, openDrilldown],
  )

  const handleAccountsExportRequestHandled = useCallback((requestId: number) => {
    setAccountsExportRequest((current) => {
      if (!current || current.requestId !== requestId) return current
      return null
    })
  }, [])

  const goToWorkspaceNavigator = useCallback(() => {
    const targetTab = isMobile ? "home" : DASHBOARD_LAUNCHER_TAB
    setActiveTab(targetTab)
    markTabAsLoaded(targetTab)

    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", targetTab)
    params.delete("locationId")
    params.delete(DRILLDOWN_ITEM_PARAM)
    params.delete(DRILLDOWN_TXN_SEARCH_PARAM)
    params.delete(DRILLDOWN_ALERT_ID_PARAM)
    params.delete(DRILLDOWN_ALERT_METRIC_PARAM)

    const nextPath = `/dashboard?${params.toString()}`
    router.replace(nextPath, { scroll: false })
  }, [isMobile, markTabAsLoaded, router, searchParams])

  type TabGroupKey = "dashboard" | "operations" | "finance" | "insights"
  type SectionTabItem = {
    value: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    subtabs?: string[]
  }

  const activeTabGroup = useMemo<TabGroupKey>(() => {
    if (activeTab === "home") return "dashboard"
    if (operationsTabItems.some((item) => item.value === activeTab)) return "operations"
    if (financeTabItems.some((item) => item.value === activeTab)) return "finance"
    if (insightsTabItems.some((item) => item.value === activeTab)) return "insights"
    return "dashboard"
  }, [activeTab, financeTabItems, insightsTabItems, operationsTabItems])

  const activeSectionTabs = useMemo(() => {
    if (activeTabGroup === "operations") return operationsTabItems
    if (activeTabGroup === "finance") return financeTabItems
    if (activeTabGroup === "insights") return insightsTabItems
    return []
  }, [activeTabGroup, financeTabItems, insightsTabItems, operationsTabItems])
  const launcherSections = useMemo(
    () =>
      [
        showFinanceTabs
          ? {
              id: "finance" as const,
              label: "Finance",
              description: "Accounts, balance, P&L, receivables, and market rates.",
              icon: Scale,
              tabs: financeTabItems as SectionTabItem[],
              cardClassName: "border-amber-200/80 bg-amber-50/50",
              badgeClassName: "border-amber-200 bg-white text-amber-700",
              tabClassName: "border-amber-200 bg-white text-amber-900 hover:bg-amber-50",
              subtabChipClassName: "border-amber-100 bg-amber-100/70 text-amber-800/80",
              iconClassName: "text-amber-700",
              activeCardClassName: "border-amber-500 bg-amber-500 text-white shadow-[0_14px_30px_-20px_rgba(217,119,6,0.95)]",
              inactiveCardClassName: "border-amber-200 bg-amber-50/70 text-slate-900 hover:border-amber-300 hover:bg-amber-50",
              activeDescriptionClassName: "text-amber-100",
              inactiveDescriptionClassName: "text-slate-500",
              previewTabClassName: "border-amber-200 bg-white/90 text-amber-900 hover:bg-white",
              previewTabActiveClassName: "border-white/30 bg-white/15 text-white",
            }
          : null,
        showOperationsTabs
          ? {
              id: "operations" as const,
              label: "Operations",
              description: "Processing, dispatch, sales, stock, and rain & weather.",
              icon: Factory,
              tabs: operationsTabItems as SectionTabItem[],
              cardClassName: "border-emerald-200/80 bg-emerald-50/50",
              badgeClassName: "border-emerald-200 bg-white text-emerald-700",
              tabClassName: "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50",
              subtabChipClassName: "border-emerald-100 bg-emerald-100/70 text-emerald-800/80",
              iconClassName: "text-emerald-700",
              activeCardClassName: "border-emerald-600 bg-emerald-600 text-white shadow-[0_14px_30px_-20px_rgba(5,150,105,0.9)]",
              inactiveCardClassName: "border-emerald-200 bg-emerald-50/70 text-slate-900 hover:border-emerald-300 hover:bg-emerald-50",
              activeDescriptionClassName: "text-emerald-100",
              inactiveDescriptionClassName: "text-slate-500",
              previewTabClassName: "border-emerald-200 bg-white/90 text-emerald-900 hover:bg-white",
              previewTabActiveClassName: "border-white/30 bg-white/15 text-white",
            }
          : null,
        showInsightsTabs
          ? {
              id: "insights" as const,
              label: "Reports",
              description: "Season summary, rain & weather, AI insights, and records.",
              icon: BarChart3,
              tabs: insightsTabItems as SectionTabItem[],
              cardClassName: "border-cyan-200/80 bg-cyan-50/50",
              badgeClassName: "border-cyan-200 bg-white text-cyan-700",
              tabClassName: "border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-50",
              subtabChipClassName: "border-cyan-100 bg-cyan-100/70 text-cyan-800/80",
              iconClassName: "text-cyan-700",
              activeCardClassName: "border-cyan-600 bg-cyan-600 text-white shadow-[0_14px_30px_-20px_rgba(8,145,178,0.9)]",
              inactiveCardClassName: "border-cyan-200 bg-cyan-50/70 text-slate-900 hover:border-cyan-300 hover:bg-cyan-50",
              activeDescriptionClassName: "text-cyan-100",
              inactiveDescriptionClassName: "text-slate-500",
              previewTabClassName: "border-cyan-200 bg-white/90 text-cyan-900 hover:bg-white",
              previewTabActiveClassName: "border-white/30 bg-white/15 text-white",
            }
          : null,
      ].filter(Boolean) as Array<{
        id: Exclude<TabGroupKey, "dashboard">
        label: string
        description: string
        icon: React.ComponentType<{ className?: string }>
        tabs: SectionTabItem[]
        cardClassName: string
        badgeClassName: string
        tabClassName: string
        subtabChipClassName: string
        iconClassName: string
        activeCardClassName: string
        inactiveCardClassName: string
        activeDescriptionClassName: string
        inactiveDescriptionClassName: string
        previewTabClassName: string
        previewTabActiveClassName: string
      }>,
    [financeTabItems, insightsTabItems, operationsTabItems, showFinanceTabs, showInsightsTabs, showOperationsTabs],
  )

  const handleSectionSelect = useCallback(
    (group: TabGroupKey) => {
      if (group === "dashboard") {
        handleTabChange("home")
        return
      }
      if (group === "operations") {
        const nextTab = operationsTabItems[0]?.value || "home"
        handleTabChange(nextTab)
        return
      }
      if (group === "finance") {
        const nextTab = financeTabItems[0]?.value || "home"
        handleTabChange(nextTab)
        return
      }
      const nextTab = insightsTabItems[0]?.value || "home"
      handleTabChange(nextTab)
    },
    [financeTabItems, handleTabChange, insightsTabItems, operationsTabItems],
  )

  const tabParam = searchParams.get("tab")
  const locationFilterParam = (searchParams.get("locationId") || "").trim()
  const accountsPanelParam = (searchParams.get("panel") || "").trim()
  const transactionSearchParam = searchParams.get(DRILLDOWN_TXN_SEARCH_PARAM)
  const itemTypeParam = searchParams.get(DRILLDOWN_ITEM_PARAM)
  useEffect(() => {
    if (isModulesLoading) {
      return
    }
    if (activeTab === DASHBOARD_LAUNCHER_TAB) {
      return
    }
    if (activeTab === "transactions") {
      setInventoryWorkspaceView("transactions")
      setActiveTab("inventory")
      return
    }
    if (activeTab === "pepper") {
      setProcessingWorkspaceView("pepper")
      setActiveTab("processing")
      return
    }
    if (activeTab === "rubber") {
      setProcessingWorkspaceView("rubber")
      setActiveTab("processing")
      return
    }
    if (activeTab === "other-sales") {
      setSalesWorkspaceView("other-sales")
      setActiveTab("sales")
      return
    }
    if (visibleTabs.length && !visibleTabs.includes(activeTab)) {
      const fallbackTab =
        activeTab === "weather" && visibleTabs.includes("rainfall")
          ? "rainfall"
          : getPreferredDefaultTab(visibleTabs)
      setActiveTab(fallbackTab)
    }
  }, [activeTab, getPreferredDefaultTab, isModulesLoading, visibleTabs])

  useEffect(() => {
    if (tabParam !== "accounts") {
      return
    }
    setAccountsInitialTab(isAccountsWorkspaceTab(accountsPanelParam) ? accountsPanelParam : undefined)
  }, [accountsPanelParam, tabParam])

  useEffect(() => {
    const defaultTab = isMobile ? "home" : DASHBOARD_LAUNCHER_TAB
    if (!tabParam) {
      if (activeTab !== defaultTab) {
        setActiveTab(defaultTab)
      }
      return
    }
    if (tabParam === DASHBOARD_LAUNCHER_TAB) {
      if (isMobile) {
        setActiveTab("home")
      } else if (activeTab !== DASHBOARD_LAUNCHER_TAB) {
        setActiveTab(DASHBOARD_LAUNCHER_TAB)
      }
      return
    }
    const requestedTab = tabParam === "weather" ? "rainfall" : tabParam
    if (requestedTab === "transactions") {
      setInventoryWorkspaceView("transactions")
      if (activeTab !== "inventory") {
        setActiveTab("inventory")
      }
      return
    }
    if (requestedTab === "pepper") {
      setProcessingWorkspaceView("pepper")
      if (activeTab !== "processing") {
        setActiveTab("processing")
      }
      return
    }
    if (requestedTab === "other-sales") {
      setSalesWorkspaceView("other-sales")
      if (activeTab !== "sales") {
        setActiveTab("sales")
      }
      return
    }
    if (requestedTab === "inventory") {
      setInventoryWorkspaceView(canShowInventory ? "inventory" : "transactions")
    }
    if (requestedTab === "processing") {
      setProcessingWorkspaceView(canShowProcessing ? "coffee" : "pepper")
    }
    if (requestedTab === "sales") {
      setSalesWorkspaceView(canShowSales ? "coffee" : "other-sales")
    }
    if (visibleTabs.includes(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab)
    }
  }, [activeTab, canShowInventory, canShowProcessing, canShowSales, isMobile, tabParam, visibleTabs])

  useEffect(() => {
    if (!locationFilterParam) return
    const normalized = locationFilterParam
    const isKnown =
      normalized === LOCATION_ALL || normalized === LOCATION_UNASSIGNED || locations.some((location) => location.id === normalized)
    if (isKnown && normalized !== selectedLocationId) {
      setSelectedLocationId(normalized)
    }
  }, [locationFilterParam, locations, selectedLocationId])

  useEffect(() => {
    if (transactionSearchParam === null) return
    if (transactionSearchParam !== transactionSearchTerm) {
      setTransactionSearchTerm(transactionSearchParam)
    }
  }, [transactionSearchParam, transactionSearchTerm])

  useEffect(() => {
    if (itemTypeParam === null) return
    const nextItem = String(itemTypeParam || "").trim()
    if (!nextItem) return
    if (nextItem !== filterType) {
      setFilterType(nextItem)
    }
  }, [filterType, itemTypeParam])

  useEffect(() => {
    if (!user || !tenantId || isOwner || isPreviewMode) return
    if (!canShowWelcomeCard) {
      setShowWelcome(false)
      return
    }
    if (LIVE_TENANT_SKIP_TENANTS.has(tenantId)) {
      setShowWelcome(false)
      return
    }
    if (user.setupCompleted) {
      setShowWelcome(false)
      return
    }
    const key = `farmflow_welcome_seen:${tenantId}:${user.username}`
    try {
      const hasSeen = window.localStorage.getItem(key) === "true"
      if (!hasSeen) {
        setShowWelcome(true)
      }
    } catch (error) {
      console.warn("Unable to read welcome flag", error)
    }
  }, [LIVE_TENANT_SKIP_TENANTS, canShowWelcomeCard, isOwner, isPreviewMode, tenantId, user])

  useEffect(() => {
    if (!user || !tenantId || isOwner || isPreviewMode) return
    const key = `farmflow_onboarding_expanded:${tenantId}:${user.username}`
    try {
      const storedValue = window.localStorage.getItem(key)
      setIsOnboardingExpanded(storedValue === "true")
    } catch (error) {
      console.warn("Unable to read onboarding expansion flag", error)
    }
  }, [isOwner, isPreviewMode, tenantId, user])

  const handleOnboardingExpandedChange = useCallback(
    (expanded: boolean) => {
      setIsOnboardingExpanded(expanded)
      if (!user || !tenantId) {
        return
      }
      const key = `farmflow_onboarding_expanded:${tenantId}:${user.username}`
      try {
        window.localStorage.setItem(key, expanded ? "true" : "false")
      } catch (error) {
        console.warn("Unable to store onboarding expansion flag", error)
      }
    },
    [tenantId, user],
  )

  const dismissWelcome = () => {
    if (!user || !tenantId) {
      setShowWelcome(false)
      return
    }
    const key = `farmflow_welcome_seen:${tenantId}:${user.username}`
    try {
      window.localStorage.setItem(key, "true")
    } catch (error) {
      console.warn("Unable to store welcome flag", error)
    }
    setShowWelcome(false)
  }

  const exitPreviewMode = useCallback(() => {
    if (typeof document !== "undefined") {
      document.cookie = `${PREVIEW_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete("previewTenantId")
    params.delete("previewRole")
    params.delete("previewTenantName")
    const nextQuery = params.toString()
    router.push(nextQuery ? `/dashboard?${nextQuery}` : "/dashboard")
  }, [router, searchParams])

  // UI render: simplified, mirrors your original layout and components
  if (!user) return null

  if (isTenantLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <BrandLoading message="Loading tenant context…" />
      </div>
    )
  }

  if (!tenantId) {
    return null
  }

  if (loading && !inventory.length && !syncError) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <BrandLoading message={tenantSettings.estateName ? `Loading ${tenantSettings.estateName}…` : "Loading…"} />
      </div>
    )
  }

  const onboardingAccess: OnboardingAccess = {
    canShowInventory,
    canShowAccountCodes: canShowAccounts,
    canShowLabor: canShowAccounts,
    canShowProcessing,
    canShowDispatch,
    canShowSales,
    canManageUsers: isAdmin,
  }
  const onboardingStepConfigs = buildOnboardingSteps(onboardingStatus, onboardingAccess)
  const onboardingSteps: OnboardingStep[] = onboardingStepConfigs.map((step) => ({
    key: step.key,
    title: step.title,
    description: step.description,
    done: step.done,
    actionLabel: step.actionLabel,
    onAction: step.actionTab === "settings"
      ? () => router.push(buildWorkspaceHref("/settings"))
      : () => handleTabChange(step.actionTab),
  }))
  const onboardingCompletedCount = onboardingStepConfigs.filter((step) => step.done).length
  const onboardingTotalCount = onboardingStepConfigs.length
  const showOnboarding =
    !isOwner &&
    Boolean(user.requiresGuidedSetup) &&
    !LIVE_TENANT_SKIP_TENANTS.has(tenantId || "") &&
    hasLoadedOnboardingStatus &&
    onboardingTotalCount > 0 &&
    onboardingCompletedCount < onboardingTotalCount
  const showSetupComplete =
    !isOwner &&
    Boolean(user.requiresGuidedSetup) &&
    !LIVE_TENANT_SKIP_TENANTS.has(tenantId || "") &&
    hasLoadedOnboardingStatus &&
    onboardingTotalCount > 0 &&
    onboardingCompletedCount === onboardingTotalCount
  const recordMovementPanel = (
    <RecordMovementPanel
      newTransaction={newTransaction}
      transactionLocationId={transactionLocationId}
      lastTransactionWriteFailure={lastTransactionWriteFailure}
      hasMovementItemTypes={hasMovementItemTypes}
      allItemTypesForDropdown={allItemTypesForDropdown}
      selectedMovementUnit={selectedMovementUnit}
      locations={locations}
      canShowAccounts={canShowAccounts}
      onClose={() => setIsMovementDrawerOpen(false)}
      onFieldChange={handleFieldChange}
      onLocationChange={setTransactionLocationId}
      onRecordTransaction={handleRecordTransaction}
      onRetryTransaction={handleRetryTransactionWrite}
      onDismissFailure={() => setLastTransactionWriteFailure(null)}
      transactionDateToInputValue={transactionDateToInputValue}
      getTodayDateInputValue={getTodayDateInputValue}
      buildTransactionDateFromInput={buildTransactionDateFromInput}
      resolveInventoryUnitForItemType={resolveInventoryUnitForItemType}
      coerceNonNegativeNumber={coerceNonNegativeNumber}
      preventNegativeKey={preventNegativeKey}
      preventNumberScrollChange={preventNumberScrollChange}
    />
  )
  const inventoryDrilldownPanel = (
    <InventoryDrilldownPanel
      selectedItem={selectedInventoryDrilldownItem}
      selectedLocationLabel={selectedLocationLabel}
      selectedValue={selectedInventoryDrilldownValue}
      transactions={itemDrilldownTransactions}
      recentTransactions={recentDrilldownTransactions}
      isLoading={isLoadingItemDrilldown}
      showAll={drilldownShowAll}
      onClose={() => setIsInventoryDrilldownOpen(false)}
      onShowAll={handleOpenItemDrilldownHistory}
      onHideAll={() => setDrilldownShowAll(false)}
      resolveLocationLabel={resolveLocationLabel}
    />
  )

  const mobileBottomSpacingClass = isMobile
    ? "pb-[calc(5rem+env(safe-area-inset-bottom))]"
    : "pb-8"

  return (
    <div className="flex min-h-screen bg-background">
      <UniversalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={handleTabChange}
      />
      {!isMobile && (
        <AppSidebar
          activeTab={activeTab}
          visibleTabs={visibleTabs}
          tabMeta={tabMeta}
          onTabChange={handleTabChange}
          onSubNavClick={handleSubNavClick}
          launcherTab={DASHBOARD_LAUNCHER_TAB}
          username={user.username}
          estateName={tenantSettings.estateName}
          roleBadgeLabel={roleBadgeLabel}
          onLogout={handleLogout}
          isAdmin={isAdmin}
          isOwner={isOwner}
          buildWorkspaceHref={buildWorkspaceHref}
        />
      )}
      {isMobile && (
        <MobileBottomNav
          activeTab={activeTab}
          visibleTabs={visibleTabs}
          tabMeta={tabMeta}
          onTabChange={handleTabChange}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
        />
      )}
      <div
        className={cn(
          "flex-1 min-w-0",
          !isMobile && "pl-[76px]",
          isMobile ? mobileBottomSpacingClass : "pb-8",
          isMobile && "bg-stone-50",
        )}
      >
      <div className="relative max-w-7xl mx-auto px-3 pt-4 sm:px-6 sm:pt-5">
        <div className="pointer-events-none absolute -top-20 left-[-6%] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,82,46,0.25),transparent_70%)] blur-[110px]" />
        <div className="pointer-events-none absolute -top-16 right-[5%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle_at_center,rgba(69,111,96,0.25),transparent_70%)] blur-[110px]" />

        <WorkspaceHeader
          isMobile={isMobile}
          username={user.username}
          estateName={tenantSettings.estateName || ""}
          isAdmin={isAdmin}
          isOwner={isOwner}
          isPreviewMode={isPreviewMode}
          roleBadgeLabel={roleBadgeLabel}
          activeTab={activeTab}
          theme={theme}
          tabMeta={tabMeta}
          buildWorkspaceHref={buildWorkspaceHref}
          onTabChange={handleTabChange}
          onLogout={handleLogout}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
        />
        {/* ── Mobile sidebar drawer ── */}
        {isMobile && (
          <MobileSidebarDrawer
            isOpen={isMobileSidebarOpen}
            onClose={() => setIsMobileSidebarOpen(false)}
            estateName={tenantSettings.estateName || ""}
            username={user.username}
            roleBadgeLabel={roleBadgeLabel}
            activeTab={activeTab}
            sections={launcherSections.filter(Boolean) as any}
            onTabChange={handleTabChange}
            buildWorkspaceHref={buildWorkspaceHref}
            isAdmin={isAdmin}
            onNavigateDashboard={goToWorkspaceNavigator}
            onLogout={handleLogout}
          />
        )}

        {isPreviewMode && (
          <PreviewModeBanner
            tenantLabel={tenantLabel}
            effectiveRole={effectiveRole}
            onExit={exitPreviewMode}
          />
        )}

        {showWelcome && (
          <WelcomeCard
            buildWorkspaceHref={buildWorkspaceHref}
            isAdmin={isAdmin}
            canShowResources={canShowResources}
            onTabChange={handleTabChange}
            onDismiss={dismissWelcome}
          />
        )}

        {activeTab === "home" && !isMobile && (
          <HomeTab
            visibleHeroContent={visibleHeroContent}
            canShowAccounts={canShowAccounts}
            canShowRainfallSection={canShowRainfallSection}
            isOwner={isOwner}
            showOnboarding={showOnboarding}
            smartNextSteps={smartNextSteps}
            canLaunchAssistant={canLaunchAssistant}
            buildWorkspaceHref={buildWorkspaceHref}
            onTabChange={handleTabChange}
            onDrilldown={openDrilldown}
            onWorkspaceHintAction={handleWorkspaceHintAction}
            onLaunchAssistantPrompt={launchAssistantPrompt}
          />
        )}


        {!isMobile && <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/70 bg-stone-50/80 px-3 py-1.5 text-xs text-stone-600">
            {syncError ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-rose-600">{syncError}</span>
              </>
            ) : lastSync ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-emerald-700" />
                <span>Synced {lastSync.toLocaleTimeString()}</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-700" />
                <span>Syncing data...</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "home" && canManageData && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDataToolsPanel((prev) => !prev)}
                className="bg-white"
              >
                <Upload className="h-3 w-3 mr-1" />
                {showDataToolsPanel ? "Hide Exports" : "Exports / Import"}
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => { setIsSyncing(true); refreshData(true).finally(() => setIsSyncing(false)) }}
              disabled={isSyncing}
              className="flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync"}
            </Button>
          </div>
        </div>}

        {writeQueueStatus.pendingCount > 0 && (
          <WriteQueueCard
            status={writeQueueStatus}
            isRetrying={isRequestingQueueRetry}
            onRetry={handleRetryWriteQueue}
            onOpenFix={handleOpenWriteQueueFix}
            onRemoveEntry={handleRemoveQueuedEntry}
            onLogout={handleLogout}
          />
        )}

        {canManageData && showDataToolsControls && (
          <DataToolsPanel
            dataToolsDataset={dataToolsDataset}
            onDatasetChange={setDataToolsDataset}
            isExporting={isExportingDataTools}
            exportConfig={selectedDataToolsConfig}
            templateConfig={selectedDataToolsTemplateConfig}
            importHref={dataToolsImportHref}
            canShowAccounts={canShowAccounts}
            onExport={handleDataToolsExport}
            onAccountsExport={handleRequestAccountsExport}
            onDownloadTemplate={handleDownloadDataTemplate}
            exportFailure={lastOpsExportFailure}
            exportFailureLabel={lastOpsExportFailureLabel}
            onDismissFailure={() => setLastOpsExportFailure(null)}
            onRetryExport={handleRetryLastOpsExport}
          />
        )}

        {isOwner && <PlatformConsoleCard />}
        {!isOwner && !trialBannerDismissed && trialDaysRemaining !== null && (
          <TrialBanner
            daysRemaining={trialDaysRemaining}
            onDismiss={() => setTrialBannerDismissed(true)}
          />
        )}
        {showOnboarding && (
          <div className="mb-6">
            <OnboardingChecklist
              isVisible={showOnboarding}
              isLoading={isOnboardingLoading}
              error={onboardingError}
              completedCount={onboardingCompletedCount}
              totalCount={onboardingTotalCount}
              steps={onboardingSteps}
              canManageEstateDefaults={isAdmin && !isPreviewMode}
              estateName={onboardingEstateName}
              bagWeightKg={onboardingBagWeightKg}
              onEstateNameChange={setOnboardingEstateName}
              onBagWeightKgChange={setOnboardingBagWeightKg}
              onSaveEstateDefaults={handleSaveOnboardingDefaults}
              isSavingEstateDefaults={isSavingOnboardingDefaults}
              canManageAccountCodes={isAdmin && !isPreviewMode}
              onAddStarterCodes={handleAddStarterCodes}
              isAddingStarterCodes={isAddingStarterCodes}
              canCreateLocation={isAdmin && !isPreviewMode}
              locationName={newLocationName}
              locationCode={newLocationCode}
              onLocationNameChange={setNewLocationName}
              onLocationCodeChange={setNewLocationCode}
              onCreateLocation={handleCreateLocation}
              isCreatingLocation={isCreatingLocation}
              isExpanded={isOnboardingExpanded}
              onExpandedChange={handleOnboardingExpandedChange}
            />
          </div>
        )}
        {showSetupComplete && (
          <SetupCompleteCard onTabChange={handleTabChange} />
        )}
        {activeTab !== DASHBOARD_LAUNCHER_TAB && activeTab !== "home" && !isMobile && tabMeta[activeTab] && (() => {
          const meta = tabMeta[activeTab]
          const Icon = meta.icon
          const groupStyle: Record<string, { icon: string; groupLabel: string }> = {
            operations: { icon: "bg-emerald-100/60 border-emerald-200/80 text-emerald-700", groupLabel: "Operations" },
            finance:    { icon: "bg-amber-100/60 border-amber-200/80 text-amber-700",       groupLabel: "Finance" },
            insights:   { icon: "bg-stone-100 border-stone-200 text-stone-600",             groupLabel: "Reports" },
            dashboard:  { icon: "bg-stone-100 border-stone-200 text-stone-600",             groupLabel: "" },
          }
          const gs = groupStyle[activeTabGroup] ?? groupStyle.dashboard
          return (
            <div className="mb-4 flex items-center gap-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", gs.icon)}>
                <Icon className="h-[17px] w-[17px]" />
              </span>
              <div>
                {gs.groupLabel && (
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 leading-none mb-0.5">{gs.groupLabel}</p>
                )}
                <h1 className="text-lg font-black text-stone-900 leading-tight">{meta.label}</h1>
              </div>
            </div>
          )
        })()}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
          {/* Sub-tab bar — desktop wraps, mobile scrolls horizontally */}
          {activeTab !== DASHBOARD_LAUNCHER_TAB && activeTabGroup !== "dashboard" && activeSectionTabs.length > 0 && (
            <div className={cn("sticky top-2 z-20 mb-1", isMobile && "top-0")}>
              {isMobile ? (
                /* Mobile: horizontal scroll strip — compact, pill-shaped, no wrap */
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 py-1 -mx-1">
                  {activeSectionTabs.map((tab) => {
                    const TabIcon = tab.icon
                    const isActive = activeTab === tab.value
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => handleTabChange(tab.value)}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-all touch-manipulation",
                          isActive
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_4px_12px_-4px_rgba(5,150,105,0.5)]"
                            : "border-black/10 bg-white text-neutral-600",
                        )}
                      >
                        <TabIcon className="h-3.5 w-3.5 shrink-0" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* Desktop: wrapping pill tabs with shadow card */
                <TabsList className="h-auto flex-wrap items-center gap-1.5 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm dark:border-white/[0.08] dark:bg-card">
                  {activeSectionTabs.map((tab) => {
                    const TabIcon = tab.icon
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="min-h-9 rounded-xl px-4 text-[13px] font-medium text-stone-500 data-[state=active]:bg-emerald-700 data-[state=active]:font-semibold data-[state=active]:text-white dark:text-stone-400 dark:data-[state=active]:bg-emerald-700 dark:data-[state=active]:text-white"
                      >
                        <TabIcon className="mr-2 h-4 w-4" />
                        {tab.label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              )}
            </div>
          )}

          {showTabSwitchLoader &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <BrandLoading compact />
              </div>,
              document.body,
            )}

          <TabsContent
            value={DASHBOARD_LAUNCHER_TAB}
            className="space-y-4"
            forceMount={isTabLoaded(DASHBOARD_LAUNCHER_TAB) ? true : undefined}
          >
            <WorkspaceLauncher
              sections={launcherSections}
              canShowAccounts={canShowAccounts}
              canShowRainfall={canShowRainfall}
              isMobile={isMobile}
              onTabChange={handleTabChange}
              onAccountsExpense={() => { setAccountsInitialTab("expenses"); handleTabChange("accounts") }}
              onAccountsLabor={() => { setAccountsInitialTab("labour"); handleTabChange("accounts") }}
              buildWorkspaceHref={buildWorkspaceHref}
              estateName={tenantSettings.estateName}
            />
          </TabsContent>

          <TabsContent value="home" className="space-y-6" forceMount={isTabLoaded("home") ? true : undefined}>
            {/* ── Desktop: season strip ── */}
            {!isMobile && (
              <SeasonProgressStrip
                fiscalYear={currentFiscalYear}
                progress={seasonProgress}
                activityStreak={activityStreak}
              />
            )}

            {/* ── Mobile home: estate header + gaps + quick log ── */}
            {isMobile && (
              <MobileHomeSection
                estateName={tenantSettings.estateName || ""}
                canShowAccounts={canShowAccounts}
                canShowRainfallSection={canShowRainfallSection}
                selectedLocationId={selectedLocationId}
                defaultWage={tenantSettings.laborWages?.defaultInHouseWage}
                onDrilldown={openDrilldown}
                onTabChange={handleTabChange}
                onOpenSidebar={() => setIsMobileSidebarOpen(true)}
              />
            )}

            {/* ── Morning Brief — desktop only ── */}
            {canShowIntelligence && !isMobile && (
              <MorningBriefCard
                highlights={intelligenceHighlights}
                insights={intelligenceInsights}
                actions={intelligenceActions}
                topCostCode={intelligenceTopCostCode}
                topFrequencyCode={intelligenceTopFrequencyCode}
                loading={intelligenceLoading}
                error={intelligenceError}
                visibleTabs={visibleTabs}
                farmAdvice={intelligenceBrief?.farmAdvice ?? null}
                onDrilldown={openDrilldown}
                inferTab={inferBriefTabFromText}
              />
            )}

            {!isMobile && <HomeKpiCardsGrid
              fiscalYear={currentFiscalYear}
              showFinancialHomeCards={showFinancialHomeCards}
              processingTotals={processingTotals}
              dispatchTotals={dispatchHeroTotals}
              dispatchReceivedKgsTotal={dispatchReceivedKgsTotal}
              salesTotals={salesHeroTotals}
              salesSoldKgsTotal={salesSoldKgsTotal}
              saleableCoffeeKgs={saleableCoffeeKgs}
              overdrawnCoffeeKgs={overdrawnCoffeeKgs}
              otherSalesTotals={otherSalesHeroTotals}
              revenueTotalsLoading={revenueTotalsLoading}
              revenueTotalsError={revenueTotalsError}
              coffeeRevenueTotal={coffeeRevenueTotal}
              otherRevenueTotal={otherRevenueTotal}
              totalRevenueAmount={totalRevenueAmount}
              costPerKgData={costPerKgData}
              seasonProjection={seasonProjection}
              canShowProcessing={canShowProcessing}
              canShowDispatch={canShowDispatch}
              canShowSales={canShowSales}
              canShowOtherSales={canShowOtherSales}
              canShowSeason={canShowSeason}
              selectedLocationId={selectedLocationId}
              onDrilldown={openDrilldown}
            />}

            {!isMobile && (
              <EstatePulseSection
                data={estatePulseData.data}
                loading={estatePulseData.loading}
                costPerKgData={costPerKgData}
              />
            )}

            {/* Recent Activity Feed — desktop only */}
            {!isMobile && (recentActivityLoading || (recentActivity && recentActivity.length > 0)) && (
              <RecentActivityFeed loading={recentActivityLoading} activity={recentActivity} />
            )}

            <HomeNavCard
              actions={mobileHomeQuickActions}
              isMobile={isMobile}
              onTabChange={handleTabChange}
            />

            <ExecutionScorecardCard
              checks={executionOutcomeChecks}
              onAction={handleExecutionOutcomeAction}
            />
            <EstateOverviewCard
              locationCount={estateMetrics.locationCount}
              recentActivity={estateMetrics.recentActivity}
              canShowProcessing={canShowProcessing}
              showTransactionHistory={showTransactionHistory}
              selectedLocationId={selectedLocationId}
              onDrilldown={openDrilldown}
            />

            {/* Today's Brief — moved lower, kept for spacing; actual render is at top of home */}

            {canShowAiAnalysis && !isScopedUser && (seasonCompareLoading || seasonCompareNarrative || seasonCompareError) && (
              <SeasonCompareCard
                loading={seasonCompareLoading}
                narrative={seasonCompareNarrative}
                error={seasonCompareError}
                fyLabels={seasonCompareFYLabels}
              />
            )}

            {canShowAiAnalysis && !isScopedUser && (
              <SmartInsightsCard
                loading={proactiveInsightsLoading}
                error={proactiveInsightsError}
                insights={proactiveInsights}
              />
            )}

            <PriorityAlertsCard
              loading={exceptionsLoading}
              error={exceptionsError}
              summary={exceptionsSummary}
              canShowSeason={canShowSeason}
              onOpenSeason={() => openDrilldown({ tab: "season" })}
              onOpenAlert={(alert) => openDrilldown({
                tab: resolveExceptionDrilldownTab(alert.metric),
                seasonAlertId: alert.id,
                seasonMetric: alert.metric || null,
              })}
            />
          </TabsContent>

          {canShowInventoryWorkspace && (
            <TabsContent value="inventory" className="space-y-6" forceMount={isTabLoaded("inventory") ? true : undefined}>
              {resolvedInventoryWorkspaceView !== "transactions" && !inventoryBannerDismissed && (
                <InventoryWorkspaceBanner
                  canShowAccounts={canShowAccounts}
                  onRecordUsage={() => openMovementDrawer("deplete")}
                  onOpenExpenses={() => { setAccountsInitialTab("expenses"); handleTabChange("accounts") }}
                  onDismiss={() => setInventoryBannerDismissed(true)}
                />
              )}
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
                <div className="grid lg:grid-cols-[1fr_auto]">
                  <div className="border-b border-stone-100 p-5 lg:border-b-0 lg:border-r dark:border-white/[0.05]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Inventory overview</p>
                    <p className="mt-1 text-2xl font-black text-stone-900 dark:text-white">
                      {resolvedInventoryWorkspaceView === "transactions" ? "Transaction History" : "Stock levels"}
                    </p>
                    <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                      {resolvedInventoryWorkspaceView === "transactions"
                        ? "Review and correct stock history without leaving Inventory."
                        : canShowAccounts
                          ? "Track restocks, stock usage, and corrections here. Use Accounts only when the same usage should also hit P&L."
                          : "Track restocks, stock usage, and corrections here."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-4 border-t border-stone-100 pt-4 dark:border-white/[0.05]">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">Location</p>
                        <p className="mt-0.5 text-sm font-semibold text-stone-800 dark:text-stone-200">{selectedLocationLabel}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">Items</p>
                        <p className="mt-0.5 text-sm font-black tabular-nums text-stone-800 dark:text-stone-200">{formatNumber(filteredInventoryTotals.itemCount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">Total qty</p>
                        <p className="mt-0.5 text-sm font-black tabular-nums text-stone-800 dark:text-stone-200">{formatNumber(filteredInventoryTotals.totalQuantity)} {filteredInventoryTotals.unitLabel}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">Value</p>
                        <p className="mt-0.5 text-sm font-black tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(filteredInventoryTotals.totalValue)}</p>
                      </div>
                    </div>
                  </div>
                  {showTransactionHistory && (
                    <div className="flex flex-col justify-center gap-2 p-5">
                      {resolvedInventoryWorkspaceView === "transactions" ? (
                        canShowInventory ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-lg border-stone-200"
                            onClick={() => setInventoryWorkspaceView("inventory")}
                          >
                            ← Back to inventory
                          </Button>
                        ) : (
                          <p className="text-xs text-stone-400">History view only for this module set.</p>
                        )
                      ) : (
                        <Button
                          type="button"
                          className="h-10 rounded-lg bg-emerald-700 font-semibold text-white hover:bg-emerald-600 dark:bg-emerald-700"
                          onClick={() => setInventoryWorkspaceView("transactions")}
                        >
                          Transaction history
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {resolvedInventoryWorkspaceView === "transactions" && showTransactionHistory ? (
                renderTransactionHistoryPanel()
              ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
                <div className="order-2 space-y-4 lg:order-1 lg:col-span-8">
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
                    <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-800 dark:bg-emerald-900/40">
                          <List className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Stock</p>
                          <p className="text-sm font-bold text-stone-900 dark:text-white">
                            Inventory Levels
                            {selectedLocationId !== LOCATION_ALL && (
                              <span className="ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-500">· {selectedLocationLabel}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {showDataToolsControls && (
                          <Button size="sm" variant="outline" onClick={exportInventoryToCSV} className="h-9 rounded-lg bg-transparent">
                            <Download className="mr-2 h-4 w-4" /> Export
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={openNewItemDialog}
                          className="h-9 rounded-lg bg-emerald-700 font-semibold text-white shadow-sm hover:bg-emerald-600 dark:bg-emerald-700"
                        >
                          <Plus className="mr-2 h-4 w-4" /> Add item
                        </Button>
                      </div>
                    </div>

                    {locations.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto border-b border-stone-100 px-5 py-3 dark:border-white/[0.05]">
                        <button
                          type="button"
                          onClick={() => setSelectedLocationId(LOCATION_ALL)}
                          className={cn(
                            "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors touch-manipulation",
                            selectedLocationId === LOCATION_ALL
                              ? "bg-emerald-700 text-white shadow-sm"
                              : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-stone-300",
                          )}
                        >
                          All
                        </button>
                        {locations.map((loc) => (
                          <button
                            key={loc.id}
                            type="button"
                            onClick={() => setSelectedLocationId(loc.id)}
                            className={cn(
                              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors touch-manipulation",
                              selectedLocationId === loc.id
                                ? "bg-emerald-700 text-white shadow-sm"
                                : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-stone-300",
                            )}
                          >
                            {loc.name || loc.code || "Unnamed"}
                          </button>
                        ))}
                        {(hasLegacyUnassignedTransactions || selectedLocationId === LOCATION_UNASSIGNED) && (
                          <button
                            type="button"
                            onClick={() => setSelectedLocationId(LOCATION_UNASSIGNED)}
                            className={cn(
                              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors touch-manipulation",
                              selectedLocationId === LOCATION_UNASSIGNED
                                ? "bg-emerald-700 text-white shadow-sm"
                                : "border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-stone-400",
                            )}
                          >
                            {UNASSIGNED_LABEL}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-3 sm:flex-row dark:border-white/[0.05]">
                      <div className="relative flex-grow">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                        <Input
                          placeholder="Search items…"
                          value={inventorySearchTerm}
                          onChange={(e) => setInventorySearchTerm(e.target.value)}
                          className="h-9 rounded-lg border-stone-200 bg-white pl-10"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleInventorySort}
                        className="flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border-stone-200 bg-white"
                      >
                        {inventorySortOrder === "asc" ? (
                          <><SortAsc className="mr-1 h-4 w-4" /> A–Z</>
                        ) : inventorySortOrder === "desc" ? (
                          <><SortDesc className="mr-1 h-4 w-4" /> Z–A</>
                        ) : (
                          <><SortAsc className="mr-1 h-4 w-4" /> Sort</>
                        )}
                      </Button>
                    </div>

                    <div className="divide-y divide-stone-100 dark:divide-white/[0.04]">
                      {filteredAndSortedInventory.map((item, index) => {
                        const valueInfo = resolveItemValue(item)
                        const itemValue = valueInfo.totalValue || 0
                        const avgPrice = valueInfo.avgPrice || 0
                        const itemInitial = item.name?.charAt(0)?.toUpperCase() || "I"
                        const isSelectedForDrilldown = item.name === inventoryDrilldownItemName
                        return (
                          <div
                            key={`${item.name}-${index}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openInventoryDrilldown(item.name)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                openInventoryDrilldown(item.name)
                              }
                            }}
                            className={cn(
                              "group cursor-pointer px-5 py-4 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300 dark:hover:bg-white/[0.02]",
                              isSelectedForDrilldown && "bg-emerald-50/60 dark:bg-emerald-900/10",
                            )}
                            aria-label={`Open drill-down for ${item.name}`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-sm font-black text-white dark:bg-stone-700">
                                  {itemInitial}
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-stone-900 dark:text-white">{item.name}</div>
                                  <div className="text-xs text-stone-400 dark:text-stone-500">
                                    {avgPrice > 0 ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="cursor-default underline decoration-dotted decoration-stone-300">
                                              Avg cost {formatCurrency(avgPrice)}/{item.unit || "unit"}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-[230px] text-xs leading-relaxed">
                                            Weighted average cost — FarmFlow divides total spend by total quantity each time you restock. Depletions are valued at this running average, not the original purchase price.
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      "Pricing not yet recorded"
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-5 sm:justify-end">
                                <div className="text-left sm:text-right">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">Qty</p>
                                  <p className="text-sm font-black tabular-nums text-stone-900 dark:text-white">
                                    {formatNumber(Number(item.quantity) || 0)} {item.unit}
                                  </p>
                                </div>
                                <div className="text-left sm:text-right">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">Value</p>
                                  <p className="text-sm font-black tabular-nums text-amber-700 dark:text-amber-400">
                                    {formatCurrency(itemValue)}
                                  </p>
                                </div>
                                {canManageRecords && (
                                  <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                handleOpenInventoryEdit(item)
                                              }}
                                              disabled={selectedLocationId === LOCATION_ALL}
                                              className="text-amber-600 p-2 h-auto"
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {selectedLocationId === LOCATION_ALL
                                            ? "Select a specific location to edit quantities."
                                            : "Edit inventory item"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleDeleteInventoryItem(item)
                                      }}
                                      className="text-red-600 p-2 h-auto"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {filteredAndSortedInventory.length === 0 &&
                      (inventorySearchTerm ? (
                        <div className="py-10 text-center text-sm text-stone-400 dark:text-stone-500">No items match your search.</div>
                      ) : inventory.length === 0 ? (
                        <div className="p-5">
                          <WorkflowEmptyState
                            title="No inventory items yet"
                            description="Start with the few items your team actually buys or consumes often. You do not need a perfect master list before starting."
                            steps={[
                              "Add the real item name and unit your team uses on the estate.",
                              "Set the opening quantity only if you know it well enough today.",
                              "Use later restocks and depletions to keep the running balance honest.",
                            ]}
                            tip="A short, clean list is better than importing every possible item too early. Start with fertilizers, chemicals, fuel, bags, or anything used weekly."
                            askPrompt="How do I set up my first inventory item?"
                            primaryAction={{ label: "Add first item", onClick: openNewItemDialog }}
                          />
                        </div>
                      ) : (
                        <div className="py-10 text-center text-sm text-stone-400 dark:text-stone-500">
                          {selectedLocationId !== LOCATION_ALL
                            ? "No inventory items in this location yet. Change the location filter or add stock here."
                            : "Inventory is empty or not yet loaded."}
                        </div>
                      ))}
                  </div>
                </div>

                <div className="order-1 flex flex-col gap-6 lg:order-2 lg:col-span-4 lg:self-start">
                  {canShowSeason && (
                    <InventorySystemAlerts
                      loading={exceptionsLoading}
                      error={exceptionsError}
                      summary={exceptionsSummary}
                      onOpenSeason={() => openDrilldown({ tab: "season" })}
                      onOpenAlert={(alert) => openDrilldown({
                        tab: resolveExceptionDrilldownTab(alert.metric),
                        seasonAlertId: alert.id,
                        seasonMetric: alert.metric || null,
                      })}
                    />
                  )}
                  <InventoryQuickActionsSidebar
                    showDataToolsControls={showDataToolsControls}
                    showTransactionHistory={showTransactionHistory}
                    selectedMovementUnit={selectedMovementUnit}
                    drilledItemName={inventoryDrilldownItemName}
                    onRecordMovement={openMovementDrawer}
                    onExportInventory={exportInventoryToCSV}
                    onViewTransactions={() => setInventoryWorkspaceView("transactions")}
                    onViewItemHistory={() => setIsInventoryDrilldownOpen(true)}
                  />
                </div>
              </div>
              )}
            </TabsContent>
          )}

          {canShowAccounts && (
            <TabsContent value="accounts" className="space-y-6" forceMount={isTabLoaded("accounts") ? true : undefined}>
              <AccountsPage
                showDataToolsControls={showDataToolsControls}
                requestedExport={accountsExportRequest}
                onRequestedExportHandled={handleAccountsExportRequestHandled}
                initialTab={accountsInitialTab}
                showLaborManagement={canShowLaborManagement}
                showPickingLog={canShowPickingLog}
              />
            </TabsContent>
          )}

          {canShowBalanceSheet && (
            <TabsContent value="balance-sheet" className="space-y-6" forceMount={isTabLoaded("balance-sheet") ? true : undefined}>
              <BalanceSheetTab />
            </TabsContent>
          )}

          {canShowSeasonPl && (
            <TabsContent value="season-pl" className="space-y-6" forceMount={isTabLoaded("season-pl") ? true : undefined}>
              <SeasonPlTab />
            </TabsContent>
          )}

          {canShowReceivables && (
            <TabsContent value="receivables" className="space-y-6" forceMount={isTabLoaded("receivables") ? true : undefined}>
              <ReceivablesTab />
            </TabsContent>
          )}

          {canShowProcessingWorkspace && (
            <TabsContent value="processing" className="space-y-6" forceMount={isTabLoaded("processing") ? true : undefined}>
              <ProcessingWorkspace
                canShowProcessing={canShowProcessing}
                canShowPepper={canShowPepper}
                canShowRubber={canShowRubber}
                resolvedView={resolvedProcessingWorkspaceView}
                showDataToolsControls={showDataToolsControls}
                onViewChange={setProcessingWorkspaceView}
                ProcessingTab={ProcessingTab as any}
                PepperTab={PepperTab as any}
                RubberTab={RubberTab as any}
              />
            </TabsContent>
          )}
          {canShowDispatch && (
            <TabsContent value="dispatch" className="space-y-6" forceMount={isTabLoaded("dispatch") ? true : undefined}>
              <DispatchTab showDataToolsControls={showDataToolsControls} />
            </TabsContent>
          )}
          {canShowSalesWorkspace && (
            <TabsContent value="sales" className="space-y-6" forceMount={isTabLoaded("sales") ? true : undefined}>
              <SalesTab
                showDataToolsControls={showDataToolsControls}
                coffeeSalesEnabled={canShowSales}
                otherSalesEnabled={canShowOtherSales}
                activeWorkspaceView={salesWorkspaceView}
                onWorkspaceViewChange={setSalesWorkspaceView}
              />
            </TabsContent>
          )}
          {canShowCuring && (
            <TabsContent value="curing" className="space-y-6" forceMount={isTabLoaded("curing") ? true : undefined}>
              <CuringTab />
            </TabsContent>
          )}
          {canShowQuality && (
            <TabsContent value="quality" className="space-y-6" forceMount={isTabLoaded("quality") ? true : undefined}>
              <QualityGradingTab />
            </TabsContent>
          )}
          {canShowSeason && (
            <TabsContent value="season" className="space-y-6" forceMount={isTabLoaded("season") ? true : undefined}>
              <SeasonDashboard />
            </TabsContent>
          )}
          {canShowYieldForecast && (
            <TabsContent value="yield-forecast" className="space-y-6" forceMount={isTabLoaded("yield-forecast") ? true : undefined}>
              <YieldForecastTab />
            </TabsContent>
          )}
          {canShowActivityLog && (
            <TabsContent value="activity-log" className="space-y-6" forceMount={isTabLoaded("activity-log") ? true : undefined}>
              <ActivityLogTab tenantId={activityTenantId} />
            </TabsContent>
          )}
          {canShowRainfallSection && (
            <TabsContent value="rainfall" className="space-y-6" forceMount={isTabLoaded("rainfall") ? true : undefined}>
              <RainfallWeatherTab
                username={user?.username || "system"}
                showRainfall={canShowRainfall}
                showWeather={canShowWeather}
                showDataToolsControls={showDataToolsControls}
              />
            </TabsContent>
          )}
          {canShowDocuments && (
            <TabsContent value="documents" className="space-y-6" forceMount={isTabLoaded("documents") ? true : undefined}>
              <DocumentsTab />
            </TabsContent>
          )}
          {canShowJournal && (
            <TabsContent value="journal" className="space-y-6" forceMount={isTabLoaded("journal") ? true : undefined}>
              <JournalTab />
            </TabsContent>
          )}
          {canShowResources && (
            <TabsContent value="resources" className="space-y-6" forceMount={isTabLoaded("resources") ? true : undefined}>
              <ResourcesTab />
            </TabsContent>
          )}
          {canShowPlantHealth && (
            <TabsContent value="plant-health" className="space-y-6" forceMount={isTabLoaded("plant-health") ? true : undefined}>
              <PlantHealthTab />
            </TabsContent>
          )}
          {canShowAiAnalysis && (
            <TabsContent value="ai-analysis" className="space-y-6" forceMount={isTabLoaded("ai-analysis") ? true : undefined}>
              <AiAnalysisCharts inventory={inventory} transactions={transactions} />

              <AiAnalysisCard
                isAnalyzing={isAnalyzing}
                error={analysisError}
                analysis={aiAnalysis}
                onGenerate={generateAIAnalysis}
              />
            </TabsContent>
          )}
          {canShowNews && (
            <TabsContent value="news" className="space-y-6" forceMount={isTabLoaded("news") ? true : undefined}>
              <NewsTab />
            </TabsContent>
          )}
          {canShowMarketPricing && (
            <TabsContent value="market-pricing" className="space-y-6" forceMount={isTabLoaded("market-pricing") ? true : undefined}>
              <MarketPricingTab />
            </TabsContent>
          )}
          {canShowCompliance && (
            <TabsContent value="compliance" className="space-y-6" forceMount={isTabLoaded("compliance") ? true : undefined}>
              <ComplianceTab />
            </TabsContent>
          )}
          {canShowBilling && (
            <TabsContent value="billing" className="space-y-6" forceMount={isTabLoaded("billing") ? true : undefined}>
              <BillingTab showDataToolsControls={showDataToolsControls} />
            </TabsContent>
          )}
        </Tabs>
        {isInventoryDrilldownOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setIsInventoryDrilldownOpen(false)}
          >
            <div
              className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto p-4 sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              {inventoryDrilldownPanel}
            </div>
          </div>
        )}
        {isMovementDrawerOpen && (
          <div
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setIsMovementDrawerOpen(false)}
          >
            <div
              className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto p-4 sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              {recordMovementPanel}
            </div>
          </div>
        )}
        <InventoryDialogs
          isMobile={isMobile}
          locations={locations}
          preventNegativeKey={preventNegativeKey}
          preventNumberScrollChange={preventNumberScrollChange}
          coerceNonNegativeNumber={coerceNonNegativeNumber}
          isNewItemDialogOpen={isNewItemDialogOpen}
          newItemForm={newItemForm}
          isSavingNewItem={isSavingNewItem}
          setIsNewItemDialogOpen={setIsNewItemDialogOpen}
          setNewItemForm={setNewItemForm}
          resetNewItemForm={resetNewItemForm}
          handleCreateNewItem={handleCreateNewItem}
          isEditDialogOpen={isEditDialogOpen}
          editingTransaction={editingTransaction}
          isSavingTransactionEdit={isSavingTransactionEdit}
          setIsEditDialogOpen={setIsEditDialogOpen}
          setEditingTransaction={setEditingTransaction}
          handleEditTransactionChange={handleEditTransactionChange}
          handleUpdateTransaction={handleUpdateTransaction}
          handleDeleteConfirm={handleDeleteConfirm}
          isInventoryEditDialogOpen={isInventoryEditDialogOpen}
          editingInventoryItem={editingInventoryItem}
          inventoryEditForm={inventoryEditForm}
          isSavingInventoryEdit={isSavingInventoryEdit}
          inventoryEditLocationId={inventoryEditLocationId}
          setIsInventoryEditDialogOpen={setIsInventoryEditDialogOpen}
          setEditingInventoryItem={setEditingInventoryItem}
          setInventoryEditForm={setInventoryEditForm}
          setInventoryEditLocationId={setInventoryEditLocationId}
          handleSaveInventoryEdit={handleSaveInventoryEdit}
          deleteConfirmDialogOpen={deleteConfirmDialogOpen}
          setDeleteConfirmDialogOpen={setDeleteConfirmDialogOpen}
          setTransactionToDelete={setTransactionToDelete}
          handleDeleteTransaction={handleDeleteTransaction}
        />
      </div>
      </div>
    </div>
  )
}
