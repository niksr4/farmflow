"use client"

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react"
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
import WorkspaceHints from "@/components/workspace-hints"
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
  ExceptionSummaryAlert,
  IntelligenceBrief,
  LocationOption,
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

type AccountsWorkspaceTab = "labor" | "expenses" | "attendance" | "activities" | "workers" | "picking" | "ledger" | "payroll"
type SmartNextStepTone = "progress" | "attention" | "help"
type SmartNextStep = {
  id: string
  tone: SmartNextStepTone
  title: string
  description: string
  reason: string
  actionLabel: string
  actionTab: string
  askPrompt?: string
}

const ACCOUNTS_WORKSPACE_TABS: AccountsWorkspaceTab[] = [
  "labor",
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
  const [processingTotals, setProcessingTotals] = useState({
    arabicaKg: 0,
    arabicaBags: 0,
    robustaKg: 0,
    robustaBags: 0,
    loading: false,
    error: null as string | null,
  })
  const [dispatchHeroTotals, setDispatchHeroTotals] = useState({
    arabicaBags: 0,
    arabicaKgs: 0,
    robustaBags: 0,
    robustaKgs: 0,
    totalDispatches: 0,
    loading: false,
    error: null as string | null,
  })
  const [salesHeroTotals, setSalesHeroTotals] = useState({
    arabicaBags: 0,
    arabicaKgs: 0,
    robustaBags: 0,
    robustaKgs: 0,
    totalSales: 0,
    totalRevenue: 0,
    loading: false,
    error: null as string | null,
  })
  const [otherSalesHeroTotals, setOtherSalesHeroTotals] = useState({
    totalRevenue: 0,
    totalCount: 0,
    loading: false,
    error: null as string | null,
  })
  const [curingHeroTotals, setCuringHeroTotals] = useState({
    totalRecords: 0,
    totalOutputKg: 0,
    avgDryingDays: 0,
    avgMoistureDrop: 0,
    loading: false,
    error: null as string | null,
  })
  const [qualityHeroTotals, setQualityHeroTotals] = useState({
    totalRecords: 0,
    avgCupScore: 0,
    avgOutturnPct: 0,
    avgDefects: 0,
    loading: false,
    error: null as string | null,
  })
  const [pepperHeroTotals, setPepperHeroTotals] = useState({
    totalRecords: 0,
    totalPickedKg: 0,
    totalDryKg: 0,
    avgDryPercent: 0,
    loading: false,
    error: null as string | null,
  })
  const [rubberHeroTotals, setRubberHeroTotals] = useState({
    totalRecords: 0,
    totalLatexKg: 0,
    totalSheetsKg: 0,
    avgDrcPct: 0,
    loading: false,
    error: null as string | null,
  })
  const [rainfallHeroTotals, setRainfallHeroTotals] = useState({
    totalRecords: 0,
    totalInches: 0,
    latestDate: null as string | null,
    loading: false,
    error: null as string | null,
  })
  const [receivablesHeroTotals, setReceivablesHeroTotals] = useState({
    totalInvoiced: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
    totalPaid: 0,
    totalCount: 0,
    loading: false,
    error: null as string | null,
  })
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
  const [exceptionsSummary, setExceptionsSummary] = useState<{
    count: number
    highlights: string[]
    alerts: ExceptionSummaryAlert[]
  }>({
    count: 0,
    highlights: [],
    alerts: [],
  })
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exceptionsError, setExceptionsError] = useState<string | null>(null)
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
  const canLaunchAssistant = canShowAiAnalysis && (!isOwner || isPreviewMode)
  const canShowNews = isModuleEnabled("news")
  const canShowMarketPricing = isModuleEnabled("market-pricing")
  const canShowCompliance = isModuleEnabled("compliance")
  const canShowWeather = isModuleEnabled("weather")
  const canShowSeason = isModuleEnabled("season")
  const canShowYieldForecast = canShowSeason
  const canShowActivityLog = (isAdmin || isOwner) && isFeatureEnabled("showActivityLogTab")
  const canShowLaborManagement = isModuleEnabled("labor")
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
      if (typeof data.trialDaysRemaining === "number") setTrialDaysRemaining(data.trialDaysRemaining)
      resolved = true
      return true
    } catch (error) {
      console.error("Failed to load workspace bootstrap:", error)
      return false
    } finally {
      setIsModulesLoading(false)
      setHasResolvedModules(resolved)
    }
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

      const [cpkRes, projRes] = await Promise.allSettled([
        fetch("/api/dashboard/cost-per-kg").then((r) => r.json()),
        fetch("/api/dashboard/season-projection").then((r) => r.json()),
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
    }

    void fetchIntelligence()
    return () => { active = false }
  }, [activeTab, tenantId])

  useEffect(() => {
    if (selectedLocationId !== LOCATION_ALL) {
      setTransactionLocationId(selectedLocationId)
    }
  }, [selectedLocationId])

  useEffect(() => {
    if (
      transactionLocationId !== LOCATION_UNASSIGNED &&
      transactionLocationId !== LOCATION_ALL &&
      !locations.find((loc) => loc.id === transactionLocationId)
    ) {
      setTransactionLocationId(LOCATION_UNASSIGNED)
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
      }
      const locationsEndpoint =
        isPreviewMode && previewTenantId
          ? `/api/locations?tenantId=${encodeURIComponent(previewTenantId)}`
          : "/api/locations"
      const requests = getOnboardingStatusRequests(locationsEndpoint, onboardingAccess)

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

        nextStatus[request.key as Exclude<OnboardingStatusKey, "locations" | "account_codes" | "inventory">] = hasRecords(payload)
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

  // Refresh checklist when labor, expense, or picking tabs save a record
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

  type HeroChip = { icon: React.ElementType; label: string; metricValue?: number | null }
  type HeroStat = { label: string; value: string; subValue?: string; metricValue?: number | null }
  type HeroContent = {
    badge: string
    title: string
    description: string
    chips: HeroChip[]
    stats: HeroStat[]
  }

  const filterEmptyMetrics = useCallback(
    <T extends { metricValue?: number | null }>(items: T[]) => {
      if (!hideEmptyMetrics) return items
      const filtered = items.filter((item) => item.metricValue === undefined || item.metricValue === null || item.metricValue !== 0)
      return filtered.length ? filtered : items
    },
    [hideEmptyMetrics],
  )

  const heroContent: HeroContent = useMemo(() => {
    const inventoryValueStat: HeroStat = {
      label: "Inventory value",
      value: formatCurrency(resolvedInventoryValue, 0),
      metricValue: resolvedInventoryValue,
    }
    const activeLocationsStat: HeroStat = {
      label: "Active locations",
      value: formatCount(estateMetrics.locationCount),
      metricValue: estateMetrics.locationCount,
    }
    const recentActivityStat: HeroStat = {
      label: "24h activity",
      value: formatCount(estateMetrics.recentActivity),
      metricValue: estateMetrics.recentActivity,
    }
    const unassignedStat: HeroStat = {
      label: "Unassigned moves",
      value: formatCount(unassignedTransactions),
      metricValue: unassignedTransactions,
    }
    const totalTransactionsStat: HeroStat = {
      label: "Total transactions",
      value: formatCount(totalTransactions),
      metricValue: totalTransactions,
    }
    const exceptionsStat: HeroStat = {
      label: "Exceptions",
      value: formatCount(exceptionsSummary.count),
      metricValue: exceptionsSummary.count,
    }
    const availableStockUnit =
      filteredInventoryTotals.unitLabel === "mixed units" ? "units" : filteredInventoryTotals.unitLabel
    const availableStockValue = `${formatNumber(filteredInventoryTotals.totalQuantity, 0)} ${availableStockUnit}`
    const availableStockStat: HeroStat = {
      label: "Available to use",
      value: availableStockValue,
      metricValue: filteredInventoryTotals.totalQuantity,
    }

    const inventoryStats: HeroStat[] = [
      inventoryValueStat,
      availableStockStat,
      exceptionsStat,
    ]

    const transactionStats: HeroStat[] = [
      totalTransactionsStat,
      unassignedStat,
      recentActivityStat,
    ]

    const arabicaProcessingStat: HeroStat = {
      label: "Arabica total",
      value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.arabicaKg, 0)} kg`,
      subValue: processingTotals.loading ? undefined : `${formatNumber(processingTotals.arabicaBags, 0)} bags`,
      metricValue: processingTotals.loading ? null : processingTotals.arabicaKg,
    }
    const robustaProcessingStat: HeroStat = {
      label: "Robusta total",
      value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.robustaKg, 0)} kg`,
      subValue: processingTotals.loading ? undefined : `${formatNumber(processingTotals.robustaBags, 0)} bags`,
      metricValue: processingTotals.loading ? null : processingTotals.robustaKg,
    }

    const processingTotalsStats: HeroStat[] = [
      arabicaProcessingStat,
      robustaProcessingStat,
      activeLocationsStat,
    ]

    const curingStats: HeroStat[] = [
      {
        label: "Curing output",
        value: curingHeroTotals.loading
          ? "Loading..."
          : curingHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(curingHeroTotals.totalOutputKg, 0)} kg`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.totalOutputKg,
      },
      {
        label: "Avg drying days",
        value: curingHeroTotals.loading
          ? "Loading..."
          : curingHeroTotals.error
            ? "Unavailable"
            : formatNumber(curingHeroTotals.avgDryingDays, 1),
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.avgDryingDays,
      },
      {
        label: "Avg moisture drop",
        value: curingHeroTotals.loading
          ? "Loading..."
          : curingHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(curingHeroTotals.avgMoistureDrop, 1)}%`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.avgMoistureDrop,
      },
    ]

    const qualityStats: HeroStat[] = [
      {
        label: "Lots graded",
        value: qualityHeroTotals.loading
          ? "Loading..."
          : qualityHeroTotals.error
            ? "Unavailable"
            : formatCount(qualityHeroTotals.totalRecords),
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.totalRecords,
      },
      {
        label: "Avg cup score",
        value: qualityHeroTotals.loading
          ? "Loading..."
          : qualityHeroTotals.error
            ? "Unavailable"
            : formatNumber(qualityHeroTotals.avgCupScore, 1),
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.avgCupScore,
      },
      {
        label: "Avg outturn",
        value: qualityHeroTotals.loading
          ? "Loading..."
          : qualityHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(qualityHeroTotals.avgOutturnPct, 1)}%`,
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.avgOutturnPct,
      },
    ]

    const pepperConversionPct = pepperHeroTotals.totalPickedKg > 0
      ? (pepperHeroTotals.totalDryKg / pepperHeroTotals.totalPickedKg) * 100
      : 0
    const pepperDryPercent = pepperHeroTotals.avgDryPercent > 0 ? pepperHeroTotals.avgDryPercent : pepperConversionPct
    const pepperStats: HeroStat[] = [
      {
        label: "Picked weight",
        value: pepperHeroTotals.loading
          ? "Loading..."
          : pepperHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(pepperHeroTotals.totalPickedKg, 0)} kg`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperHeroTotals.totalPickedKg,
      },
      {
        label: "Dry pepper",
        value: pepperHeroTotals.loading
          ? "Loading..."
          : pepperHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(pepperHeroTotals.totalDryKg, 0)} kg`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperHeroTotals.totalDryKg,
      },
      {
        label: "Dry conversion",
        value: pepperHeroTotals.loading
          ? "Loading..."
          : pepperHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(pepperDryPercent, 1)}%`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperDryPercent,
      },
    ]

    const rubberSheetYieldPct = rubberHeroTotals.totalLatexKg > 0
      ? (rubberHeroTotals.totalSheetsKg / rubberHeroTotals.totalLatexKg) * 100
      : 0
    const rubberStats: HeroStat[] = [
      {
        label: "Latex collected",
        value: rubberHeroTotals.loading
          ? "Loading..."
          : rubberHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(rubberHeroTotals.totalLatexKg, 0)} kg`,
        metricValue: rubberHeroTotals.loading || rubberHeroTotals.error ? null : rubberHeroTotals.totalLatexKg,
      },
      {
        label: "Sheets produced",
        value: rubberHeroTotals.loading
          ? "Loading..."
          : rubberHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(rubberHeroTotals.totalSheetsKg, 0)} kg`,
        metricValue: rubberHeroTotals.loading || rubberHeroTotals.error ? null : rubberHeroTotals.totalSheetsKg,
      },
      {
        label: "Sheet yield",
        value: rubberHeroTotals.loading
          ? "Loading..."
          : rubberHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(rubberSheetYieldPct, 1)}%`,
        metricValue: rubberHeroTotals.loading || rubberHeroTotals.error ? null : rubberSheetYieldPct,
      },
    ]

    const showRainfallMetrics = isModuleEnabled("rainfall")
    const latestRainLabel = rainfallHeroTotals.latestDate ? formatDate(rainfallHeroTotals.latestDate) : "No logs"
    const rainfallStats: HeroStat[] = showRainfallMetrics
      ? [
          {
            label: `Rainfall (${currentFiscalYear.label})`,
            value: rainfallHeroTotals.loading
              ? "Loading..."
              : rainfallHeroTotals.error
                ? "Unavailable"
                : `${formatNumber(rainfallHeroTotals.totalInches, 2)} in`,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalInches,
          },
          {
            label: "Rain logs",
            value: rainfallHeroTotals.loading
              ? "Loading..."
              : rainfallHeroTotals.error
                ? "Unavailable"
                : formatCount(rainfallHeroTotals.totalRecords),
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
          {
            label: "Latest rain log",
            value: rainfallHeroTotals.loading ? "Loading..." : rainfallHeroTotals.error ? "Unavailable" : latestRainLabel,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
        ]
      : [
          { label: "Forecast horizon", value: "8 days", metricValue: 8 },
          activeLocationsStat,
          recentActivityStat,
        ]

    const weatherStats: HeroStat[] = [
      { label: "Forecast horizon", value: "8 days", metricValue: 8 },
      {
        label: "Rain logs (FY)",
        value: showRainfallMetrics ? formatCount(rainfallHeroTotals.totalRecords) : "Unavailable",
        metricValue: showRainfallMetrics ? rainfallHeroTotals.totalRecords : null,
      },
      activeLocationsStat,
    ]

    const dispatchArabicaValue = dispatchHeroTotals.loading
      ? "Loading..."
      : dispatchHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(dispatchHeroTotals.arabicaKgs, 0)} kg`
    const dispatchRobustaValue = dispatchHeroTotals.loading
      ? "Loading..."
      : dispatchHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(dispatchHeroTotals.robustaKgs, 0)} kg`
    const dispatchTotalReceivedKgs = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
    const salesTotalSoldKgs = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
    const saleableKgs = Math.max(0, dispatchTotalReceivedKgs - salesTotalSoldKgs)
    const overdrawnKgs = Math.max(0, salesTotalSoldKgs - dispatchTotalReceivedKgs)
    const dispatchArabicaStat: HeroStat = {
      label: "Arabica received",
      value: dispatchArabicaValue,
      subValue: dispatchHeroTotals.loading ? undefined : `${formatNumber(dispatchHeroTotals.arabicaBags, 0)} bags dispatched`,
      metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.arabicaKgs,
    }
    const dispatchRobustaStat: HeroStat = {
      label: "Robusta received",
      value: dispatchRobustaValue,
      subValue: dispatchHeroTotals.loading ? undefined : `${formatNumber(dispatchHeroTotals.robustaBags, 0)} bags dispatched`,
      metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.robustaKgs,
    }
    const dispatchEntriesStat: HeroStat = {
      label: "Dispatch entries",
      value: dispatchHeroTotals.loading
        ? "Loading..."
        : dispatchHeroTotals.error
          ? "Unavailable"
          : formatCount(dispatchHeroTotals.totalDispatches),
      metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.totalDispatches,
    }
    const dispatchStats: HeroStat[] = [
      dispatchArabicaStat,
      dispatchRobustaStat,
      dispatchEntriesStat,
    ]

    const salesArabicaValue = salesHeroTotals.loading
      ? "Loading..."
      : salesHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(salesHeroTotals.arabicaKgs, 0)} kg`
    const salesRobustaValue = salesHeroTotals.loading
      ? "Loading..."
      : salesHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(salesHeroTotals.robustaKgs, 0)} kg`
    const salesArabicaStat: HeroStat = {
      label: "Arabica sold",
      value: salesArabicaValue,
      subValue: salesHeroTotals.loading ? undefined : `${formatNumber(salesHeroTotals.arabicaBags, 0)} bags sold`,
      metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.arabicaKgs,
    }
    const salesRobustaStat: HeroStat = {
      label: "Robusta sold",
      value: salesRobustaValue,
      subValue: salesHeroTotals.loading ? undefined : `${formatNumber(salesHeroTotals.robustaBags, 0)} bags sold`,
      metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.robustaKgs,
    }
    const salesAvailabilityStat: HeroStat = {
      label: overdrawnKgs > 0 ? "Overdrawn" : "Saleable stock",
      value: salesHeroTotals.loading || dispatchHeroTotals.loading
        ? "Loading..."
        : salesHeroTotals.error || dispatchHeroTotals.error
          ? "Unavailable"
          : `${formatNumber(overdrawnKgs > 0 ? overdrawnKgs : saleableKgs, 0)} kg`,
      subValue:
        salesHeroTotals.loading || dispatchHeroTotals.loading
          ? undefined
          : overdrawnKgs > 0
            ? "Sold exceeds dispatch-received KGs"
            : "Dispatch received KGs minus sold KGs",
      metricValue:
        salesHeroTotals.loading || dispatchHeroTotals.loading ? null : overdrawnKgs > 0 ? overdrawnKgs : saleableKgs,
    }
    const salesStats: HeroStat[] = [
      salesArabicaStat,
      salesRobustaStat,
      salesAvailabilityStat,
    ]

    const accountsStats: HeroStat[] = [
      {
        label: "FY total spend",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.grandTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.grandTotal,
      },
      {
        label: "FY labor spend",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.laborTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.laborTotal,
      },
      {
        label: "FY other expenses",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.otherTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.otherTotal,
      },
    ]

    const totalBookedRevenue = salesHeroTotals.totalRevenue + otherSalesHeroTotals.totalRevenue
    const totalBookedRevenueLoading = salesHeroTotals.loading || otherSalesHeroTotals.loading
    const totalBookedRevenueError = salesHeroTotals.error || otherSalesHeroTotals.error
    // Inventory value is an asset, not a P&L expense — exclude it from booked outflow.
    // Consumable usage costs flow through expense_transactions in Accounts instead.
    const totalCostValue = accountsTotals.grandTotal
    const totalCostLoading = accountsTotalsLoading || loading
    const balanceNetBooked = totalBookedRevenue - totalCostValue
    const balanceLivePosition = balanceNetBooked + receivablesHeroTotals.totalOutstanding
    const balanceSheetStats: HeroStat[] = [
      {
        label: "Booked inflow",
        value: totalBookedRevenueLoading ? "Loading..." : totalBookedRevenueError ? "Unavailable" : formatCurrency(totalBookedRevenue, 0),
        metricValue: totalBookedRevenueLoading || totalBookedRevenueError ? null : totalBookedRevenue,
      },
      {
        label: "Booked outflow",
        value: totalCostLoading ? "Loading..." : formatCurrency(totalCostValue, 0),
        metricValue: totalCostLoading ? null : totalCostValue,
      },
      {
        label: "Live position",
        value:
          totalCostLoading || receivablesHeroTotals.loading || totalBookedRevenueLoading
            ? "Loading..."
            : totalBookedRevenueError
              ? "Unavailable"
            : formatCurrency(balanceLivePosition, 0),
        metricValue:
          totalCostLoading || receivablesHeroTotals.loading || totalBookedRevenueLoading || totalBookedRevenueError
            ? null
            : balanceLivePosition,
      },
    ]

    const receivablesStats: HeroStat[] = [
      {
        label: "Total invoiced",
        value: receivablesHeroTotals.loading
          ? "Loading..."
          : receivablesHeroTotals.error
            ? "Unavailable"
            : formatCurrency(receivablesHeroTotals.totalInvoiced, 0),
        metricValue:
          receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalInvoiced,
      },
      {
        label: "Outstanding",
        value: receivablesHeroTotals.loading
          ? "Loading..."
          : receivablesHeroTotals.error
            ? "Unavailable"
            : formatCurrency(receivablesHeroTotals.totalOutstanding, 0),
        metricValue:
          receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalOutstanding,
      },
      {
        label: "Overdue",
        value: receivablesHeroTotals.loading
          ? "Loading..."
          : receivablesHeroTotals.error
            ? "Unavailable"
            : formatCurrency(receivablesHeroTotals.totalOverdue, 0),
        metricValue: receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalOverdue,
      },
    ]

    const chipsInventory: HeroChip[] = [
      { icon: Leaf, label: bagWeightLabel, metricValue: bagWeightValue },
      { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
    ]

    const chipsTransactions: HeroChip[] = [
      { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
      { icon: AlertTriangle, label: unassignedLabel, metricValue: unassignedTransactions },
    ]

    const chipsSales: HeroChip[] = [
      {
        icon: TrendingUp,
        label: salesHeroTotals.loading
          ? "Sales totals loading..."
          : salesHeroTotals.error
            ? "Sales totals unavailable"
            : `Sales entries: ${formatCount(salesHeroTotals.totalSales)}`,
        metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.totalSales,
      },
      {
        icon: Receipt,
        label:
          salesHeroTotals.loading || dispatchHeroTotals.loading
            ? "Saleable stock loading..."
            : salesHeroTotals.error || dispatchHeroTotals.error
              ? "Saleable stock unavailable"
              : overdrawnKgs > 0
                ? `Overdrawn by ${formatNumber(overdrawnKgs, 0)} kg`
                : `Saleable now: ${formatNumber(saleableKgs, 0)} kg`,
        metricValue:
          salesHeroTotals.loading || dispatchHeroTotals.loading || salesHeroTotals.error || dispatchHeroTotals.error
            ? null
            : overdrawnKgs > 0
              ? overdrawnKgs
              : saleableKgs,
      },
    ]

    const chipsProcessing: HeroChip[] = [
      { icon: Factory, label: "Clean pulping records keep yields consistent", metricValue: null },
      { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
    ]

    const chipsCuring: HeroChip[] = [
      {
        icon: Factory,
        label: curingHeroTotals.loading
          ? "Curing totals loading..."
          : curingHeroTotals.error
            ? "Curing totals unavailable"
            : `Curing entries: ${formatCount(curingHeroTotals.totalRecords)}`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.totalRecords,
      },
      {
        icon: CheckCircle2,
        label: curingHeroTotals.loading
          ? "Moisture trend loading..."
          : curingHeroTotals.error
            ? "Moisture trend unavailable"
            : `Avg moisture drop: ${formatNumber(curingHeroTotals.avgMoistureDrop, 1)}%`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.avgMoistureDrop,
      },
    ]

    const chipsQuality: HeroChip[] = [
      {
        icon: CheckCircle2,
        label: qualityHeroTotals.loading
          ? "Quality totals loading..."
          : qualityHeroTotals.error
            ? "Quality totals unavailable"
            : `Quality entries: ${formatCount(qualityHeroTotals.totalRecords)}`,
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.totalRecords,
      },
      {
        icon: AlertTriangle,
        label: qualityHeroTotals.loading
          ? "Defect trend loading..."
          : qualityHeroTotals.error
            ? "Defect trend unavailable"
            : `Avg defects: ${formatNumber(qualityHeroTotals.avgDefects, 1)}`,
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.avgDefects,
      },
    ]

    const chipsDispatch: HeroChip[] = [
      {
        icon: Truck,
        label: dispatchHeroTotals.loading
          ? "Dispatch totals loading..."
          : dispatchHeroTotals.error
            ? "Dispatch totals unavailable"
            : `Dispatch entries: ${formatCount(dispatchHeroTotals.totalDispatches)}`,
        metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.totalDispatches,
      },
      {
        icon: Factory,
        label: dispatchHeroTotals.loading
          ? "Dispatch volume loading..."
          : dispatchHeroTotals.error
            ? "Dispatch volume unavailable"
            : `Received for sales: ${formatNumber(dispatchTotalReceivedKgs, 0)} kg`,
        metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchTotalReceivedKgs,
      },
    ]

    const chipsRainfall: HeroChip[] = showRainfallMetrics
      ? [
          {
            icon: CloudRain,
            label: rainfallHeroTotals.loading
              ? "Rainfall totals loading..."
              : rainfallHeroTotals.error
                ? "Rainfall totals unavailable"
                : `Rain logs: ${formatCount(rainfallHeroTotals.totalRecords)}`,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
          {
            icon: CloudRain,
            label: rainfallHeroTotals.loading
              ? "Latest rain loading..."
              : rainfallHeroTotals.error
                ? "Latest rain unavailable"
                : `Latest log: ${latestRainLabel}`,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
        ]
      : [
          { icon: CloudRain, label: "Forecast source: Weather API", metricValue: null },
          { icon: Leaf, label: "Use weather context for field planning", metricValue: null },
        ]

    const chipsPepper: HeroChip[] = [
      {
        icon: Leaf,
        label: pepperHeroTotals.loading
          ? "Pepper totals loading..."
          : pepperHeroTotals.error
            ? "Pepper totals unavailable"
            : `Pepper entries: ${formatCount(pepperHeroTotals.totalRecords)}`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperHeroTotals.totalRecords,
      },
      {
        icon: TrendingUp,
        label: pepperHeroTotals.loading
          ? "Conversion loading..."
          : pepperHeroTotals.error
            ? "Conversion unavailable"
            : `Dry conversion: ${formatNumber(pepperDryPercent, 1)}%`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperDryPercent,
      },
    ]

    const chipsAccounts: HeroChip[] = [
      { icon: Users, label: "Labor + expense logs stay audit-ready", metricValue: null },
      { icon: Receipt, label: `Tracking ${currentFiscalYear.label}`, metricValue: null },
    ]

    const chipsBalanceSheet: HeroChip[] = [
      {
        icon: TrendingUp,
        label:
          salesHeroTotals.loading || accountsTotalsLoading
            ? "Booked net loading..."
            : `Booked net: ${formatCurrency(balanceNetBooked, 0)}`,
        metricValue: salesHeroTotals.loading || accountsTotalsLoading ? null : balanceNetBooked,
      },
      {
        icon: Receipt,
        label: receivablesHeroTotals.loading
          ? "Live receivables loading..."
          : `Live receivables: ${formatCurrency(receivablesHeroTotals.totalOutstanding, 0)}`,
        metricValue: receivablesHeroTotals.loading ? null : receivablesHeroTotals.totalOutstanding,
      },
    ]

    const chipsReceivables: HeroChip[] = [
      {
        icon: Receipt,
        label: receivablesHeroTotals.loading
          ? "Receivables totals loading..."
          : receivablesHeroTotals.error
            ? "Receivables totals unavailable"
            : `Open invoices: ${formatCount(receivablesHeroTotals.totalCount)}`,
        metricValue: receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalCount,
      },
      {
        icon: AlertTriangle,
        label: receivablesHeroTotals.loading
          ? "Overdue balance loading..."
          : receivablesHeroTotals.error
            ? "Overdue balance unavailable"
            : `Overdue: ${formatCurrency(receivablesHeroTotals.totalOverdue, 0)}`,
        metricValue: receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalOverdue,
      },
    ]

    const journalStats: HeroStat[] = [
      activeLocationsStat,
      unassignedStat,
      recentActivityStat,
    ]

    const chipsJournal: HeroChip[] = [
      { icon: NotebookPen, label: "Daily notes stay searchable", metricValue: null },
      { icon: Leaf, label: "Fertilizer + spray history", metricValue: null },
    ]

    const activityStats: HeroStat[] = [
      exceptionsStat,
      recentActivityStat,
      activeLocationsStat,
    ]

    const chipsActivity: HeroChip[] = [
      { icon: History, label: "Tracks create, update, and delete events across modules", metricValue: null },
      { icon: CheckCircle2, label: "Use this before month-end reconciliation", metricValue: null },
    ]

    switch (activeTab) {
      case "home":
        return {
          badge: "Home Screen",
          title: "Estate command center",
          description: "See key highlights first, then open the module you want to work in.",
          chips: chipsInventory,
          stats: inventoryStats,
        }
      case "transactions":
        return {
          badge: "Traceability Log",
          title: "Audit-ready movements at a glance",
          description: "Review movements, pricing, and accountability in one place.",
          chips: chipsTransactions,
          stats: transactionStats,
        }
      case "processing":
        if (resolvedProcessingWorkspaceView === "pepper") {
          return {
            badge: "Pepper Flow",
            title: "Pepper harvest and conversion",
            description: "Keep pepper close to coffee work without crowding the main Operations rail.",
            chips: chipsPepper,
            stats: pepperStats,
          }
        }
        if (resolvedProcessingWorkspaceView === "rubber") {
          return {
            badge: "Rubber Tapping",
            title: "Daily latex, cup lump, and sheet production",
            description: "Track tapping output and RSS sheet grades in one place.",
            chips: [
              { icon: Droplets, label: "Latex → Cup Lump → RSS sheet workflow", metricValue: null },
              { icon: Leaf, label: "Grades RSS1–RSS5 and cup lump supported", metricValue: null },
            ],
            stats: rubberStats,
          }
        }
        return {
          badge: "Coffee Pulping",
          title: "Daily coffee pulping, yield, and conversion",
          description: canShowPepper || canShowRubber
            ? "Keep all post-harvest crop records in one workspace."
            : "Keep dispatch and sales aligned with real coffee output.",
          chips: chipsProcessing,
          stats: processingTotalsStats,
        }
      case "dispatch":
        return {
          badge: "Dispatch Highlights",
          title: "Outbound bags and reconciliations",
          description: "Track what leaves the estate and what remains.",
          chips: chipsDispatch,
          stats: dispatchStats,
        }
      case "sales":
        return {
          badge: "Sales Highlights",
          title: "Revenue, buyers, and pricing",
          description: "Stay on top of pricing and inventory available to sell.",
          chips: chipsSales,
          stats: salesStats,
        }
      case "other-sales":
        return {
          badge: "Other Sales",
          title: "Side-crop revenue and contracts",
          description: "Track Pepper, Arecanut, Avocado, Coconut, and contract-based estate sales.",
          chips: [
            { icon: Leaf, label: "Use per-kg mode for daily location sales", metricValue: null },
            { icon: Receipt, label: "Use contract mode for lease or season contracts", metricValue: null },
          ],
          stats: [activeLocationsStat, recentActivityStat, unassignedStat],
        }
      case "curing":
        return {
          badge: "Curing & Drying",
          title: "Moisture drop and outturn in focus",
          description: "Track drying progress and protect quality.",
          chips: chipsCuring,
          stats: curingStats,
        }
      case "quality":
        return {
          badge: "Quality Checks",
          title: "Grading and defect signals",
          description: "Keep quality scores tied to each record.",
          chips: chipsQuality,
          stats: qualityStats,
        }
      case "yield-forecast":
        return {
          badge: "Yield Forecast",
          title: "Season forecast from trend + rainfall",
          description: "Blend recent processing momentum with rainfall signals to project season-end dry output.",
          chips: [
            {
              icon: TrendingUp,
              label: processingTotals.loading
                ? "Pulping trend loading..."
                : `Pulping to date: ${formatNumber(processingTotals.arabicaKg + processingTotals.robustaKg, 0)} kg`,
              metricValue: processingTotals.loading ? null : processingTotals.arabicaKg + processingTotals.robustaKg,
            },
            {
              icon: CloudRain,
              label: rainfallHeroTotals.loading
                ? "Rainfall signal loading..."
                : rainfallHeroTotals.error
                  ? "Rainfall signal unavailable"
                  : `Rainfall logs this FY: ${formatCount(rainfallHeroTotals.totalRecords)}`,
              metricValue:
                rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
            },
          ],
          stats: [
            {
              label: "Arabica processed",
              value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.arabicaKg, 0)} kg`,
              metricValue: processingTotals.loading ? null : processingTotals.arabicaKg,
            },
            {
              label: "Robusta processed",
              value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.robustaKg, 0)} kg`,
              metricValue: processingTotals.loading ? null : processingTotals.robustaKg,
            },
            {
              label: "Rainfall context",
              value:
                rainfallHeroTotals.loading || rainfallHeroTotals.error
                  ? "Unavailable"
                  : `${formatNumber(rainfallHeroTotals.totalInches, 2)} in`,
              metricValue:
                rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalInches,
            },
          ],
        }
      case "rainfall":
        return {
          badge: showRainfallMetrics ? "Rainfall Signals" : "Weather Signals",
          title: showRainfallMetrics ? "Weather context for yield swings" : "Forecast context for field planning",
          description: showRainfallMetrics
            ? "Link rainfall to processing and drying outcomes."
            : "Use short-term forecast context to plan drying and field operations.",
          chips: chipsRainfall,
          stats: rainfallStats,
        }
      case "pepper":
        return {
          badge: "Pepper Notes",
          title: "Pepper harvest and conversion",
          description: "Track green-to-dry conversion by location.",
          chips: chipsPepper,
          stats: pepperStats,
        }
      case "rubber":
        return {
          badge: "Rubber Tapping",
          title: "Latex, cup lump, and sheet production",
          description: "Track daily tapping output and RSS sheet grades by location.",
          chips: [
            { icon: Droplets, label: "Latex → Cup Lump → RSS sheet workflow", metricValue: null },
            { icon: Leaf, label: "Grades RSS1–RSS5 and cup lump supported", metricValue: null },
          ],
          stats: rubberStats,
        }
      case "journal":
        return {
          badge: "Estate Journal",
          title: "Daily notes, searchable anytime",
          description: "Log fertilizers, sprays, irrigation, and observations.",
          chips: chipsJournal,
          stats: journalStats,
        }
      case "plant-health":
        return {
          badge: "Plant Health",
          title: "Leaf scans and disease triage",
          description: "Upload field photos and review likely health issues with suggested actions.",
          chips: [
            { icon: Leaf, label: "Leaf scans with AI-assisted diagnosis", metricValue: null },
            { icon: AlertTriangle, label: "Use for early disease triage by location", metricValue: null },
          ],
          stats: [activeLocationsStat, recentActivityStat, unassignedStat],
        }
      case "activity-log":
        return {
          badge: "Activity Log",
          title: "Who changed what, and when",
          description: "Cross-module timeline of create, update, and delete events.",
          chips: chipsActivity,
          stats: activityStats,
        }
      case "accounts":
        return {
          badge: "Accounts Overview",
          title: "Labor and expense logging",
          description: "Keep cost tracking tight and audit-ready.",
          chips: chipsAccounts,
          stats: accountsStats,
        }
      case "balance-sheet":
        return {
          badge: "Live Balance Sheet",
          title: "Estate cash position in one view",
          description: "See booked inflow/outflow and receivable-backed live position.",
          chips: chipsBalanceSheet,
          stats: balanceSheetStats,
        }
      case "receivables":
        return {
          badge: "Receivables Tracker",
          title: "Invoices, dues, and collections",
          description: "Stay on top of buyer payments and balances.",
          chips: chipsReceivables,
          stats: receivablesStats,
        }
      case "ai-analysis":
        return {
          badge: "AI Highlights",
          title: "Patterns and insights",
          description: "Run summaries to spot drift, waste, and opportunities.",
          chips: chipsTransactions,
          stats: transactionStats,
        }
      case "news":
        return {
          badge: "Market Watch",
          title: "Coffee market signals",
          description: "Stay aware of pricing and demand shifts.",
          chips: chipsSales,
          stats: salesStats,
        }
      case "weather":
        return {
          badge: "Weather Context",
          title: "Rainfall, drying, and readiness",
          description: "Daily signals that impact operations.",
          chips: chipsRainfall,
          stats: weatherStats,
        }
      case "billing":
        return {
          badge: "Billing Snapshot",
          title: "Invoices and GST-ready billing",
          description: "Track billing readiness and documentation.",
          chips: chipsAccounts,
          stats: accountsStats,
        }
      default:
        return {
          badge: "Estate Pulse",
          title: "Estate operations at a glance",
          description: "Track inventory, pulping, and sales from one view.",
          chips: chipsInventory,
          stats: inventoryStats,
        }
    }
  }, [
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
    estateMetrics.locationCount,
    estateMetrics.recentActivity,
    exceptionsSummary.count,
    filteredInventoryTotals.totalQuantity,
    filteredInventoryTotals.unitLabel,
    formatCount,
    isModuleEnabled,
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
            <SelectTrigger className="w-full sm:w-40 h-10 border-border/70 bg-white/80">
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
            <SelectTrigger className="w-full sm:w-48 h-10 border-border/70 bg-white/80">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
              <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
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
            <div className="rounded-lg border border-border/60 bg-white/80 py-10 text-center text-muted-foreground">
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
            const rowTone = index % 2 === 0 ? "bg-white/90" : "bg-muted/10"
            return (
              <div
                key={transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}
                className={`rounded-xl border border-border/60 p-3 shadow-sm ${rowTone}`}
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
        <div className="border border-border/60 rounded-lg overflow-x-auto bg-white/80">
          <table className="min-w-full">
            <thead>
              <tr className="bg-muted/60 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/80 border-b sticky top-0 backdrop-blur">
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
                    className={`border-b last:border-0 hover:bg-muted/30 ${index % 2 === 0 ? "bg-white/90" : "bg-muted/10"}`}
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
              subtabs: ["Labor Deployments", "Other Expenses", "Attendance", "Account Activities"],
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
        }
      }
    }

    loadIntelligenceBrief()
    return () => {
      ignore = true
    }
  }, [canShowIntelligence, currentFiscalYear.endDate, currentFiscalYear.startDate, effectiveRole, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!canShowAiAnalysis || !shouldLoadHomeMetrics) return
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
        if (!ignore) setProactiveInsightsLoading(false)
      }
    }
    loadProactiveInsights()
    return () => { ignore = true }
  }, [canShowAiAnalysis, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!canShowAiAnalysis || !shouldLoadHomeMetrics) return
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
        if (!ignore) setSeasonCompareLoading(false)
      }
    }
    loadSeasonCompare()
    return () => { ignore = true }
  }, [canShowAiAnalysis, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!shouldLoadHomeMetrics) return
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
        if (!ignore) setRecentActivityLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [shouldLoadHomeMetrics])

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
    return tabs
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
        inventory: { label: "Stock & Inventory", icon: List },
        processing: { label: processingWorkspaceLabel, icon: processingWorkspaceIcon },
        dispatch: { label: "Dispatch", icon: Truck },
        sales: { label: "Sales", icon: TrendingUp },
        pepper: { label: "Pepper", icon: Leaf },
        rubber: { label: "Rubber", icon: Leaf },
        accounts: { label: "Accounts", icon: Users },
        "balance-sheet": { label: "Live Balance", icon: Scale },
        "season-pl": { label: "P&L Report", icon: TrendingUp },
        receivables: { label: "Receivables", icon: Receipt },
        billing: { label: "Billing", icon: Receipt },
        season: { label: "Season Summary", icon: BarChart3 },
        "yield-forecast": { label: "Harvest Forecast", icon: TrendingUp },
        "activity-log": { label: "Audit Log", icon: History },
        rainfall: { label: "Rain & Weather", icon: CloudRain },
        documents: { label: "Documents", icon: FileText },
        journal: { label: "Journal", icon: NotebookPen },
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
    const preferred = [
      "processing",
      "dispatch",
      "sales",
      "inventory",
      "accounts",
      "season",
      "rainfall",
      "documents",
      "resources",
      "plant-health",
    ]
    return preferred
      .filter((tab) => visibleTabs.includes(tab))
      .slice(0, 6)
      .map((tab) => ({
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
  const executionOutcomeTone: Record<ExecutionOutcomeStatus, string> = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    attention: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-rose-200 bg-rose-50 text-rose-700",
  }
  const executionOutcomeLabel: Record<ExecutionOutcomeStatus, string> = {
    good: "Strong",
    attention: "Needs Attention",
    blocked: "Blocked",
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
      datasets.add("labor")
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
    const hasTaggedLocation = (tx: Transaction) => {
      const locationId = String(tx.location_id || "").trim()
      return Boolean(locationId && locationId !== LOCATION_UNASSIGNED)
    }
    const hasNotes = (tx: Transaction) => String(tx.notes || "").trim().length > 0
    const hasRequiredFields = (tx: Transaction) =>
      String(tx.item_type || "").trim().length > 0 &&
      Number(tx.quantity) > 0 &&
      String(tx.transaction_type || "").trim().length > 0 &&
      hasTaggedLocation(tx)

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
        id: "labor-visibility",
        title: "Labor Visibility",
        goal: "Keep labor spend visible for day-to-day decisions.",
        metric: !canShowAccounts
          ? "Accounts module is disabled."
          : accountsTotalsLoading
            ? "Loading labor totals..."
            : `${formatCurrency(accountsTotals.laborTotal, 0)} labor tracked${laborSharePct !== null ? ` (${laborSharePct}% of spend)` : ""}`,
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
      } else if (latestActivity.module === "labor" && canShowAccounts) {
        addStep({
          id: "after-labor",
          tone: "progress",
          title: "Review labor visibility",
          description: "Keep labor entries tied back to activities and totals so cost visibility stays usable day to day.",
          reason: latestReason,
          actionLabel: "Open Accounts",
          actionTab: "accounts",
          askPrompt: "I logged labor already. What should I review next so labor costs stay accurate?",
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
  ])

  const getPreferredDefaultTab = useCallback(
    (tabs: string[]) => DEFAULT_DASHBOARD_TAB_PRIORITY.find((tab) => tabs.includes(tab)) || tabs[0],
    [],
  )

  useEffect(() => {
    hasTrackedInsightViewRef.current = false
  }, [effectiveRole, tenantId])

  useEffect(() => {
    if (!tenantId || !canShowProcessing) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadProcessingTotals = async () => {
      setProcessingTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/processing-records?summary=dashboard")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load processing totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { arabicaKg: number; arabicaBags: number; robustaKg: number; robustaBags: number }, record: any) => {
            const type = String(record?.coffee_type || "").toLowerCase()
            const kg =
              (Number(record?.dry_parch_total) || 0) +
              (Number(record?.dry_cherry_total) || 0)
            const bags =
              (Number(record?.dry_p_bags_total) || 0) +
              (Number(record?.dry_cherry_bags_total) || 0)
            if (type.includes("arab")) {
              acc.arabicaKg += kg
              acc.arabicaBags += bags
            } else if (type.includes("rob")) {
              acc.robustaKg += kg
              acc.robustaBags += bags
            }
            return acc
          },
          { arabicaKg: 0, arabicaBags: 0, robustaKg: 0, robustaBags: 0 },
        )
        if (!ignore) {
          setProcessingTotals({
            ...totals,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setProcessingTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load processing totals",
          }))
        }
      }
    }

    loadProcessingTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowProcessing, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowDispatch) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadDispatchHeroTotals = async () => {
      setDispatchHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/dispatch?summaryOnly=true")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load dispatch totals")
        }
        const totalsByType = Array.isArray(json?.totalsByType) ? json.totalsByType : []
        const totals = totalsByType.reduce(
          (acc: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number }, row: any) => {
            const type = String(row?.coffee_type || "").toLowerCase()
            const bags = Number(row?.bags_dispatched) || 0
            const kgs = Number(row?.kgs_received) || 0
            if (type.includes("arab")) {
              acc.arabicaBags += bags
              acc.arabicaKgs += kgs
            } else if (type.includes("rob")) {
              acc.robustaBags += bags
              acc.robustaKgs += kgs
            }
            return acc
          },
          { arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0 },
        )
        if (!ignore) {
          setDispatchHeroTotals({
            ...totals,
            totalDispatches: Number(json?.totalCount) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setDispatchHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load dispatch totals",
          }))
        }
      }
    }

    loadDispatchHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowDispatch, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowSales) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadSalesHeroTotals = async () => {
      setSalesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/sales?summaryOnly=true")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load sales totals")
        }
        const totalsByType = Array.isArray(json?.totalsByType) ? json.totalsByType : []
        const totals = totalsByType.reduce(
          (acc: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number }, row: any) => {
            const type = String(row?.coffee_type || "").toLowerCase()
            const bags = Number(row?.bags_sold) || 0
            const kgs = Number(row?.kgs_sold) || 0
            if (type.includes("arab")) {
              acc.arabicaBags += bags
              acc.arabicaKgs += kgs
            } else if (type.includes("rob")) {
              acc.robustaBags += bags
              acc.robustaKgs += kgs
            }
            return acc
          },
          { arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0 },
        )
        if (!ignore) {
          setSalesHeroTotals({
            ...totals,
            totalSales: Number(json?.totalCount) || 0,
            totalRevenue: Number(json?.totalRevenue) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setSalesHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load sales totals",
          }))
        }
      }
    }

    loadSalesHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowSales, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowOtherSales) {
      setOtherSalesHeroTotals({
        totalRevenue: 0,
        totalCount: 0,
        loading: false,
        error: null,
      })
      return
    }
    if (!shouldLoadHomeMetrics) return

    let ignore = false

    const loadOtherSalesHeroTotals = async () => {
      setOtherSalesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/other-sales?all=true", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load other sales totals")
        }
        if (!ignore) {
          setOtherSalesHeroTotals({
            totalRevenue: Number(json?.totals?.totalRevenue) || 0,
            totalCount: Number(json?.totalCount) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setOtherSalesHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load other sales totals",
          }))
        }
      }
    }

    loadOtherSalesHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowOtherSales, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowReceivables) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadReceivablesHeroTotals = async () => {
      setReceivablesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams()
        if (isPreviewMode && previewTenantId) {
          params.set("tenantId", previewTenantId)
        }
        const endpoint = params.toString() ? `/api/receivables?${params.toString()}` : "/api/receivables"
        const res = await fetch(endpoint, { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load receivables totals")
        }
        const payload = json?.summary || {}
        if (!ignore) {
          setReceivablesHeroTotals({
            totalInvoiced: Number(payload.totalInvoiced) || 0,
            totalOutstanding: Number(payload.totalOutstanding) || 0,
            totalOverdue: Number(payload.totalOverdue) || 0,
            totalPaid: Number(payload.totalPaid) || 0,
            totalCount: Number(payload.totalCount) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setReceivablesHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load receivables totals",
          }))
        }
      }
    }

    loadReceivablesHeroTotals()
    return () => {
      ignore = true
    }
  }, [canShowReceivables, isPreviewMode, previewTenantId, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!tenantId || !canShowCuring) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadCuringHeroTotals = async () => {
      setCuringHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
          all: "true",
        })
        const res = await fetch(`/api/curing-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load curing totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (
            acc: {
              outputKg: number
              dryingDaysTotal: number
              dryingDaysCount: number
              moistureDropTotal: number
              moistureDropCount: number
            },
            record: any,
          ) => {
            const outputKg = Number(record?.output_kg)
            if (Number.isFinite(outputKg)) {
              acc.outputKg += outputKg
            }
            const dryingDays = Number(record?.drying_days)
            if (Number.isFinite(dryingDays)) {
              acc.dryingDaysTotal += dryingDays
              acc.dryingDaysCount += 1
            }
            const moistureStart = Number(record?.moisture_start_pct)
            const moistureEnd = Number(record?.moisture_end_pct)
            if (Number.isFinite(moistureStart) && Number.isFinite(moistureEnd)) {
              acc.moistureDropTotal += moistureStart - moistureEnd
              acc.moistureDropCount += 1
            }
            return acc
          },
          {
            outputKg: 0,
            dryingDaysTotal: 0,
            dryingDaysCount: 0,
            moistureDropTotal: 0,
            moistureDropCount: 0,
          },
        )
        if (!ignore) {
          setCuringHeroTotals({
            totalRecords: records.length,
            totalOutputKg: totals.outputKg,
            avgDryingDays: totals.dryingDaysCount ? totals.dryingDaysTotal / totals.dryingDaysCount : 0,
            avgMoistureDrop: totals.moistureDropCount ? totals.moistureDropTotal / totals.moistureDropCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setCuringHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load curing totals",
          }))
        }
      }
    }

    loadCuringHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowCuring, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowQuality) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadQualityHeroTotals = async () => {
      setQualityHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
          all: "true",
        })
        const res = await fetch(`/api/quality-grading-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load quality totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (
            acc: {
              cupScoreTotal: number
              cupScoreCount: number
              outturnTotal: number
              outturnCount: number
              defectsTotal: number
              defectsCount: number
            },
            record: any,
          ) => {
            const cupScore = Number(record?.cup_score)
            if (Number.isFinite(cupScore)) {
              acc.cupScoreTotal += cupScore
              acc.cupScoreCount += 1
            }
            const outturnPct = Number(record?.outturn_pct)
            if (Number.isFinite(outturnPct)) {
              acc.outturnTotal += outturnPct
              acc.outturnCount += 1
            }
            const defectsCount = Number(record?.defects_count)
            if (Number.isFinite(defectsCount)) {
              acc.defectsTotal += defectsCount
              acc.defectsCount += 1
            }
            return acc
          },
          {
            cupScoreTotal: 0,
            cupScoreCount: 0,
            outturnTotal: 0,
            outturnCount: 0,
            defectsTotal: 0,
            defectsCount: 0,
          },
        )
        if (!ignore) {
          setQualityHeroTotals({
            totalRecords: records.length,
            avgCupScore: totals.cupScoreCount ? totals.cupScoreTotal / totals.cupScoreCount : 0,
            avgOutturnPct: totals.outturnCount ? totals.outturnTotal / totals.outturnCount : 0,
            avgDefects: totals.defectsCount ? totals.defectsTotal / totals.defectsCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setQualityHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load quality totals",
          }))
        }
      }
    }

    loadQualityHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowQuality, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowPepper) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadPepperHeroTotals = async () => {
      setPepperHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
        })
        const res = await fetch(`/api/pepper-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load pepper totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { picked: number; dry: number; dryPctTotal: number; dryPctCount: number }, record: any) => {
            const pickedKg = Number(record?.kg_picked)
            if (Number.isFinite(pickedKg)) {
              acc.picked += pickedKg
            }
            const dryKg = Number(record?.dry_pepper)
            if (Number.isFinite(dryKg)) {
              acc.dry += dryKg
            }
            const dryPct = Number(record?.dry_pepper_percent)
            if (Number.isFinite(dryPct)) {
              acc.dryPctTotal += dryPct
              acc.dryPctCount += 1
            }
            return acc
          },
          { picked: 0, dry: 0, dryPctTotal: 0, dryPctCount: 0 },
        )
        if (!ignore) {
          setPepperHeroTotals({
            totalRecords: records.length,
            totalPickedKg: totals.picked,
            totalDryKg: totals.dry,
            avgDryPercent: totals.dryPctCount ? totals.dryPctTotal / totals.dryPctCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setPepperHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load pepper totals",
          }))
        }
      }
    }

    loadPepperHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowPepper, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowRubber) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadRubberHeroTotals = async () => {
      setRubberHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
        })
        const res = await fetch(`/api/rubber-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load rubber totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { latex: number; sheets: number; drcTotal: number; drcCount: number }, record: any) => {
            const latexKg = Number(record?.latex_kg)
            if (Number.isFinite(latexKg)) acc.latex += latexKg
            const sheetsKg = Number(record?.sheets_kg)
            if (Number.isFinite(sheetsKg)) acc.sheets += sheetsKg
            const drcPct = Number(record?.drc_pct)
            if (Number.isFinite(drcPct) && drcPct > 0) {
              acc.drcTotal += drcPct
              acc.drcCount += 1
            }
            return acc
          },
          { latex: 0, sheets: 0, drcTotal: 0, drcCount: 0 },
        )
        if (!ignore) {
          setRubberHeroTotals({
            totalRecords: records.length,
            totalLatexKg: totals.latex,
            totalSheetsKg: totals.sheets,
            avgDrcPct: totals.drcCount ? totals.drcTotal / totals.drcCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setRubberHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load rubber totals",
          }))
        }
      }
    }

    loadRubberHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowRubber, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowRainfall) return
    if (!shouldLoadHomeMetrics) return
    let ignore = false

    const loadRainfallHeroTotals = async () => {
      setRainfallHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/rainfall")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load rainfall totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const startDate = new Date(`${currentFiscalYear.startDate}T00:00:00`)
        const endDate = new Date(`${currentFiscalYear.endDate}T23:59:59`)
        let totalInches = 0
        let totalRecords = 0
        let latestDate: string | null = null
        for (const record of records) {
          const recordDate = new Date(record?.record_date)
          if (Number.isNaN(recordDate.getTime())) continue
          if (recordDate < startDate || recordDate > endDate) continue
          const inches = Number(record?.inches) || 0
          const cents = Number(record?.cents) || 0
          totalInches += inches + cents / 100
          totalRecords += 1
          if (!latestDate || recordDate > new Date(latestDate)) {
            latestDate = String(record?.record_date || "")
          }
        }
        if (!ignore) {
          setRainfallHeroTotals({
            totalRecords,
            totalInches,
            latestDate,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setRainfallHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load rainfall totals",
          }))
        }
      }
    }

    loadRainfallHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowRainfall, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!canShowSeason || !shouldLoadExceptionSummary) return
    let isActive = true
    const loadExceptions = async () => {
      setExceptionsLoading(true)
      setExceptionsError(null)
      try {
        const response = await fetch("/api/exception-alerts")
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load exceptions")
        }
        const alerts = Array.isArray(data.alerts) ? data.alerts : []
        const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 }
        const sortedAlerts = [...alerts].sort((a: any, b: any) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0))
        const topAlerts = sortedAlerts.slice(0, 3)
        const highlights = topAlerts.map((alert: any) => {
            const context = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
            return context ? `${context}: ${alert.title}` : alert.title
          })
        if (!isActive) return
        setExceptionsSummary({
          count: alerts.length,
          highlights,
          alerts: topAlerts.map((alert: any) => ({
            id: String(alert.id || `${alert.metric || "alert"}-${alert.title || "item"}`),
            title: String(alert.title || "Alert"),
            severity: (String(alert.severity || "medium") as ExceptionSummaryAlert["severity"]) || "medium",
            location: alert.location ? String(alert.location) : undefined,
            coffeeType: alert.coffeeType ? String(alert.coffeeType) : undefined,
            metric: alert.metric ? String(alert.metric) : undefined,
          })),
        })
      } catch (error: any) {
        if (!isActive) return
        setExceptionsSummary({ count: 0, highlights: [], alerts: [] })
        setExceptionsError(error.message || "Failed to load exceptions")
      } finally {
        if (isActive) {
          setExceptionsLoading(false)
        }
      }
    }

    loadExceptions()
    return () => {
      isActive = false
    }
  }, [canShowSeason, shouldLoadExceptionSummary])

  const inferBriefTabFromText = useCallback(
    (input: string) => {
      const text = String(input || "").toLowerCase()
      if (!text) return "home"
      if ((text.includes("dispatch") || text.includes("received")) && canShowDispatch) return "dispatch"
      if ((text.includes("sale") || text.includes("buyer") || text.includes("revenue")) && canShowSalesWorkspace) return "sales"
      if ((text.includes("receivable") || text.includes("outstanding") || text.includes("invoice")) && canShowReceivables) {
        return "receivables"
      }
      if ((text.includes("labor") || text.includes("expense") || text.includes("cost")) && canShowAccounts) return "accounts"
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

  type DrilldownOptions = {
    tab: string
    locationId?: string | null
    itemType?: string | null
    panel?: string | null
    transactionSearch?: string | null
    seasonAlertId?: string | null
    seasonMetric?: string | null
  }

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
    [allItemTypesForDropdown, canShowInventory, canShowProcessing, canShowSales, getPreferredDefaultTab, locations, markTabAsLoaded, router, searchParams, visibleTabs],
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
    setActiveTab(DASHBOARD_LAUNCHER_TAB)
    markTabAsLoaded(DASHBOARD_LAUNCHER_TAB)

    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", DASHBOARD_LAUNCHER_TAB)
    params.delete("locationId")
    params.delete(DRILLDOWN_ITEM_PARAM)
    params.delete(DRILLDOWN_TXN_SEARCH_PARAM)
    params.delete(DRILLDOWN_ALERT_ID_PARAM)
    params.delete(DRILLDOWN_ALERT_METRIC_PARAM)

    const nextPath = `/dashboard?${params.toString()}`
    router.replace(nextPath, { scroll: false })
  }, [markTabAsLoaded, router, searchParams])

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
  const mobilePrimarySectionTabs = useMemo(() => {
    if (activeSectionTabs.length <= 4) return activeSectionTabs
    const primaryTabs = activeSectionTabs.slice(0, 3)
    const activeSectionTab = activeSectionTabs.find((tab) => tab.value === activeTab)
    if (activeSectionTab && !primaryTabs.some((tab) => tab.value === activeSectionTab.value)) {
      return [...primaryTabs, activeSectionTab]
    }
    return [...primaryTabs, activeSectionTabs[3]]
  }, [activeSectionTabs, activeTab])
  const hiddenMobileSectionTabCount = Math.max(activeSectionTabs.length - mobilePrimarySectionTabs.length, 0)

  const mobileAppSectionGroups = useMemo(
    () =>
      [
        { id: "dashboard" as TabGroupKey, label: "Home", icon: Home, visible: true },
        { id: "operations" as TabGroupKey, label: "Operations", icon: Factory, visible: showOperationsTabs },
        { id: "finance" as TabGroupKey, label: "Finance", icon: Scale, visible: showFinanceTabs },
        { id: "insights" as TabGroupKey, label: "Reports", icon: BarChart3, visible: showInsightsTabs },
      ].filter((group) => group.visible),
    [showFinanceTabs, showInsightsTabs, showOperationsTabs],
  )

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
    if (!tabParam) {
      if (activeTab !== DASHBOARD_LAUNCHER_TAB) {
        setActiveTab(DASHBOARD_LAUNCHER_TAB)
      }
      return
    }
    if (tabParam === DASHBOARD_LAUNCHER_TAB) {
      if (activeTab !== DASHBOARD_LAUNCHER_TAB) {
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
  }, [activeTab, canShowInventory, canShowProcessing, canShowSales, tabParam, visibleTabs])

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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading tenant context...</p>
        </div>
      </div>
    )
  }

  if (!tenantId) {
    return null
  }

  if (loading && !inventory.length && !syncError) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading inventory data...</p>
        </div>
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
  }
  const onboardingStepConfigs = buildOnboardingSteps(onboardingStatus, onboardingAccess)
  const onboardingSteps: OnboardingStep[] = onboardingStepConfigs.map((step) => ({
    key: step.key,
    title: step.title,
    description: step.description,
    done: step.done,
    actionLabel: step.actionLabel,
    onAction: () => handleTabChange(step.actionTab),
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
    <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_46%,#fafaf8_100%)] p-6 shadow-[0_24px_80px_-45px_rgba(14,93,82,0.35)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Record inventory movement</h3>
          <p className="text-xs text-neutral-500">
            Restock, deplete, or correct stock without leaving the inventory workspace.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsMovementDrawerOpen(false)}>
          Close
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
          Audit trail
        </Badge>
        <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
          Backdated entries
        </Badge>
        <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
          Estate linked
        </Badge>
      </div>
      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
        Record restocks when stock arrives. Record depletions when stock is used, lost, or corrected.
      </div>
      <div className="mt-6 space-y-5">
        {lastTransactionWriteFailure && (
          <div
            data-testid="transaction-write-failure-banner"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm"
          >
            <p className="font-medium text-rose-900">Last transaction did not save</p>
            <p className="mt-1 text-xs text-rose-800">
              {lastTransactionWriteFailure.message}
              {lastTransactionWriteFailure.occurredAt > 0
                ? ` (at ${new Date(lastTransactionWriteFailure.occurredAt).toLocaleTimeString()})`
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="bg-white" onClick={handleRetryTransactionWrite}>
                Retry last transaction
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setLastTransactionWriteFailure(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Item / crop</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Item type help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Select the crop or inventory item being adjusted.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select
            disabled={!hasMovementItemTypes}
            value={newTransaction?.item_type || ""}
            onValueChange={(value) => {
              handleFieldChange("item_type", value)
              handleFieldChange("unit", resolveInventoryUnitForItemType(value))
            }}
          >
            <SelectTrigger
              data-testid="movement-item-type-select"
              className="w-full h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              <SelectValue placeholder={hasMovementItemTypes ? "Select item type" : "No items yet"} />
            </SelectTrigger>
            <SelectContent className="z-[70] max-h-[40vh] overflow-y-auto">
              {hasMovementItemTypes ? (
                allItemTypesForDropdown.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__no_items" disabled>
                  Add an inventory item first
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {!hasMovementItemTypes && (
            <p className="text-xs text-neutral-500">
              No inventory item types yet. Add an inventory item or restock first.
            </p>
          )}
          {newTransaction?.item_type && (
            <p className="text-xs text-neutral-500">
              Current inventory unit: <span className="font-medium text-neutral-700">{selectedMovementUnit}</span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Estate block</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Location help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Tag by estate block for traceability and yield accuracy.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select value={transactionLocationId} onValueChange={setTransactionLocationId}>
            <SelectTrigger className="w-full h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
              <SelectValue placeholder={locations.length ? "Select location" : "No locations yet"} />
            </SelectTrigger>
            <SelectContent className="z-[70] max-h-[40vh] overflow-y-auto">
              <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name || loc.code || "Unnamed location"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-500">
            Tag transactions to a location for accurate inventory usage.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-neutral-700">Movement Date</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Movement date help"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Choose when the movement actually happened, including backfilled entries.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              type="date"
              value={transactionDateToInputValue(newTransaction?.transaction_date)}
              max={getTodayDateInputValue()}
              onChange={(event) => handleFieldChange("transaction_date", buildTransactionDateFromInput(event.target.value))}
              className="h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
            />
            <p className="text-xs text-neutral-500">Defaults to today, but you can record movements from earlier dates.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-neutral-700">Quantity</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Quantity help"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Enter the exact kg or unit amount for this movement.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="relative">
              <Input
                data-testid="movement-quantity-input"
                type="number"
                min={0}
                step="0.01"
                placeholder="Enter quantity"
                value={newTransaction?.quantity ?? ""}
                onKeyDown={preventNegativeKey}
                onWheel={preventNumberScrollChange}
                onChange={(e) => {
                  const nextValue = coerceNonNegativeNumber(e.target.value)
                  if (nextValue === null) return
                  handleFieldChange("quantity", nextValue)
                }}
                className="h-11 rounded-xl border-black/5 bg-white pr-12 focus-visible:ring-2 focus-visible:ring-emerald-200"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500 text-sm">
                {selectedMovementUnit}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Transaction Type</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Transaction type help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Restocking adds stock when goods arrive. Depleting records stock used, issued, lost, or corrected.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <RadioGroup
            value={newTransaction?.transaction_type === "restock" ? "Restocking" : "Depleting"}
            onValueChange={(value: "Depleting" | "Restocking") =>
              handleFieldChange("transaction_type", value === "Restocking" ? "restock" : "deplete")
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <label
              htmlFor="restocking"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                newTransaction?.transaction_type === "restock"
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-black/5 bg-white hover:border-emerald-200 hover:bg-neutral-50",
              )}
            >
              <RadioGroupItem value="Restocking" id="restocking" className="mt-1 h-4 w-4" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-900">Restocking</p>
                <p className="text-xs leading-relaxed text-neutral-500">Goods received, replenishment, or transfers in.</p>
              </div>
            </label>
            <label
              htmlFor="depleting"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                newTransaction?.transaction_type !== "restock"
                  ? "border-amber-200 bg-amber-50/80"
                  : "border-black/5 bg-white hover:border-amber-200 hover:bg-neutral-50",
              )}
            >
              <RadioGroupItem value="Depleting" id="depleting" className="mt-1 h-4 w-4" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-900">Depleting</p>
                <p className="text-xs leading-relaxed text-neutral-500">Used, issued, lost, or corrected stock.</p>
              </div>
            </label>
          </RadioGroup>
          {newTransaction?.transaction_type !== "restock" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {canShowAccounts ? (
                <>
                  Use this when you only need stock tracking. If the same usage should also appear in Accounts and P&amp;L, record it in{" "}
                  <strong>Accounts → Other Expenses</strong> instead.
                </>
              ) : (
                "Use this for regular stock usage, losses, or corrections."
              )}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Notes (Optional)</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Notes help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Use notes for processing stage, buyer references, or extra context.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Textarea
            placeholder="Add any additional details"
            value={newTransaction?.notes ?? ""}
            onChange={(e) => handleFieldChange("notes", e.target.value)}
            className="min-h-[110px] rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
          />
        </div>

        <Button
          type="button"
          data-testid="movement-record-transaction"
          onClick={handleRecordTransaction}
          className="w-full h-11 text-base bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
        >
          <Check className="mr-2 h-5 w-5" /> Record movement
        </Button>
      </div>
    </div>
  )

  const inventoryDrilldownPanel = (
    <div className="rounded-[28px] border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_48%,#fafaf8_100%)] p-6 shadow-[0_24px_80px_-45px_rgba(14,93,82,0.3)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Item timeline</h3>
          <p className="text-xs text-neutral-500">On-hand stock, value snapshot, and recent movements for the selected item.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIsInventoryDrilldownOpen(false)}>
          Close
        </Button>
      </div>
      <div className="mt-5 space-y-4">
        {!selectedInventoryDrilldownItem ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-neutral-50/70 px-4 py-5 text-sm text-neutral-600">
            Select an inventory item to open its recent transaction timeline.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{selectedInventoryDrilldownItem.name}</p>
                  <p className="text-xs text-neutral-500">
                    {formatNumber(Number(selectedInventoryDrilldownItem.quantity) || 0)}{" "}
                    {selectedInventoryDrilldownItem.unit || "unit"} on hand
                  </p>
                </div>
                <Badge variant="outline" className="text-xs uppercase tracking-[0.1em]">
                  {selectedLocationLabel}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-neutral-700">
                  Avg cost {formatCurrency(selectedInventoryDrilldownValue?.avgPrice || 0)}
                </span>
                <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-amber-700">
                  Value {formatCurrency(selectedInventoryDrilldownValue?.totalValue || 0)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  {drilldownShowAll ? `All Transactions (${itemDrilldownTransactions.length})` : "Recent Transactions"}
                </p>
                {isLoadingItemDrilldown ? (
                  <span className="text-xs text-neutral-400">Loading…</span>
                ) : drilldownShowAll ? (
                  <Button variant="link" size="sm" className="h-auto p-0 text-emerald-700" onClick={() => setDrilldownShowAll(false)}>
                    Show less
                  </Button>
                ) : itemDrilldownTransactions.length > 6 ? (
                  <Button variant="link" size="sm" className="h-auto p-0 text-emerald-700" onClick={handleOpenItemDrilldownHistory}>
                    View all {itemDrilldownTransactions.length}
                  </Button>
                ) : null}
              </div>
              {isLoadingItemDrilldown ? (
                <div className="rounded-xl border border-dashed border-black/10 bg-white px-3 py-4 text-xs text-neutral-400">
                  Loading transaction history…
                </div>
              ) : recentDrilldownTransactions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-black/10 bg-white px-3 py-4 text-xs text-neutral-500">
                  No transactions recorded for this item yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentDrilldownTransactions.map((transaction) => {
                    const txType = String(transaction.transaction_type || "").toLowerCase()
                    const isDepleting = txType.includes("deplet")
                    const isExpenseUsage = transaction.source_type === "expense"
                    const movementTone = isExpenseUsage
                      ? "border-amber-200 bg-amber-50/70"
                      : isDepleting
                        ? "border-rose-200 bg-rose-50/70"
                        : "border-emerald-200 bg-emerald-50/70"
                    return (
                      <div
                        key={`drilldown-${transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}`}
                        className={cn("rounded-2xl border px-3 py-3 shadow-sm", movementTone)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs text-neutral-500">{formatDate(transaction.transaction_date)}</p>
                            <p className="mt-1 text-sm font-semibold text-neutral-900">
                              {isExpenseUsage
                                ? transaction.source_label || "Expense usage"
                                : isDepleting
                                  ? "Stock out"
                                  : "Restock"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              isExpenseUsage
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : isDepleting
                                  ? "border-red-200 bg-red-50 text-red-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }
                          >
                            {isExpenseUsage ? transaction.source_label || "Expense Usage" : isDepleting ? "Stock Out" : "Restock"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-neutral-900 tabular-nums">
                              {isDepleting ? "-" : "+"}
                              {formatNumber(Number(transaction.quantity) || 0)}{" "}
                              {transaction.unit || selectedInventoryDrilldownItem.unit || "unit"}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}
                            </p>
                          </div>
                          <p className="text-xs text-neutral-500">
                            {isExpenseUsage
                              ? "Recorded from Accounts expense"
                              : isDepleting
                                ? "Leaves the stock balance"
                                : "Adds to the stock balance"}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )

  const showMobileSectionRail = isMobile && activeTabGroup !== "dashboard" && activeSectionTabs.length > 0
  const mobileBottomSpacingClass = isMobile
    ? isStandaloneMobileApp
      ? "pb-[calc(11rem+env(safe-area-inset-bottom))]"
      : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
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
      <div
        className={cn(
          "flex-1 min-w-0",
          !isMobile && "pl-[76px]",
          isMobile ? mobileBottomSpacingClass : "pb-8",
        )}
      >
      <div className="relative max-w-7xl mx-auto px-3 pt-4 sm:px-6 sm:pt-5">
        <div className="pointer-events-none absolute -top-20 left-[-6%] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,82,46,0.25),transparent_70%)] blur-[110px]" />
        <div className="pointer-events-none absolute -top-16 right-[5%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle_at_center,rgba(69,111,96,0.25),transparent_70%)] blur-[110px]" />

        <header className={cn(
          "relative mb-4 overflow-hidden backdrop-blur",
          isMobile
            ? "rounded-2xl border border-black/5 bg-white/80 p-4 shadow-sm dark:border-white/[0.07] dark:bg-card/80"
            : "flex items-center justify-between rounded-xl border border-black/5 bg-white/75 px-4 py-2.5 shadow-sm dark:border-white/[0.07] dark:bg-card/70",
        )}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/40 via-amber-300/30 to-emerald-600/40" />
          {isMobile ? (
            /* Mobile header: logo + estate name + user controls */
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Image
                  src="/brand-logo.svg"
                  alt="FarmFlow"
                  width={220}
                  height={86}
                  className="h-9 w-auto rounded-xl border border-emerald-100/80 bg-white/90 px-2 py-1 shadow-sm"
                />
                {!isPreviewMode && tenantSettings.estateName && (
                  <p className="flex items-center gap-1.5 text-base font-semibold text-emerald-700">
                    <Leaf className="h-4 w-4" />
                    {tenantSettings.estateName}
                  </p>
                )}
                {(isPreviewMode || !tenantSettings.estateName) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-xs text-emerald-700">
                    <Leaf className="h-3 w-3" />
                    {tenantLabel}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5">
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    {roleBadgeLabel}
                  </Badge>
                  <span className="text-sm text-slate-700">{user.username}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="h-9 w-9 px-0"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={buildWorkspaceHref("/manuals")}>
                      <BookOpen className="h-4 w-4 mr-1.5" />
                      Manuals
                    </Link>
                  </Button>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={buildWorkspaceHref("/settings")}>
                        <Settings className="h-4 w-4 mr-1.5" />
                        Settings
                      </Link>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-1.5" /> Logout
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop slim topbar: estate name + breadcrumb + actions */
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                {!isPreviewMode && tenantSettings.estateName ? (
                  <div className="flex items-center gap-2">
                    <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-sm text-foreground truncate">{tenantSettings.estateName}</span>
                  </div>
                ) : (
                  <span className="font-semibold text-sm text-foreground">FarmFlow</span>
                )}
                {activeTab !== DASHBOARD_LAUNCHER_TAB && activeTab !== "home" && tabMeta[activeTab] && (
                  <>
                    <span className="text-muted-foreground/30 text-sm select-none">/</span>
                    <span className="text-sm text-muted-foreground truncate">{tabMeta[activeTab]?.label}</span>
                  </>
                )}
                {isPreviewMode && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs ml-1">
                    Preview
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchOpen(true)}
                  className="text-muted-foreground hover:text-foreground h-8 px-3 hidden sm:flex"
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Search
                  <kbd className="ml-2 hidden lg:inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                    ⌘K
                  </kbd>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="text-muted-foreground hover:text-foreground h-8 w-8 px-0"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground h-8 px-3">
                  <Link href={buildWorkspaceHref("/manuals")}>
                    <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                    Help
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-8 px-3"
                  onClick={() => window.dispatchEvent(new CustomEvent("farmflow:open-feedback"))}
                >
                  <LifeBuoy className="h-3.5 w-3.5 mr-1.5" />
                  Support
                </Button>
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 px-3">
                        <Settings className="h-3.5 w-3.5 mr-1.5" />
                        Console
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Platform Console</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/settings">
                          <Settings className="h-4 w-4 mr-2" />
                          Platform Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/init-pepper-tables">
                          <Leaf className="h-4 w-4 mr-2" />
                          Initialize Pepper Tables
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/init-processing-table">
                          <Factory className="h-4 w-4 mr-2" />
                          Initialize Processing Tables
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/tenants">
                          <Users className="h-4 w-4 mr-2" />
                          Manage Tenants
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/inspect-databases">
                          <Settings className="h-4 w-4 mr-2" />
                          Inspect Databases
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </>
          )}
        </header>

        {isPreviewMode && (
          <Card className="mb-6 border-amber-200 bg-amber-50/70">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Tenant Preview Mode</CardTitle>
                <CardDescription>
                  Showing tab access for {tenantLabel} as {roleLabel(effectiveRole)}. This is for UI/module preview without re-login.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                Preview
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
              <span>Use this to validate what new tenants will see in navigation and module visibility.</span>
              <Button size="sm" variant="outline" className="bg-white" onClick={exitPreviewMode}>
                Exit preview
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/admin/tenants">Back to Owner Console</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {showWelcome && (
          <Card className="mb-6 border-emerald-100 bg-emerald-50/70">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Welcome to your estate workspace</CardTitle>
                <CardDescription>
                  Start by adding locations and logging your first pulping output. Everything else builds on those
                  records.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-white text-emerald-700 border-emerald-200">
                First login
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Use the checklist below to get to a live, traceable setup in under 10 minutes.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => handleTabChange("inventory")}>Start setup</Button>
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href={buildWorkspaceHref("/manuals")}>Open training manuals</Link>
                </Button>
                {isAdmin && (
                  <Button asChild variant="outline" className="bg-transparent">
                    <Link href={buildWorkspaceHref("/settings")}>Manage users</Link>
                  </Button>
                )}
                {canShowResources && (
                  <Button variant="outline" className="bg-transparent" onClick={() => handleTabChange("resources")}>
                    Open resources
                  </Button>
                )}
                <Button variant="ghost" onClick={dismissWelcome}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "home" && !isOwner && !showOnboarding && (
          <WorkspaceHints onAction={handleWorkspaceHintAction} />
        )}

        {activeTab === "home" && (
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
              <div className="space-y-2 max-w-xl">
                <Badge className="bg-emerald-600 text-white border-emerald-600 shadow-sm">
                  {visibleHeroContent.badge}
                </Badge>
                <h2 className="font-display text-2xl text-[color:var(--foreground)]">
                  {visibleHeroContent.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                  {visibleHeroContent.description}
                </p>
                {visibleHeroContent.chips.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {visibleHeroContent.chips
                      .slice(0, 3)
                      .map((chip) => chip.label)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:flex-1">
                {visibleHeroContent.stats.slice(0, 3).map((stat) => (
                  <div
                    key={stat.label}
                    className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm flex flex-col gap-2"
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-semibold leading-tight text-neutral-900 tabular-nums">
                      {stat.value}
                    </p>
                    {stat.subValue && (
                      <p className="text-xs text-muted-foreground">{stat.subValue}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "home" && smartNextSteps.length > 0 && (
          <Card data-testid="home-smart-next-steps" className="mb-5 border-black/5 bg-white/90">
            <CardHeader className="gap-4 pb-3">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <Badge variant="outline" className="w-fit border-emerald-200 bg-white text-emerald-700">
                    Smart Next Steps
                  </Badge>
                  <div>
                    <CardTitle>What to do next</CardTitle>
                    <CardDescription>
                      Based on setup progress, recent usage, and the current estate signals FarmFlow can see.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canLaunchAssistant && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="bg-white"
                      onClick={() => launchAssistantPrompt("What should I do next in my estate today?")}
                    >
                      <Brain className="mr-2 h-4 w-4 text-emerald-700" />
                      Ask FarmFlow
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={buildWorkspaceHref("/manuals")}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Open manuals
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 xl:grid-cols-3">
              {smartNextSteps.map((step, index) => {
                const toneClasses: Record<SmartNextStepTone, { badge: string; panel: string; icon: string; label: string }> = {
                  progress: {
                    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
                    panel: "border-emerald-100 bg-emerald-50/55",
                    icon: "bg-emerald-100 text-emerald-700",
                    label: "Momentum",
                  },
                  attention: {
                    badge: "border-amber-200 bg-amber-50 text-amber-700",
                    panel: "border-amber-100 bg-amber-50/60",
                    icon: "bg-amber-100 text-amber-700",
                    label: "Attention",
                  },
                  help: {
                    badge: "border-sky-200 bg-sky-50 text-sky-700",
                    panel: "border-sky-100 bg-sky-50/55",
                    icon: "bg-sky-100 text-sky-700",
                    label: "Helpful",
                  },
                }
                const tone = toneClasses[step.tone]
                const ActionIcon = step.tone === "attention" ? AlertTriangle : step.tone === "help" ? Brain : CheckCircle2
                return (
                  <div
                    key={step.id}
                    data-testid={`smart-next-step-${index + 1}`}
                    className={cn("rounded-2xl border p-4 shadow-sm", tone.panel)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", tone.icon)}>
                        <ActionIcon className="h-4 w-4" />
                      </div>
                      <Badge variant="outline" className={cn("w-fit", tone.badge)}>
                        {tone.label}
                      </Badge>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-neutral-900">{step.title}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-700">{step.description}</p>
                    <p className="mt-3 text-xs leading-5 text-neutral-500">{step.reason}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => openDrilldown({ tab: step.actionTab })}>
                        {step.actionLabel}
                      </Button>
                      {canLaunchAssistant && step.askPrompt ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-emerald-800 hover:bg-white/80 hover:text-emerald-900"
                          onClick={() => launchAssistantPrompt(step.askPrompt)}
                        >
                          Ask FarmFlow
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {activeTab === "home" && visibleCommandStripItems.length > 0 && (
          <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {visibleCommandStripItems.map((item) => {
              const isActive = activeTab === item.tab
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.tab)}
                  className={cn(
                    "rounded-2xl border bg-white p-4 text-left transition",
                    isActive
                      ? "border-emerald-300 shadow-sm ring-2 ring-emerald-100"
                      : "border-black/5 hover:border-emerald-200 hover:shadow-sm",
                  )}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 tabular-nums">{item.value}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.subValue}</p>
                </button>
              )
            })}
          </div>
        )}

        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-xs text-slate-600">
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
            {isAdmin && canShowSeason && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTabChange("season")}
                className="bg-white"
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Season View
              </Button>
            )}
            {canManageData && (
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
        </div>

        {writeQueueStatus.pendingCount > 0 && (
          <Card className="mb-4 border-amber-200 bg-amber-50/70">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Offline Sync Queue</CardTitle>
                  <CardDescription>
                    {writeQueueStatus.pendingCount} queued update{writeQueueStatus.pendingCount === 1 ? "" : "s"} pending.
                    {writeQueueStatus.blockedAuthCount > 0
                      ? ` ${writeQueueStatus.blockedAuthCount} need sign-in.`
                      : writeQueueStatus.blockedReviewCount > 0
                        ? ` ${writeQueueStatus.blockedReviewCount} need manual review.`
                        : " Waiting for retry."}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-white"
                    disabled={isRequestingQueueRetry}
                    onClick={handleRetryWriteQueue}
                  >
                    <RefreshCw className={cn("mr-2 h-4 w-4", isRequestingQueueRetry && "animate-spin")} />
                    {isRequestingQueueRetry ? "Retrying..." : "Retry Sync"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {writeQueueStatus.blockedAuthEntries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">Sign-in required</p>
                  {writeQueueStatus.blockedAuthEntries.slice(0, 3).map((entry) => (
                    <div key={`auth-${entry.id}`} className="rounded-lg border border-rose-200 bg-white p-3">
                      <p className="text-sm font-medium text-rose-800">
                        #{entry.id} {entry.method} {entry.pathname || entry.url}
                      </p>
                      <p className="mt-1 text-xs text-rose-700">
                        {entry.lastStatus ? `HTTP ${entry.lastStatus}` : "Authentication required"} · Attempts {entry.attempts}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="bg-white" onClick={() => handleOpenWriteQueueFix(entry)}>
                          Open Fix
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => void handleLogout()}>
                          Sign In Again
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {writeQueueStatus.blockedReviewEntries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">Review required</p>
                  {writeQueueStatus.blockedReviewEntries.slice(0, 5).map((entry) => (
                    <div key={`review-${entry.id}`} className="rounded-lg border border-amber-200 bg-white p-3">
                      <p className="text-sm font-medium text-amber-900">
                        #{entry.id} {entry.method} {entry.pathname || entry.url}
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        {entry.lastStatus ? `HTTP ${entry.lastStatus}` : "Server rejected the request"} · Attempts {entry.attempts}
                        {entry.queuedAt > 0 ? ` · Queued ${new Date(entry.queuedAt).toLocaleString()}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.lastError || "Re-open the matching module, correct the value, then retry sync."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="bg-white" onClick={() => handleOpenWriteQueueFix(entry)}>
                          Open Fix
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => handleRemoveQueuedEntry(entry.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canManageData && (
          <>
            {showDataToolsControls && (
              <Card className="mb-6 border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white/95">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Exports & Import</CardTitle>
                      <CardDescription>
                        One clear export hub: CSV and XLSX for operations, plus CSV, XLSX, and QIF for accounts.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit border-emerald-200 bg-white text-emerald-700">
                      Mobile-first export hub
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <Button onClick={() => void handleDataToolsExport("csv")} disabled={isExportingDataTools} className="justify-start">
                      <Download className="mr-2 h-4 w-4" />
                      {isExportingDataTools ? "Exporting Ops..." : "Ops CSV Export"}
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start bg-white"
                      onClick={() => void handleDataToolsExport("xlsx")}
                      disabled={isExportingDataTools}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Ops XLSX Export
                    </Button>
                    {canShowAccounts ? (
                      <>
                        <Button
                          variant="outline"
                          className="justify-start bg-white"
                          onClick={() => handleRequestAccountsExport("csv")}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Accounts CSV
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start bg-white"
                          onClick={() => handleRequestAccountsExport("xlsx")}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Accounts XLSX
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start bg-white"
                          onClick={() => handleRequestAccountsExport("qif")}
                        >
                          <Coins className="mr-2 h-4 w-4" />
                          Accounts QIF
                        </Button>
                      </>
                    ) : (
                      <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-2 text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">
                        Accounts module is disabled for this tenant.
                      </p>
                    )}
                  </div>
                  {lastOpsExportFailure && (
                    <div data-testid="ops-export-failure-banner" className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm">
                      <p className="font-medium text-amber-900">Ops export failed</p>
                      <p className="mt-1 text-xs text-amber-800">
                        {lastOpsExportFailureLabel || "Selected dataset"}: {lastOpsExportFailure.message}
                        {lastOpsExportFailure.occurredAt > 0
                          ? ` (at ${new Date(lastOpsExportFailure.occurredAt).toLocaleTimeString()})`
                          : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="bg-white" onClick={handleRetryLastOpsExport}>
                          Retry export
                        </Button>
                        <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => setLastOpsExportFailure(null)}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.16em] text-neutral-500">Dataset</Label>
                      <Select
                        value={dataToolsDataset}
                        onValueChange={(value) => {
                          if (isExportDatasetId(value)) {
                            setDataToolsDataset(value)
                          }
                        }}
                      >
                        <SelectTrigger className="h-10 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[45vh] overflow-y-auto">
                          {EXPORT_DATASETS.map((datasetOption) => (
                            <SelectItem key={datasetOption.id} value={datasetOption.id}>
                              {datasetOption.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{selectedDataToolsConfig.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        variant="outline"
                        onClick={handleDownloadDataTemplate}
                        disabled={!selectedDataToolsTemplateConfig}
                        className="bg-white"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Template
                      </Button>
                      <Button asChild variant="outline" className="bg-white">
                        <Link href={dataToolsImportHref}>
                          <Upload className="mr-2 h-4 w-4" />
                          Import CSV
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {selectedDataToolsTemplateConfig ? (
                    <p className="text-xs text-muted-foreground">
                      Template columns: {selectedDataToolsTemplateConfig.template.join(", ")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No direct template for this export dataset. Use the import page to choose a supported dataset.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {isOwner && (
          <Card className="border-2 border-muted bg-white/90">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Platform Console</CardTitle>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  Platform Owner
                </Badge>
              </div>
              <CardDescription>Company-wide controls for tenants, access, and data health.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col lg:flex-row gap-6 lg:items-start">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="text-sm">Use this console to keep tenant access clean and onboarding smooth.</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Create tenants and users for new estates.</li>
                  <li>Enable/disable modules per tenant.</li>
                  <li>Seed demo data for trials and onboarding.</li>
                  <li>Inspect database health and table sizes.</li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href="/admin/tenants">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Tenants
                  </Link>
                </Button>
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href="/admin/inspect-databases">
                    <Settings className="h-4 w-4 mr-2" />
                    Inspect Databases
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {!isOwner && !trialBannerDismissed && trialDaysRemaining !== null && (
          <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            trialDaysRemaining <= 5
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-sky-200 bg-sky-50 text-sky-900"
          }`}>
            <p>
              <span className="font-semibold">
                {trialDaysRemaining === 0
                  ? "Your free trial ends today."
                  : trialDaysRemaining === 1
                    ? "1 day left on your free trial."
                    : `${trialDaysRemaining} days left on your free trial.`}
              </span>
              {" "}Keep recording to build your season picture — your data is saved either way.
            </p>
            <button
              type="button"
              className="shrink-0 text-xs underline opacity-60 hover:opacity-100"
              onClick={() => setTrialBannerDismissed(true)}
            >
              Dismiss
            </button>
          </div>
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
        {showSetupComplete && (() => {
          const phase = getCurrentEstatePhase()
          const phaseActions: Record<string, { label: string; description: string; tab: string }> = {
            "harvest-peak": { label: "Log today's picking", description: "Record cherry weight by plot for each picking team.", tab: "accounts" },
            "pre-harvest": { label: "Record a harvest expense", description: "Log picker wages, nets, or equipment costs before harvest begins.", tab: "accounts" },
            "post-harvest-pruning": { label: "Track pruning labour", description: "Log wages and activity codes for post-harvest pruning work.", tab: "accounts" },
            "blossom": { label: "Record the blossom date", description: "Note the blossom shower date — it sets your harvest window.", tab: "inventory" },
            "berry-formation": { label: "Log an estate expense", description: "Record weed management, fertiliser, or maintenance costs for this period.", tab: "accounts" },
            "monsoon": { label: "Record rainfall", description: "Log daily rainfall — monsoon tracking feeds your season report.", tab: "rainfall" },
          }
          const action = phaseActions[phase.season] ?? phaseActions["berry-formation"]
          return (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-900">Estate setup complete</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {phase.label} — {action.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"
                  onClick={() => handleTabChange(action.tab)}
                >
                  {action.label}
                </Button>
              </div>
            </div>
          )
        })()}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
          {/* Desktop: slim section sub-tabs only (sidebar handles main navigation) */}
          {!isMobile && activeTab !== DASHBOARD_LAUNCHER_TAB && activeTabGroup !== "dashboard" && activeSectionTabs.length > 0 && (
            <div className="sticky top-2 z-20 mb-1">
              <TabsList className="h-auto flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-gradient-to-br from-white/95 via-white to-neutral-100/80 p-2 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.6)] backdrop-blur dark:border-white/[0.08] dark:from-card dark:via-card dark:to-card/90">
                {activeSectionTabs.map((tab) => {
                  const TabIcon = tab.icon
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="min-h-10 rounded-lg border border-black/10 bg-white/90 px-4 text-[13px] font-semibold data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-[0_10px_20px_-14px_rgba(5,150,105,0.9)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-foreground dark:data-[state=active]:border-emerald-500 dark:data-[state=active]:bg-emerald-600"
                    >
                      <TabIcon className="mr-2 h-4 w-4" />
                      {tab.label}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>
          )}

          {/* Mobile: section navigation with workspace navigator + section cards */}
          {!isStandaloneMobileApp && isMobile && (
            <div className="relative space-y-2.5 rounded-3xl border border-black/10 bg-gradient-to-br from-white/95 via-white to-neutral-100/80 p-3 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.75)] backdrop-blur">
            {activeTab !== DASHBOARD_LAUNCHER_TAB && (
              <div className="space-y-2">
                {/* Back button + quick-jump row */}
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goToWorkspaceNavigator}
                    className="bg-white min-h-11 shrink-0 gap-1.5 px-3"
                  >
                    <Home className="h-4 w-4" />
                    <span className="text-sm">All sections</span>
                  </Button>
                  {/* Horizontal scroll of most-used tabs — skip the current one */}
                  <div className="flex min-w-0 flex-1 overflow-x-auto no-scrollbar gap-2">
                    {mobileHomeQuickActions
                      .filter((a) => a.tab !== activeTab)
                      .map((action) => {
                        const ActionIcon = action.icon
                        return (
                          <button
                            key={action.tab}
                            type="button"
                            onClick={() => handleTabChange(action.tab)}
                            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 touch-manipulation min-h-11"
                          >
                            <ActionIcon className="h-4 w-4 text-emerald-600" />
                            <span className="whitespace-nowrap">{action.label}</span>
                          </button>
                        )
                      })}
                  </div>
                </div>
              </div>
            )}
            {activeTab === DASHBOARD_LAUNCHER_TAB && (
            <>
            {/* Quick-access grid on mobile home — all sections inline */}
            {launcherSections.map((section) => (
              <div key={section.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <section.icon className={cn("h-3.5 w-3.5", section.iconClassName)} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                    {section.label}
                  </p>
                </div>
                <div className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar gap-2 pb-0.5">
                  {section.tabs.map((tab) => {
                    const TabIcon = tab.icon
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => handleTabChange(tab.value)}
                        className={cn(
                          "flex min-w-[148px] shrink-0 snap-start items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-left shadow-sm transition-colors touch-manipulation",
                          section.tabClassName,
                        )}
                      >
                        <span className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          section.badgeClassName,
                        )}>
                          <TabIcon className={cn("h-4 w-4", section.iconClassName)} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight">{tab.label}</p>
                          {tab.subtabs?.length ? (
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {tab.subtabs.slice(0, 2).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            </>
            )}
            </div>
          )}

          <TabsContent
            value={DASHBOARD_LAUNCHER_TAB}
            className="space-y-4"
            forceMount={isTabLoaded(DASHBOARD_LAUNCHER_TAB) ? true : undefined}
          >
            <Card className="overflow-hidden border-black/10 bg-gradient-to-br from-white via-neutral-50 to-neutral-100/80 shadow-sm">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className={cn("leading-tight", isMobile ? "text-xl" : "text-2xl")}>
                  Where do you want to go?
                </CardTitle>
                <CardDescription>
                  Tap any section to jump straight there — no extra steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* ── Task shortcuts ── */}
                {canShowAccounts && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => { setAccountsInitialTab("expenses"); handleTabChange("accounts") }}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 text-left transition-colors hover:bg-emerald-100/60 touch-manipulation",
                        isMobile ? "py-4" : "py-3.5",
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={cn("font-semibold text-slate-900", isMobile ? "text-base" : "text-sm")}>Record Expense</p>
                        <p className="text-xs text-emerald-700">Log a cost or input used</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAccountsInitialTab("labor"); handleTabChange("accounts") }}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 text-left transition-colors hover:bg-emerald-100/60 touch-manipulation",
                        isMobile ? "py-4" : "py-3.5",
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={cn("font-semibold text-slate-900", isMobile ? "text-base" : "text-sm")}>Record Labor</p>
                        <p className="text-xs text-emerald-700">Workers and daily wages</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* ── All tabs — direct access, grouped ── */}
                {launcherSections.map((section) => (
                  <div key={section.id} className="space-y-2.5">
                    {/* Section divider label */}
                    <div className="flex items-center gap-2">
                      <section.icon className={cn("h-3.5 w-3.5", section.iconClassName)} />
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                        {section.label}
                      </p>
                      <div className="flex-1 border-t border-neutral-100" />
                    </div>

                    {/* Tab buttons — 2 per row, direct navigation */}
                    <div className="grid grid-cols-2 gap-2">
                      {section.tabs.map((tab) => {
                        const TabIcon = tab.icon
                        return (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => handleTabChange(tab.value)}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border text-left touch-manipulation transition-colors",
                              isMobile ? "min-h-[64px] px-3.5 py-3.5" : "min-h-[52px] px-3 py-2.5",
                              section.tabClassName,
                            )}
                          >
                            {/* Icon bubble */}
                            <span className={cn(
                              "flex shrink-0 items-center justify-center rounded-lg",
                              isMobile ? "h-9 w-9" : "h-7 w-7",
                              section.badgeClassName,
                            )}>
                              <TabIcon className={cn(isMobile ? "h-4 w-4" : "h-3.5 w-3.5", section.iconClassName)} />
                            </span>

                            {/* Label + subtabs */}
                            <div className="min-w-0">
                              <p className={cn(
                                "font-semibold leading-tight",
                                isMobile ? "text-[15px]" : "text-[13px]",
                              )}>
                                {tab.label}
                              </p>
                              {tab.subtabs?.length ? (
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {tab.subtabs.slice(0, 2).join(" · ")}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* ── Bottom links ── */}
                <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  <Button
                    variant="outline"
                    className={cn("bg-white text-slate-700", isMobile ? "w-full min-h-[48px] text-base" : "")}
                    onClick={() => handleTabChange("home")}
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Open Dashboard
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className={cn("bg-white text-slate-700", isMobile ? "w-full min-h-[48px] text-base" : "")}
                  >
                    <Link href={buildWorkspaceHref("/manuals")}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Training Manuals
                    </Link>
                  </Button>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="home" className="space-y-6" forceMount={isTabLoaded("home") ? true : undefined}>
            {/* Season Progress Strip */}
            <div className="rounded-2xl border border-black/5 bg-white/90 px-5 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <span className="text-xs font-semibold text-neutral-800">{currentFiscalYear.label}</span>
                  <span className="ml-2 text-xs text-neutral-400">Harvest Season</span>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-3 sm:max-w-xs">
                <div className="relative flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${seasonProgress.pct}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                  {seasonProgress.pct}% · {seasonProgress.daysRemaining}d left
                </span>
              </div>
            </div>

            {/* ── Morning Brief — first thing you see, always ── */}
            {canShowIntelligence && (
              <div className={cn(
                "rounded-2xl border overflow-hidden",
                intelligenceHighlights.length > 0
                  ? "border-emerald-200/70 bg-gradient-to-br from-emerald-700 to-emerald-800 text-white shadow-[0_8px_32px_-12px_rgba(5,100,70,0.45)]"
                  : "border-black/5 bg-white/90",
              )}>
                {/* Header row */}
                <div className={cn(
                  "flex items-center justify-between px-5 py-3.5",
                  intelligenceHighlights.length > 0 ? "border-b border-white/10" : "border-b border-black/5",
                )}>
                  <div className="flex items-center gap-2.5">
                    <Brain className={cn("h-4 w-4 shrink-0", intelligenceHighlights.length > 0 ? "text-emerald-300" : "text-emerald-600")} />
                    <p className={cn("text-sm font-semibold", intelligenceHighlights.length > 0 ? "text-white" : "text-neutral-800")}>
                      What to focus on today
                    </p>
                  </div>
                  {intelligenceLoading && (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className={cn("h-3.5 w-3.5 animate-spin", intelligenceHighlights.length > 0 ? "text-emerald-300" : "text-neutral-400")} />
                      <span className={cn("text-xs", intelligenceHighlights.length > 0 ? "text-emerald-300" : "text-neutral-400")}>
                        Analysing...
                      </span>
                    </div>
                  )}
                  {!intelligenceLoading && intelligenceHighlights.length > 0 && (
                    <span className="text-[11px] font-medium text-emerald-300">
                      {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="px-5 py-4">
                  {intelligenceLoading && intelligenceHighlights.length === 0 ? (
                    <div className="space-y-3">
                      <div className="h-4 w-3/4 animate-pulse rounded-lg bg-neutral-100" />
                      <div className="h-4 w-5/6 animate-pulse rounded-lg bg-neutral-100" />
                      <div className="h-4 w-2/3 animate-pulse rounded-lg bg-neutral-100" />
                    </div>
                  ) : intelligenceError ? (
                    <p className="text-sm text-rose-600">{intelligenceError}</p>
                  ) : intelligenceHighlights.length > 0 ? (
                    <div className="space-y-3">
                      {/* Highlights — no generic "Insight N" labels, just the text + action */}
                      {intelligenceHighlights.slice(0, 4).map((highlight, index) => {
                        const linkedAction = intelligenceActions.find(
                          (action) => visibleTabs.includes(action.tab) && highlight.toLowerCase().includes(action.label.toLowerCase()),
                        )
                        const actionTab = linkedAction?.tab || inferBriefTabFromText(highlight)
                        return (
                          <button
                            key={`brief-${index}`}
                            type="button"
                            data-testid={`home-brief-insight-${index + 1}`}
                            onClick={() => openDrilldown({ tab: actionTab })}
                            className="group flex w-full items-start gap-3 text-left"
                          >
                            <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug text-white/90 group-hover:text-white">
                                {highlight}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-emerald-300 group-hover:text-emerald-200">
                                Review →
                              </p>
                            </div>
                          </button>
                        )
                      })}

                      {/* Cost code pins */}
                      {(intelligenceTopCostCode || intelligenceTopFrequencyCode) && (
                        <div className="mt-1 grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
                          {intelligenceTopCostCode && (
                            <button
                              type="button"
                              onClick={() => openDrilldown({ tab: "accounts", transactionSearch: intelligenceTopCostCode.code })}
                              className="rounded-xl bg-white/10 px-3 py-2 text-left hover:bg-white/15 transition-colors"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Top cost</p>
                              <p className="mt-0.5 text-sm font-semibold text-white">
                                {intelligenceTopCostCode.code} — ₹{formatNumber(intelligenceTopCostCode.totalAmount, 0)}
                              </p>
                              <p className="text-[11px] text-white/60">{intelligenceTopCostCode.reference}</p>
                            </button>
                          )}
                          {intelligenceTopFrequencyCode && (
                            <button
                              type="button"
                              onClick={() => openDrilldown({ tab: "accounts", transactionSearch: intelligenceTopFrequencyCode.code })}
                              className="rounded-xl bg-white/10 px-3 py-2 text-left hover:bg-white/15 transition-colors"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Most frequent</p>
                              <p className="mt-0.5 text-sm font-semibold text-white">
                                {intelligenceTopFrequencyCode.code} — {formatCount(intelligenceTopFrequencyCode.entryCount)} entries
                              </p>
                              <p className="text-[11px] text-white/60">{intelligenceTopFrequencyCode.reference}</p>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      {intelligenceActions.filter((a) => visibleTabs.includes(a.tab)).length > 0 && (
                        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                          {intelligenceActions
                            .filter((a) => visibleTabs.includes(a.tab))
                            .map((action) => (
                              <Button
                                key={`${action.tab}-${action.label}`}
                                size="sm"
                                onClick={() => openDrilldown({ tab: action.tab })}
                                className="border-white/20 bg-white/15 text-white hover:bg-white/25 text-xs h-8"
                                variant="outline"
                              >
                                {action.label}
                              </Button>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No patterns detected yet. The brief activates once you have processing, accounts, and dispatch data for the current season.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div
              className={cn(
                "grid grid-cols-1 gap-4 sm:grid-cols-2",
                showFinancialHomeCards ? "xl:grid-cols-4 2xl:grid-cols-6" : "xl:grid-cols-4",
              )}
            >
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium text-neutral-600">Pulping Output</CardTitle>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-50">
                      <svg className="h-3.5 w-3.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                      </svg>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {processingTotals.loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ) : (
                    <>
                      <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                        {formatNumber(processingTotals.arabicaKg + processingTotals.robustaKg, 0)} kg
                      </p>
                      <p className="text-xs text-muted-foreground">{currentFiscalYear.label}</p>
                      {canShowProcessing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => openDrilldown({ tab: "processing", locationId: selectedLocationId })}
                        >
                          Open records
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium text-neutral-600">Dispatch Received</CardTitle>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-stone-50">
                      <svg className="h-3.5 w-3.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {dispatchHeroTotals.loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-7 w-28" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  ) : (
                    <>
                      <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                        {formatNumber(dispatchReceivedKgsTotal, 0)} kg
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(dispatchHeroTotals.arabicaBags + dispatchHeroTotals.robustaBags, 0)} bags in{" "}
                        {formatCount(dispatchHeroTotals.totalDispatches)} records
                      </p>
                      {canShowDispatch && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => openDrilldown({ tab: "dispatch", locationId: selectedLocationId })}
                        >
                          Open ledger
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              {canShowSales && (
                <>
                  <Card className="border-black/5 bg-white/90">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium text-neutral-600">Sales Sold</CardTitle>
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                          <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                          </svg>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold tabular-nums text-neutral-900">{formatNumber(salesSoldKgsTotal, 0)} kg</p>
                      <p className="text-xs text-muted-foreground">{formatCount(salesHeroTotals.totalSales)} sales entries</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7 px-2 text-xs"
                        onClick={() => openDrilldown({ tab: "sales", locationId: selectedLocationId })}
                      >
                        Open sales
                      </Button>
                    </CardContent>
                  </Card>
                  <Card className="border-black/5 bg-white/90">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium text-neutral-600">
                          {overdrawnCoffeeKgs > 0 ? "Overdrawn Coffee" : "Saleable Coffee"}
                        </CardTitle>
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", overdrawnCoffeeKgs > 0 ? "bg-rose-50" : "bg-stone-50")}>
                          <svg className={cn("h-3.5 w-3.5", overdrawnCoffeeKgs > 0 ? "text-rose-500" : "text-stone-400")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p
                        className={cn("text-2xl font-semibold tabular-nums", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-neutral-900")}
                      >
                        {formatNumber(overdrawnCoffeeKgs > 0 ? overdrawnCoffeeKgs : saleableCoffeeKgs, 0)} kg
                      </p>
                      <p className={cn("text-xs", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-muted-foreground")}>
                        {overdrawnCoffeeKgs > 0 ? "Overdrawn (sold exceeds received)" : "Dispatch received minus sold"}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7 px-2 text-xs"
                        onClick={() =>
                          openDrilldown({
                            tab: canShowSeason ? "season" : "sales",
                            seasonMetric: overdrawnCoffeeKgs > 0 ? "inventory_mismatch" : null,
                          })
                        }
                      >
                        Open reconciliation
                      </Button>
                    </CardContent>
                  </Card>
                </>
              )}
              {showFinancialHomeCards && (
                <Card className="border-black/5 bg-white/90">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Revenue Breakdown</CardTitle>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                        <svg className="h-3.5 w-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Coffee Revenue</p>
                        <p className="text-lg font-semibold tabular-nums text-emerald-700">
                          {revenueTotalsLoading ? "Loading..." : revenueTotalsError ? "Unavailable" : formatCurrency(coffeeRevenueTotal, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Other Revenue</p>
                        <p className="text-base font-semibold tabular-nums text-amber-700">
                          {revenueTotalsLoading ? "Loading..." : revenueTotalsError ? "Unavailable" : formatCurrency(otherRevenueTotal, 0)}
                        </p>
                      </div>
                      <div className="border-t border-black/5 pt-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total Revenue</p>
                        <p className="text-xl font-semibold tabular-nums text-neutral-900">
                          {revenueTotalsLoading ? "Loading..." : revenueTotalsError ? "Unavailable" : formatCurrency(totalRevenueAmount, 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Coffee sales: {formatCount(salesHeroTotals.totalSales)} · Other sales: {formatCount(otherSalesHeroTotals.totalCount)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 px-2 text-xs"
                      onClick={() =>
                        openDrilldown({
                          tab: canShowSales || canShowOtherSales ? "sales" : "accounts",
                          locationId: selectedLocationId,
                        })
                      }
                    >
                      Open revenue detail
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Cost-per-kg intelligence card */}
              {costPerKgData.hasData && (
                <Card className="border-black/5 bg-white/90">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Cost vs Revenue</CardTitle>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                        <Coins className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {costPerKgData.loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-7 w-24" />
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </div>
                    ) : costPerKgData.costPerKg !== null ? (
                      <div className="space-y-3">
                        {/* Cost vs Revenue per kg */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-slate-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Cost / kg</p>
                            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                              {formatCurrency(costPerKgData.costPerKg, 0)}
                            </p>
                          </div>
                          <div className={cn(
                            "rounded-lg px-3 py-2",
                            costPerKgData.revenuePerKg !== null ? "bg-emerald-50" : "bg-slate-50"
                          )}>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Avg sale / kg</p>
                            <p className={cn(
                              "mt-0.5 text-lg font-semibold tabular-nums",
                              costPerKgData.revenuePerKg !== null ? "text-emerald-800" : "text-slate-400"
                            )}>
                              {costPerKgData.revenuePerKg !== null
                                ? formatCurrency(costPerKgData.revenuePerKg, 0)
                                : "No sales"}
                            </p>
                          </div>
                        </div>

                        {/* Gross margin */}
                        {costPerKgData.grossMarginPerKg !== null && costPerKgData.grossMarginPct !== null && (
                          <div className={cn(
                            "flex items-center justify-between rounded-lg px-3 py-2",
                            costPerKgData.grossMarginPct >= 25 ? "bg-emerald-50" :
                            costPerKgData.grossMarginPct >= 10 ? "bg-amber-50" : "bg-rose-50"
                          )}>
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Gross margin</p>
                              <p className={cn(
                                "mt-0.5 text-base font-semibold tabular-nums",
                                costPerKgData.grossMarginPct >= 25 ? "text-emerald-800" :
                                costPerKgData.grossMarginPct >= 10 ? "text-amber-800" : "text-rose-700"
                              )}>
                                {formatCurrency(costPerKgData.grossMarginPerKg, 0)}/kg
                              </p>
                            </div>
                            <span className={cn(
                              "text-xl font-bold tabular-nums",
                              costPerKgData.grossMarginPct >= 25 ? "text-emerald-700" :
                              costPerKgData.grossMarginPct >= 10 ? "text-amber-700" : "text-rose-600"
                            )}>
                              {costPerKgData.grossMarginPct.toFixed(1)}%
                            </span>
                          </div>
                        )}

                        {/* Cost split bar */}
                        {costPerKgData.laborPct !== null && costPerKgData.expensePct !== null && (
                          <div className="space-y-1.5">
                            <div className="flex overflow-hidden rounded-full">
                              <div
                                className="h-1.5 bg-violet-400 transition-all"
                                style={{ width: `${costPerKgData.laborPct}%` }}
                              />
                              <div
                                className="h-1.5 bg-slate-300 transition-all"
                                style={{ width: `${costPerKgData.expensePct}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <span className="inline-block h-1.5 w-2.5 rounded-full bg-violet-400" />
                                Labor {costPerKgData.laborPct.toFixed(0)}%
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="inline-block h-1.5 w-2.5 rounded-full bg-slate-300" />
                                Expenses {costPerKgData.expensePct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Record costs and parchment output to see this metric.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Season projection card */}
              {seasonProjection.hasData && seasonProjection.projectedSeasonTotal !== null && (
                <Card className="border-black/5 bg-white/90">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Season Projection</CardTitle>
                      <div className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        seasonProjection.trendDirection === "rising" ? "bg-emerald-50" :
                        seasonProjection.trendDirection === "declining" ? "bg-amber-50" : "bg-stone-50"
                      )}>
                        <TrendingUp className={cn(
                          "h-3.5 w-3.5",
                          seasonProjection.trendDirection === "rising" ? "text-emerald-600" :
                          seasonProjection.trendDirection === "declining" ? "text-amber-500" : "text-stone-400"
                        )} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {seasonProjection.loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-7 w-28" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    ) : (
                      <>
                        <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                          {formatNumber(seasonProjection.projectedSeasonTotal, 0)} kg
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Projected total · {formatNumber(seasonProjection.recentAvgDailyKg, 0)} kg/day avg (21d)
                        </p>
                        {seasonProjection.projectedEndDate && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Est. end:{" "}
                            {new Date(seasonProjection.projectedEndDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                            {seasonProjection.trendDirection !== "flat" && (
                              <span className={cn(
                                "ml-1.5 font-medium",
                                seasonProjection.trendDirection === "rising" ? "text-emerald-600" : "text-amber-600"
                              )}>
                                {seasonProjection.trendDirection === "rising" ? "↑ rising" : "↓ declining"}
                              </span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Recent Activity Feed */}
            {(recentActivityLoading || (recentActivity && recentActivity.length > 0)) && (
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                  <CardDescription>Last entries logged across all modules.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {recentActivityLoading ? (
                    <div className="divide-y divide-stone-50">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3 px-6 py-3">
                          <div className="h-7 w-7 shrink-0 rounded-lg bg-stone-100 animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-2.5 w-32 rounded bg-stone-100 animate-pulse" />
                            <div className="h-2 w-48 rounded bg-stone-50 animate-pulse" />
                          </div>
                          <div className="h-2 w-12 rounded bg-stone-100 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-50">
                      {(recentActivity ?? []).map((entry, i) => {
                        const moduleConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
                          processing: {
                            bg: "bg-emerald-50",
                            text: "text-emerald-700",
                            icon: (
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                              </svg>
                            ),
                          },
                          dispatch: {
                            bg: "bg-sky-50",
                            text: "text-sky-700",
                            icon: (
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                              </svg>
                            ),
                          },
                          sales: {
                            bg: "bg-amber-50",
                            text: "text-amber-700",
                            icon: (
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                              </svg>
                            ),
                          },
                          labor: {
                            bg: "bg-violet-50",
                            text: "text-violet-700",
                            icon: (
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                              </svg>
                            ),
                          },
                          expenses: {
                            bg: "bg-rose-50",
                            text: "text-rose-700",
                            icon: (
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" />
                              </svg>
                            ),
                          },
                        }
                        const cfg = moduleConfig[entry.module] ?? { bg: "bg-stone-50", text: "text-stone-500", icon: null }
                        return (
                          <div key={i} className="flex items-center gap-3 px-6 py-3">
                            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", cfg.bg, cfg.text)}>
                              {cfg.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-neutral-800 truncate">{entry.label}</p>
                              <p className="text-xs text-neutral-400 truncate">{entry.detail}</p>
                            </div>
                            <span className="shrink-0 text-xs text-neutral-400 tabular-nums">{entry.date}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {mobileHomeQuickActions.length > 0 && (
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="pb-3">
                  <CardTitle className={isMobile ? "text-lg" : "text-base"}>Jump to a section</CardTitle>
                  <CardDescription>Your most-used areas — tap to go straight there.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {mobileHomeQuickActions.map((action) => {
                      const ActionIcon = action.icon
                      return (
                        <button
                          key={action.tab}
                          type="button"
                          onClick={() => handleTabChange(action.tab)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border border-black/8 bg-white px-3.5 text-left shadow-sm transition-colors hover:bg-slate-50 touch-manipulation",
                            isMobile ? "min-h-[60px] py-3.5" : "min-h-[52px] py-2.5",
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                            <ActionIcon className="h-4 w-4 text-emerald-700" />
                          </span>
                          <span className={cn("font-semibold text-slate-800", isMobile ? "text-[15px]" : "text-sm")}>
                            {action.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-black/5 bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle>Execution Scorecard</CardTitle>
                <CardDescription>
                  Daily guardrails to reduce missed tasks, improve harvest tracking, and keep reports decision-ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {executionOutcomeChecks.map((check) => (
                  <div key={check.id} className="rounded-xl border border-black/5 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-neutral-900">{check.title}</p>
                        <p className="text-xs text-muted-foreground">{check.goal}</p>
                      </div>
                      <Badge variant="outline" className={cn("w-fit", executionOutcomeTone[check.status])}>
                        {executionOutcomeLabel[check.status]}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-neutral-700">{check.metric}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full bg-white sm:w-auto"
                        onClick={() => handleExecutionOutcomeAction(check)}
                      >
                        {check.actionLabel}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className={cn("grid grid-cols-1 gap-4", canShowSales && "xl:grid-cols-2")}>
              <Card className="border-black/5 bg-white/90">
                <CardHeader>
                  <CardTitle>Estate Snapshot</CardTitle>
                  <CardDescription>Live operational context for this tenant.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Active Locations</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Active locations help"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Count of configured estate locations available for records.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{formatCount(estateMetrics.locationCount)}</p>
                      {canShowProcessing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => openDrilldown({ tab: "processing", locationId: selectedLocationId })}
                        >
                          Open location records
                        </Button>
                      )}
                    </div>
                    <div className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">24h Activity</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="24h activity help"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Inventory transactions recorded in the last 24 hours.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{formatCount(estateMetrics.recentActivity)}</p>
                      {showTransactionHistory && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => openDrilldown({ tab: "transactions" })}
                        >
                          Open transactions
                        </Button>
                      )}
                    </div>
                    <div className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Open Alerts</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Open alerts help"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Active season exceptions requiring review or action.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{formatCount(exceptionsSummary.count)}</p>
                      {canShowSeason && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7 px-2 text-xs"
                          onClick={() => openDrilldown({ tab: "season" })}
                        >
                          Open exceptions
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {canShowSales && (
                <Card className="border-black/5 bg-gradient-to-br from-emerald-50/60 to-white">
                  <CardHeader>
                    <CardTitle>Operational Confidence</CardTitle>
                    <CardDescription>Single source logic used in cards, Dispatch, and Sales guardrails.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", reconciliationStatusTone)}>
                      Reconciliation: {reconciliationStatusLabel}
                    </div>
                    <div className="rounded-xl border border-black/5 bg-white/90 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Formula</p>
                      <p className="mt-1 text-sm text-neutral-700">
                        Saleable KGs = Dispatch Received KGs - Sales Sold KGs
                      </p>
                      <p className="mt-2 text-sm text-neutral-700">
                        {formatNumber(dispatchReceivedKgsTotal, 0)} - {formatNumber(salesSoldKgsTotal, 0)} ={" "}
                        <span className={cn("font-semibold", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-emerald-700")}>
                          {overdrawnCoffeeKgs > 0 ? `-${formatNumber(overdrawnCoffeeKgs, 0)}` : formatNumber(saleableCoffeeKgs, 0)} kg
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sales validation checks coffee type + bag type stock first. Location is retained for traceability.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {canShowDispatch && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDrilldown({ tab: "dispatch", locationId: selectedLocationId })}
                          className="bg-white"
                        >
                          Reconcile Dispatch
                        </Button>
                      )}
                      {canShowSales && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDrilldown({ tab: "sales", locationId: selectedLocationId })}
                          className="bg-white"
                        >
                          Review Sales Guardrails
                        </Button>
                      )}
                      {canShowActivityLog && (
                        <Button size="sm" variant="outline" onClick={() => openDrilldown({ tab: "activity-log" })} className="bg-white">
                          Open Activity Log
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Today's Brief — moved lower, kept for spacing; actual render is at top of home */}

            {canShowAiAnalysis && !isScopedUser && (seasonCompareLoading || seasonCompareNarrative || seasonCompareError) && (
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Season Comparison</CardTitle>
                    <CardDescription>
                      {seasonCompareFYLabels
                        ? `${seasonCompareFYLabels.prev} vs ${seasonCompareFYLabels.curr} — year-on-year view`
                        : "Year-on-year season overview"}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit border-violet-200 bg-violet-50 text-violet-700">
                    AI
                  </Badge>
                </CardHeader>
                <CardContent>
                  {seasonCompareLoading ? (
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Comparing seasons...
                    </div>
                  ) : seasonCompareError ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                      <p className="font-medium">Season comparison temporarily unavailable.</p>
                      <p className="mt-1 text-muted-foreground">{seasonCompareError}</p>
                    </div>
                  ) : seasonCompareNarrative ? (
                    <p className="text-sm leading-relaxed text-neutral-700">{seasonCompareNarrative}</p>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {canShowAiAnalysis && !isScopedUser && (
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Smart Insights</CardTitle>
                    <CardDescription>What the data is telling you right now — without you having to ask.</CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit border-violet-200 bg-violet-50 text-violet-700">
                    AI
                  </Badge>
                </CardHeader>
                <CardContent>
                  {proactiveInsightsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading your data...
                    </div>
                  ) : proactiveInsightsError ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                      <p className="font-medium">Insights temporarily unavailable.</p>
                      <p className="mt-1 text-muted-foreground">{proactiveInsightsError}</p>
                    </div>
                  ) : proactiveInsights && proactiveInsights.length > 0 ? (
                    <div className="space-y-2">
                      {proactiveInsights.map((insight, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-3",
                            insight.severity === "warning"
                              ? "border-amber-200 bg-amber-50/60"
                              : insight.severity === "good"
                                ? "border-emerald-200 bg-emerald-50/60"
                                : "border-black/5 bg-white",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                              insight.severity === "warning"
                                ? "bg-amber-500"
                                : insight.severity === "good"
                                  ? "bg-emerald-500"
                                  : "bg-neutral-400",
                            )}
                          />
                          <p className="text-sm text-neutral-800">{insight.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No signals yet. Add more operations data to activate smart insights.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-black/5 bg-white/90">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Priority Alerts</CardTitle>
                  <CardDescription>High-signal issues to clear before day-end close.</CardDescription>
                </div>
                {canShowSeason && (
                  <Button size="sm" variant="outline" onClick={() => openDrilldown({ tab: "season" })} className="bg-white">
                    Open Season Alerts
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {exceptionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading alerts...
                  </div>
                ) : exceptionsError ? (
                  <p className="text-sm text-rose-600">{exceptionsError}</p>
                ) : exceptionsSummary.count === 0 ? (
                  <p className="text-sm text-emerald-700">No active alerts right now.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    {(exceptionsSummary.alerts || []).slice(0, 3).map((alert, index) => {
                      const summaryLine = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
                      const cardTone =
                        alert.severity === "high" || alert.severity === "critical"
                          ? "border-rose-100 bg-rose-50/70"
                          : "border-amber-100 bg-amber-50/70"
                      const textTone =
                        alert.severity === "high" || alert.severity === "critical" ? "text-rose-800" : "text-amber-900"
                      return (
                        <button
                          key={`${alert.id}-${index}`}
                          type="button"
                          data-testid={`home-priority-alert-${index + 1}`}
                          className={cn("rounded-xl border p-3 text-left transition-colors hover:bg-white", cardTone)}
                          onClick={() =>
                            openDrilldown({
                              tab: resolveExceptionDrilldownTab(alert.metric),
                              seasonAlertId: alert.id,
                              seasonMetric: alert.metric || null,
                            })
                          }
                        >
                          <p className={cn("text-xs uppercase tracking-[0.16em]", alert.severity === "high" || alert.severity === "critical" ? "text-rose-700" : "text-amber-700")}>
                            Alert {index + 1}
                          </p>
                          <p className={cn("mt-1 text-sm font-medium", textTone)}>{alert.title}</p>
                          {summaryLine ? <p className="mt-1 text-xs text-muted-foreground">{summaryLine}</p> : null}
                          <p className="mt-2 text-xs text-emerald-700">Investigate →</p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canShowInventoryWorkspace && (
            <TabsContent value="inventory" className="space-y-6" forceMount={isTabLoaded("inventory") ? true : undefined}>
              {resolvedInventoryWorkspaceView !== "transactions" && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-amber-900">Inventory handles stock usage directly</p>
                      <p className="text-xs text-amber-800">
                        Use <strong>Deplete</strong> here when you only need stock tracking for fertiliser, chemicals, fuel, or other consumables.{" "}
                        {canShowAccounts
                          ? "Use Accounts → Other Expenses only when the same usage should also land in Accounts and P&L."
                          : "This works even if you do not use Accounts."}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openMovementDrawer("deplete")}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 touch-manipulation"
                    >
                      Record stock usage
                    </button>
                    {canShowAccounts && (
                      <button
                        type="button"
                        onClick={() => { setAccountsInitialTab("expenses"); handleTabChange("accounts") }}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 touch-manipulation"
                      >
                        Open Accounts expense
                      </button>
                    )}
                  </div>
                </div>
              )}
              <Card className="border-border/70 bg-white/90">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Inventory overview</CardTitle>
                  <CardDescription>
                    {resolvedInventoryWorkspaceView === "transactions"
                      ? "Review and correct stock history without leaving Inventory."
                      : canShowAccounts
                        ? "Track restocks, stock usage, and corrections here. Use Accounts only when the same usage should also hit P&L."
                        : "Track restocks, stock usage, and corrections here."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current mode</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {resolvedInventoryWorkspaceView === "transactions" ? "Transaction History" : "Inventory"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected location</p>
                      <p className="text-sm font-semibold text-foreground">{selectedLocationLabel}</p>
                    </div>
                    <div className="border-t border-border/60 pt-2">
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(filteredInventoryTotals.itemCount)} items · {formatNumber(filteredInventoryTotals.totalQuantity)} {filteredInventoryTotals.unitLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Inventory value {formatCurrency(filteredInventoryTotals.totalValue)} · Transactions in view {formatCount(filteredTransactions.length)}
                      </p>
                    </div>
                  </div>
                  {showTransactionHistory ? (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next step</p>
                      <div className="mt-3 space-y-2">
                        {resolvedInventoryWorkspaceView === "transactions" ? (
                          canShowInventory ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full bg-white"
                              onClick={() => setInventoryWorkspaceView("inventory")}
                            >
                              Back to inventory
                            </Button>
                          ) : (
                            <p className="text-sm text-muted-foreground">History view only for this module set.</p>
                          )
                        ) : (
                          <Button
                            type="button"
                            className="w-full bg-emerald-700 hover:bg-emerald-800"
                            onClick={() => setInventoryWorkspaceView("transactions")}
                          >
                            Open transaction history
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              {resolvedInventoryWorkspaceView === "transactions" && showTransactionHistory ? (
                renderTransactionHistoryPanel()
              ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
                <div className="order-2 space-y-6 lg:order-1 lg:col-span-8">
                  <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <h2 className="text-base font-semibold text-neutral-900 flex items-center">
                            <List className="mr-2 h-5 w-5 text-emerald-600" /> Inventory Levels
                          </h2>
                          <p className="text-xs text-neutral-500">Totals for {selectedLocationLabel}. Restock when goods arrive. Deplete when stock is issued, consumed, lost, or corrected.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {showDataToolsControls && (
                            <Button size="sm" variant="outline" onClick={exportInventoryToCSV} className="h-10 bg-transparent">
                              <Download className="mr-2 h-4 w-4" /> Export
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={openNewItemDialog}
                            className="bg-emerald-700 hover:bg-emerald-800 h-10 text-white shadow-sm"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Add item
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500">
                        <span className="font-medium text-neutral-700 tabular-nums">
                          {formatNumber(filteredInventoryTotals.itemCount)}
                        </span>{" "}
                        items ·{" "}
                        <span className="font-medium text-neutral-700 tabular-nums">
                          {formatNumber(filteredInventoryTotals.totalQuantity)} {filteredInventoryTotals.unitLabel}
                        </span>{" "}
                        total ·{" "}
                        <span className="font-medium text-amber-700 tabular-nums">
                          {formatCurrency(filteredInventoryTotals.totalValue)}
                        </span>{" "}
                        value
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mb-5">
                      <div className="relative flex-grow">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                        <Input
                          placeholder="Search inventory..."
                          value={inventorySearchTerm}
                          onChange={(e) => setInventorySearchTerm(e.target.value)}
                          className="pl-10 h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
                        />
                      </div>
                      <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                        <SelectTrigger className="w-full sm:w-52 h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
                          <SelectValue placeholder="All locations" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[40vh] overflow-y-auto">
                          <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
                          <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name || loc.code || "Unnamed location"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleInventorySort}
                        className="flex items-center gap-1 h-11 whitespace-nowrap bg-white"
                      >
                        {inventorySortOrder === "asc" ? (
                          <>
                            <SortAsc className="h-4 w-4 mr-1" /> Sort A-Z
                          </>
                        ) : inventorySortOrder === "desc" ? (
                          <>
                            <SortDesc className="h-4 w-4 mr-1" /> Sort Z-A
                          </>
                        ) : (
                          <>
                            <SortAsc className="h-4 w-4 mr-1" /> Sort
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
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
                              "group rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition-colors hover:bg-emerald-50/40",
                              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
                              isSelectedForDrilldown && "border-emerald-200 bg-emerald-50/60",
                            )}
                            aria-label={`Open drill-down for ${item.name}`}
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 text-sm font-semibold">
                                  {itemInitial}
                                </div>
                                <div>
                                  <div className="text-base font-semibold text-neutral-900">{item.name}</div>
                                  <div className="text-xs text-neutral-500">
                                    {avgPrice > 0
                                      ? `Avg ${formatCurrency(avgPrice)}/${item.unit || "unit"}`
                                      : "Pricing not yet recorded"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                                <div className="text-left sm:text-right">
                                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Qty</p>
                                  <p className="text-sm font-semibold text-neutral-800 tabular-nums">
                                    {formatNumber(Number(item.quantity) || 0)} {item.unit}
                                  </p>
                                </div>
                                <div className="text-left sm:text-right">
                                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Value</p>
                                  <p className="text-sm font-semibold text-amber-700 tabular-nums">
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
                        <div className="text-center py-8 text-muted-foreground">No items match your search.</div>
                      ) : inventory.length === 0 ? (
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
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          {selectedLocationId !== LOCATION_ALL
                            ? "No inventory items in this location yet. Change the location filter or add stock here."
                            : "Inventory is empty or not yet loaded."}
                        </div>
                      ))}
                  </div>
                </div>

                <div className="order-1 flex flex-col gap-6 lg:order-2 lg:col-span-4 lg:self-start">
                  {canShowSeason && (
                    <Card className="order-2 rounded-xl border border-black/5 bg-white shadow-sm lg:order-1">
                      <CardHeader className="flex flex-col gap-2 pb-3">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                            <AlertTriangle className="h-4 w-4 text-emerald-600" />
                            System status
                          </CardTitle>
                          {!exceptionsLoading && !exceptionsError && (
                            <CardDescription className="text-xs text-neutral-500">
                              {exceptionsSummary.count === 0
                                ? "No active anomalies in the last 7 days."
                                : `${exceptionsSummary.count} active alert${exceptionsSummary.count === 1 ? "" : "s"}`}
                            </CardDescription>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 self-start"
                          onClick={() => openDrilldown({ tab: "season" })}
                        >
                          Open Season View
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        {exceptionsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading system status...
                          </div>
                        ) : exceptionsError ? (
                          <div className="text-xs text-rose-600">{exceptionsError}</div>
                        ) : exceptionsSummary.count === 0 ? (
                          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            All clear
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            {(exceptionsSummary.alerts || []).slice(0, 3).map((alert, index) => {
                              const summaryLine = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
                              const tone =
                                alert.severity === "high" || alert.severity === "critical"
                                  ? "border-rose-100 bg-rose-50/70 text-rose-900"
                                  : "border-amber-100 bg-amber-50/70 text-amber-900"
                              return (
                                <button
                                  key={`${alert.id}-${index}`}
                                  type="button"
                                  data-testid={`inventory-system-alert-${index + 1}`}
                                  className={cn("rounded-xl border px-3 py-2 text-left transition-colors hover:bg-white", tone)}
                                  onClick={() =>
                                    openDrilldown({
                                      tab: resolveExceptionDrilldownTab(alert.metric),
                                      seasonAlertId: alert.id,
                                      seasonMetric: alert.metric || null,
                                    })
                                  }
                                >
                                  <p className="text-[10px] uppercase tracking-[0.15em] text-amber-700">Alert {index + 1}</p>
                                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug">{alert.title}</p>
                                  {summaryLine ? <p className="mt-1 text-[11px] text-muted-foreground">{summaryLine}</p> : null}
                                </button>
                              )
                            })}
                            {exceptionsSummary.alerts.length === 0 &&
                              (exceptionsSummary.highlights || []).slice(0, 3).map((item, index) => (
                                <div key={`${item}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                                  <p className="text-[10px] uppercase tracking-[0.15em] text-amber-700">Alert {index + 1}</p>
                                  <p className="mt-1 text-xs font-medium leading-snug text-amber-900">{item}</p>
                                </div>
                              ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                    <Card data-testid="inventory-quick-actions" className="order-1 rounded-2xl border border-black/5 bg-white shadow-sm lg:order-2">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base font-semibold text-neutral-900">Quick actions</CardTitle>
                      <CardDescription className="text-xs text-neutral-500">
                        Choose the most common inventory task from here.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <button
                        data-testid="inventory-action-record-movement"
                        type="button"
                        onClick={() => openMovementDrawer()}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          Record stock movement
                        </span>
                        <span className="text-xs text-neutral-400">Primary</span>
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          data-testid="inventory-action-restocking"
                          type="button"
                          onClick={() => openMovementDrawer("restock")}
                          className="flex min-h-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                        >
                          Record restock
                        </button>
                        <button
                          data-testid="inventory-action-depleting"
                          type="button"
                          onClick={() => openMovementDrawer("deplete")}
                          className="flex min-h-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
                        >
                          Record usage
                        </button>
                      </div>
                      <button
                        data-testid="inventory-action-add-item"
                        type="button"
                        onClick={openNewItemDialog}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          Add inventory item
                        </span>
                        <span className="text-xs text-neutral-400">Inventory</span>
                      </button>
                      {showDataToolsControls && (
                        <button
                          type="button"
                          onClick={exportInventoryToCSV}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <Download className="h-4 w-4 text-emerald-600" />
                          Export inventory
                          </span>
                          <span className="text-xs text-neutral-400">CSV</span>
                        </button>
                      )}
                      {showTransactionHistory && (
                        <button
                          type="button"
                          onClick={() => setInventoryWorkspaceView("transactions")}
                          className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                        >
                          <span className="flex items-center gap-2">
                            <History className="h-4 w-4 text-emerald-600" />
                            View transactions
                          </span>
                          <span className="text-xs text-neutral-400">History</span>
                        </button>
                      )}
                      {inventoryDrilldownItemName && (
                        <button
                          type="button"
                          onClick={() => setIsInventoryDrilldownOpen(true)}
                          className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 transition-colors hover:bg-emerald-100/70"
                        >
                          <span className="flex items-center gap-2">
                            <List className="h-4 w-4 text-emerald-700" />
                            Open item timeline
                          </span>
                          <span className="max-w-[9rem] truncate text-xs text-emerald-700">{inventoryDrilldownItemName}</span>
                        </button>
                      )}
                      <div className="rounded-xl border border-black/5 bg-neutral-50/70 px-4 py-3 text-xs text-neutral-600 space-y-2">
                        <div className="flex items-center justify-between">
                          <span>Selected location</span>
                          <span className="text-neutral-900">{selectedLocationLabel}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Movement type</span>
                          <span className="text-neutral-900">Restock / Deplete</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Units</span>
                          <span className="text-neutral-900">{selectedMovementUnit}</span>
                        </div>
                        <div className="border-t border-black/5 pt-2 text-[11px] leading-relaxed text-neutral-500">
                          Open an item card to inspect recent movements and value without leaving Inventory.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
              {(() => {
                const activeCropTabs = [
                  canShowProcessing && "coffee",
                  canShowPepper && "pepper",
                  canShowRubber && "rubber",
                ].filter(Boolean) as ProcessingWorkspaceView[]

                if (activeCropTabs.length === 1) {
                  if (activeCropTabs[0] === "pepper") return <PepperTab />
                  if (activeCropTabs[0] === "rubber") return <RubberTab />
                  return <ProcessingTab showDataToolsControls={showDataToolsControls} />
                }

                const viewLabel: Record<ProcessingWorkspaceView, string> = {
                  coffee: "Coffee Pulping",
                  pepper: "Pepper Processing",
                  rubber: "Rubber Tapping",
                }
                const viewDescription: Record<ProcessingWorkspaceView, string> = {
                  coffee: "Cherry intake, pulping, parchment, dry cherry, and daily output.",
                  pepper: "Pepper picking, green-to-dry conversion, and location-wise pepper yield.",
                  rubber: "Daily latex collection, coagulation, sheet production, and RSS grading.",
                }

                return (
                  <Tabs
                    value={resolvedProcessingWorkspaceView}
                    onValueChange={(value) => setProcessingWorkspaceView(value as ProcessingWorkspaceView)}
                    className="space-y-6"
                  >
                    <Card className="border-border/70 bg-white/90">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Post-Harvest Workspace</CardTitle>
                        <CardDescription>
                          Switch between crops in one workspace to keep records clean.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current View</p>
                            <p className="text-2xl font-semibold text-foreground">
                              {viewLabel[resolvedProcessingWorkspaceView]}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Use This For</p>
                            <p className="text-sm font-semibold text-foreground">
                              {viewDescription[resolvedProcessingWorkspaceView]}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Crop Flow</p>
                          <TabsList
                            className={`mt-3 grid w-full rounded-xl border border-border/60 bg-white p-1 shadow-none grid-cols-${activeCropTabs.length}`}
                          >
                            {activeCropTabs.includes("coffee") && (
                              <TabsTrigger value="coffee" className="min-h-10 rounded-lg">
                                Coffee
                              </TabsTrigger>
                            )}
                            {activeCropTabs.includes("pepper") && (
                              <TabsTrigger value="pepper" className="min-h-10 rounded-lg">
                                Pepper
                              </TabsTrigger>
                            )}
                            {activeCropTabs.includes("rubber") && (
                              <TabsTrigger value="rubber" className="min-h-10 rounded-lg">
                                Rubber
                              </TabsTrigger>
                            )}
                          </TabsList>
                          <p className="mt-3 text-xs text-muted-foreground">
                            Switch between crops here when needed.
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {activeCropTabs.includes("coffee") && (
                      <TabsContent value="coffee" className="space-y-6">
                        <ProcessingTab showDataToolsControls={showDataToolsControls} />
                      </TabsContent>
                    )}
                    {activeCropTabs.includes("pepper") && (
                      <TabsContent value="pepper" className="space-y-6">
                        <PepperTab />
                      </TabsContent>
                    )}
                    {activeCropTabs.includes("rubber") && (
                      <TabsContent value="rubber" className="space-y-6">
                        <RubberTab />
                      </TabsContent>
                    )}
                  </Tabs>
                )
              })()}
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

              <Card className="border-border/70 bg-white/85">
                <CardHeader className="gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-emerald-700" />
                      AI Inventory Analysis
                    </CardTitle>
                    <CardDescription>
                      Run a broader one-shot review when you want a longer narrative on inventory, processing, costs, and season patterns.
                    </CardDescription>
                  </div>
                  <Button onClick={generateAIAnalysis} disabled={isAnalyzing} className="bg-emerald-700 hover:bg-emerald-800">
                    {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {analysisError ? <div className="text-sm text-red-600">{analysisError}</div> : null}
                  {aiAnalysis ? (
                    <div className="max-h-[28rem] overflow-y-auto whitespace-pre-line text-sm text-foreground">
                      {aiAnalysis}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Run the AI analysis to see a longer recommendation set grounded in the current fiscal year data.
                    </div>
                  )}
                </CardContent>
              </Card>
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
        {(showMobileSectionRail || isStandaloneMobileApp) && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.45)] backdrop-blur">
            {isStandaloneMobileApp ? (
              <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={goToWorkspaceNavigator}
                    className={cn(
                      "flex min-h-11 flex-1 min-w-[6.75rem] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors touch-manipulation",
                      activeTab === DASHBOARD_LAUNCHER_TAB
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-black/10 bg-white text-neutral-700",
                    )}
                  >
                    <Home className="h-3.5 w-3.5" />
                    <span className="truncate">Workspace</span>
                  </button>

                  {mobileAppSectionGroups.map((group) => {
                    const GroupIcon = group.icon
                    const isActive = activeTabGroup === group.id
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleSectionSelect(group.id)}
                        className={cn(
                          "flex min-h-11 flex-1 min-w-[6.75rem] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors touch-manipulation",
                          isActive
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-black/10 bg-white text-neutral-700",
                        )}
                      >
                        <GroupIcon className="h-3.5 w-3.5" />
                        <span className="truncate">{group.label}</span>
                      </button>
                    )
                  })}
                </div>

                {showMobileSectionRail && (
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {mobilePrimarySectionTabs.map((tab) => {
                      const TabIcon = tab.icon
                      const isActive = activeTab === tab.value
                      return (
                        <button
                          key={tab.value}
                          type="button"
                          onClick={() => handleTabChange(tab.value)}
                          className={cn(
                            "flex min-h-11 flex-1 min-w-[8.25rem] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors touch-manipulation",
                            isActive
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-black/10 bg-white text-neutral-700",
                          )}
                        >
                          <TabIcon className="h-3.5 w-3.5" />
                          <span className="truncate">{tab.label}</span>
                        </button>
                      )
                    })}
                    {hiddenMobileSectionTabCount > 0 && (
                      <button
                        type="button"
                        onClick={goToWorkspaceNavigator}
                        className="flex min-h-11 min-w-[8.25rem] items-center justify-center rounded-xl border border-dashed border-black/15 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition-colors touch-manipulation hover:border-emerald-200 hover:text-emerald-700"
                      >
                        More tabs
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 no-scrollbar">
                {mobilePrimarySectionTabs.map((tab) => {
                  const TabIcon = tab.icon
                  const isActive = activeTab === tab.value
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => handleTabChange(tab.value)}
                      className={cn(
                        "flex min-h-11 flex-1 min-w-[8.25rem] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors touch-manipulation",
                        isActive
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-black/10 bg-white text-neutral-700",
                      )}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  )
                })}
                {hiddenMobileSectionTabCount > 0 && (
                  <button
                    type="button"
                    onClick={goToWorkspaceNavigator}
                    className="flex min-h-11 min-w-[8.25rem] items-center justify-center rounded-xl border border-dashed border-black/15 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition-colors touch-manipulation hover:border-emerald-200 hover:text-emerald-700"
                  >
                    More tabs
                  </button>
                )}
              </div>
            )}
          </div>
        )}
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
        {isNewItemDialogOpen && (
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/40",
              isMobile ? "flex items-end justify-center p-0" : "flex items-center justify-center p-4",
            )}
            onClick={() => {
              setIsNewItemDialogOpen(false)
              resetNewItemForm()
            }}
          >
            <div
              className={cn(
                "w-full bg-white shadow-xl",
                isMobile
                  ? "max-h-[92vh] rounded-t-2xl overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
                  : "max-w-xl rounded-lg p-6",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Add Inventory Item</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsNewItemDialogOpen(false)
                    resetNewItemForm()
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-item-name">Item Name</Label>
                    <Input
                      id="new-item-name"
                      value={newItemForm.name}
                      placeholder="e.g., MOP, Urea, Parchment bags"
                      onChange={(event) => setNewItemForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-unit">Unit</Label>
                    <Select
                      value={newItemForm.unit}
                      onValueChange={(value) => setNewItemForm((prev) => ({ ...prev, unit: value }))}
                    >
                      <SelectTrigger id="new-item-unit" className="w-full">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="bags">bags</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="units">units</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-item-location">Location</Label>
                  <Select
                    value={newItemForm.locationId}
                    onValueChange={(value) => setNewItemForm((prev) => ({ ...prev, locationId: value }))}
                  >
                    <SelectTrigger id="new-item-location" className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh] overflow-y-auto">
                      <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name || loc.code || "Unnamed location"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Choose where this item is stored.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-item-qty">Initial Quantity (optional)</Label>
                    <Input
                      id="new-item-qty"
                      type="number"
                      min={0}
                      step="0.01"
                      value={newItemForm.quantity}
                      onKeyDown={preventNegativeKey}
                      onChange={(event) =>
                        setNewItemForm((prev) => ({ ...prev, quantity: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-price">Unit Price (optional)</Label>
                    <Input
                      id="new-item-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={newItemForm.price}
                      onKeyDown={preventNegativeKey}
                      onChange={(event) =>
                        setNewItemForm((prev) => ({ ...prev, price: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-item-notes">Notes (optional)</Label>
                  <Textarea
                    id="new-item-notes"
                    value={newItemForm.notes}
                    placeholder="Supplier, batch number, or usage notes"
                    onChange={(event) => setNewItemForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsNewItemDialogOpen(false)
                    resetNewItemForm()
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleCreateNewItem} disabled={isSavingNewItem}>
                  {isSavingNewItem ? "Saving..." : "Add Item"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {isEditDialogOpen && editingTransaction && (
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/40",
              isMobile ? "flex items-end justify-center p-0" : "flex items-center justify-center p-4",
            )}
            onClick={() => {
              setIsEditDialogOpen(false)
              setEditingTransaction(null)
            }}
          >
            <div
              className={cn(
                "w-full bg-white shadow-xl",
                isMobile
                  ? "max-h-[92vh] rounded-t-2xl overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
                  : "max-w-2xl rounded-lg p-6",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit Transaction</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingTransaction(null)
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-item">Item Type</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit item type help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Choose the inventory item tied to this transaction.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-transaction-item"
                      value={editingTransaction.item_type}
                      onChange={(event) => handleEditTransactionChange("item_type", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-type">Transaction Type</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit transaction type help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Restocking adds stock, depleting reduces it.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={editingTransaction.transaction_type}
                      onValueChange={(value) => handleEditTransactionChange("transaction_type", value)}
                    >
                      <SelectTrigger id="edit-transaction-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restock">Restocking</SelectItem>
                        <SelectItem value="deplete">Depleting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-transaction-location">Location</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Edit location help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Location ties the transaction to an estate block.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select
                    value={editingTransaction.location_id ?? LOCATION_UNASSIGNED}
                    onValueChange={(value) =>
                      handleEditTransactionChange("location_id", value === LOCATION_UNASSIGNED ? null : value)
                    }
                  >
                    <SelectTrigger id="edit-transaction-location" className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh] overflow-y-auto">
                      <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name || loc.code || "Unnamed location"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!editingTransaction.location_id && (
                    <p className="text-xs text-muted-foreground">
                      Legacy transaction (no location). Keep Unassigned (legacy) or assign a location.
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-qty">Quantity</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit quantity help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Adjusting quantity will recalc inventory totals.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-transaction-qty"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editingTransaction.quantity ?? ""}
                      onKeyDown={preventNegativeKey}
                      onWheel={preventNumberScrollChange}
                      onChange={(event) => {
                        const nextValue = coerceNonNegativeNumber(event.target.value)
                        if (nextValue === null) return
                        handleEditTransactionChange("quantity", nextValue)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-price">Unit Price</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit unit price help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Used to compute total cost for this transaction.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-transaction-price"
                      type="number"
                      value={editingTransaction.price ?? ""}
                      onChange={(event) => handleEditTransactionChange("price", Number(event.target.value))}
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Cost: {formatCurrency(Number(editingTransaction.total_cost || 0))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-transaction-notes">Notes</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Edit notes help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Capture buyer refs, processing notes, or extra context.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Textarea
                    id="edit-transaction-notes"
                    value={editingTransaction.notes ?? ""}
                    onChange={(event) => handleEditTransactionChange("notes", event.target.value)}
                  />
                </div>
              </div>
              <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingTransaction(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleUpdateTransaction} disabled={isSavingTransactionEdit}>
                  {isSavingTransactionEdit ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {isInventoryEditDialogOpen && editingInventoryItem && (
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/40",
              isMobile ? "flex items-end justify-center p-0" : "flex items-center justify-center p-4",
            )}
            onClick={() => {
              setIsInventoryEditDialogOpen(false)
              setEditingInventoryItem(null)
            }}
          >
            <div
              className={cn(
                "w-full bg-white shadow-xl",
                isMobile
                  ? "max-h-[92vh] rounded-t-2xl overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
                  : "max-w-xl rounded-lg p-6",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit Inventory Item</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsInventoryEditDialogOpen(false)
                    setEditingInventoryItem(null)
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-item-name">Item Name</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Item name help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Use clear names (e.g., Arabica Cherry, Dry Parch).</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-item-name"
                      value={inventoryEditForm.name}
                      onChange={(event) =>
                        setInventoryEditForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-item-unit">Unit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Unit help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Common units are kg, bags, or liters.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-item-unit"
                      value={inventoryEditForm.unit}
                      onChange={(event) =>
                        setInventoryEditForm((prev) => ({ ...prev, unit: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-item-location">Adjustment Location</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Adjustment location help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Choose where the correction should be applied.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select value={inventoryEditLocationId} onValueChange={setInventoryEditLocationId}>
                    <SelectTrigger id="edit-item-location" className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh] overflow-y-auto">
                      <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name || loc.code || "Unnamed location"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Inventory adjustments are recorded against this location.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-item-qty">Quantity</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Adjustment quantity help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Updating quantity adds a correction transaction.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="edit-item-qty"
                    type="number"
                    min={0}
                    step="0.01"
                    value={inventoryEditForm.quantity}
                    onKeyDown={preventNegativeKey}
                    onWheel={preventNumberScrollChange}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      const numeric = coerceNonNegativeNumber(nextValue)
                      if (numeric === null && nextValue !== "") return
                      setInventoryEditForm((prev) => ({ ...prev, quantity: nextValue }))
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Changing quantity adds a correction transaction to keep history consistent.
                  </p>
                </div>
              </div>
              <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsInventoryEditDialogOpen(false)
                    setEditingInventoryItem(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveInventoryEdit} disabled={isSavingInventoryEdit}>
                  {isSavingInventoryEdit ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {deleteConfirmDialogOpen && (
          <div
            className={cn(
              "fixed inset-0 z-50 bg-black/40",
              isMobile ? "flex items-end justify-center p-0" : "flex items-center justify-center p-4",
            )}
            onClick={() => {
              setDeleteConfirmDialogOpen(false)
              setTransactionToDelete(null)
            }}
          >
            <div
              className={cn(
                "w-full bg-white shadow-xl",
                isMobile
                  ? "rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
                  : "max-w-md rounded-lg p-6",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold">Delete transaction?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This will remove the transaction and recalculate inventory totals.
              </p>
              <div className={cn("mt-6 flex gap-2", isMobile ? "flex-col-reverse" : "justify-end")}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteConfirmDialogOpen(false)
                    setTransactionToDelete(null)
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteTransaction}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
