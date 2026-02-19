"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { MODULES, MODULE_BUNDLES, type ModuleBundle } from "@/lib/modules"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  TENANT_FEATURE_FLAG_DEFINITIONS,
  TENANT_UI_VARIANTS,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"
import { formatDateForDisplay, formatDateOnly } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"
import { roleLabel } from "@/lib/roles"

interface Tenant {
  id: string
  name: string
  created_at: string
}

interface User {
  id: string
  username: string
  role: string
  tenant_id: string
  created_at: string
}

interface ModulePermission {
  id: string
  label: string
  enabled: boolean
}

interface AuditLog {
  id: string
  tenant_id: string
  user_id: string | null
  username: string
  role: string
  action: string
  entity_type: string
  entity_id: string | null
  before_data: any
  after_data: any
  created_at: string
}

interface WeeklySummary {
  inventoryCount: number
  transactionCount: number
  processingCount: number
  dispatchCount: number
  salesCount: number
  salesRevenue: number
  laborSpend: number
  expenseSpend: number
  receivablesOutstanding: number
}

interface WeeklySummaryRange {
  startDate: string
  endDate: string
  totalDays: number
}

interface WeeklySummaryResponse {
  summary: WeeklySummary
  compareSummary: WeeklySummary | null
  range: WeeklySummaryRange | null
  compareRange: WeeklySummaryRange | null
}

interface TenantProfile {
  uiVariant: TenantUiVariant
  featureFlags: TenantFeatureFlags
}

const AUDIT_ENTITY_TYPES = [
  { id: "all", label: "All modules" },
  { id: "processing_records", label: "Processing" },
  { id: "dispatch_records", label: "Dispatch" },
  { id: "sales_records", label: "Sales" },
  { id: "journal_entries", label: "Journal" },
]

const formatAuditTimestamp = (value: string) => {
  return formatDateForDisplay(value)
}

const toDateInputValue = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const DEFAULT_WEEKLY_END = toDateInputValue(new Date())
const DEFAULT_WEEKLY_START = toDateInputValue(new Date(new Date().setDate(new Date().getDate() - 6)))

const formatAuditPayload = (payload: any) => {
  if (!payload) return "None"
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

const formatCount = (value: number) => Number(value || 0).toLocaleString()

const formatDeltaText = (delta: number, currency = false) => {
  if (delta === 0) return "no change"
  const abs = currency ? formatCurrency(Math.abs(delta)) : formatCount(Math.abs(delta))
  return `${delta > 0 ? "+" : "-"}${abs}`
}

const buildWeeklySummaryText = (
  summary: WeeklySummary,
  tenantName: string,
  range: WeeklySummaryRange | null,
  compareSummary: WeeklySummary | null,
  compareRange: WeeklySummaryRange | null,
) => {
  const periodDays = range?.totalDays || 7
  const rangeLabel = range ? `${range.startDate} to ${range.endDate}` : "last 7 days"
  const compareLabel = compareRange ? `${compareRange.startDate} to ${compareRange.endDate}` : "previous period"
  const withCompare = (label: string, value: string, delta?: string | null) =>
    delta ? `${label}: ${value} (${delta} vs ${compareLabel})` : `${label}: ${value}`

  const lines = [
    `FarmFlow Weekly Summary (${tenantName})`,
    `Range: ${rangeLabel} (${periodDays} day${periodDays === 1 ? "" : "s"})`,
    `Inventory items: ${formatCount(summary.inventoryCount)}`,
    withCompare(
      `Transactions (${periodDays}d)`,
      formatCount(summary.transactionCount),
      compareSummary ? formatDeltaText(summary.transactionCount - compareSummary.transactionCount) : null,
    ),
    withCompare(
      `Processing records (${periodDays}d)`,
      formatCount(summary.processingCount),
      compareSummary ? formatDeltaText(summary.processingCount - compareSummary.processingCount) : null,
    ),
    withCompare(
      `Dispatches (${periodDays}d)`,
      formatCount(summary.dispatchCount),
      compareSummary ? formatDeltaText(summary.dispatchCount - compareSummary.dispatchCount) : null,
    ),
    withCompare(
      `Sales (${periodDays}d)`,
      formatCount(summary.salesCount),
      compareSummary ? formatDeltaText(summary.salesCount - compareSummary.salesCount) : null,
    ),
    withCompare(
      `Sales revenue (${periodDays}d)`,
      formatCurrency(summary.salesRevenue),
      compareSummary ? formatDeltaText(summary.salesRevenue - compareSummary.salesRevenue, true) : null,
    ),
    withCompare(
      `Labor spend (${periodDays}d)`,
      formatCurrency(summary.laborSpend),
      compareSummary ? formatDeltaText(summary.laborSpend - compareSummary.laborSpend, true) : null,
    ),
    withCompare(
      `Expense spend (${periodDays}d)`,
      formatCurrency(summary.expenseSpend),
      compareSummary ? formatDeltaText(summary.expenseSpend - compareSummary.expenseSpend, true) : null,
    ),
    `Receivables outstanding: ${formatCurrency(summary.receivablesOutstanding)}`,
  ]
  return lines.join("\n")
}

export default function AdminPage() {
  const { user, isOwner } = useAuth()
  const { toast } = useToast()


  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string>("")
  const [previewRole, setPreviewRole] = useState<"admin" | "user">("admin")
  const [newTenantName, setNewTenantName] = useState("")

  const [users, setUsers] = useState<User[]>([])
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("user")

  const [modulePermissions, setModulePermissions] = useState<ModulePermission[]>([])
  const [tenantProfileDraft, setTenantProfileDraft] = useState<TenantProfile>({
    uiVariant: DEFAULT_TENANT_UI_VARIANT,
    featureFlags: DEFAULT_TENANT_FEATURE_FLAGS,
  })
  const [isTenantProfileLoading, setIsTenantProfileLoading] = useState(false)
  const [isSavingTenantProfile, setIsSavingTenantProfile] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({})
  const [isUpdatingUserId, setIsUpdatingUserId] = useState<string | null>(null)
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null)
  const [isResettingPasswordUserId, setIsResettingPasswordUserId] = useState<string | null>(null)
  const [isDeletingTenantId, setIsDeletingTenantId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [userModulePermissions, setUserModulePermissions] = useState<ModulePermission[]>([])
  const [userModuleSource, setUserModuleSource] = useState<"user" | "tenant" | "default" | "">("")
  const [isUserModulesLoading, setIsUserModulesLoading] = useState(false)
  const [isSavingUserModules, setIsSavingUserModules] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotalCount, setAuditTotalCount] = useState(0)
  const [auditEntityType, setAuditEntityType] = useState("all")
  const [isAuditLoading, setIsAuditLoading] = useState(false)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null)
  const [weeklyCompareSummary, setWeeklyCompareSummary] = useState<WeeklySummary | null>(null)
  const [weeklySummaryRange, setWeeklySummaryRange] = useState<WeeklySummaryRange | null>(null)
  const [weeklyCompareRange, setWeeklyCompareRange] = useState<WeeklySummaryRange | null>(null)
  const [weeklyStartDate, setWeeklyStartDate] = useState(DEFAULT_WEEKLY_START)
  const [weeklyEndDate, setWeeklyEndDate] = useState(DEFAULT_WEEKLY_END)
  const [weeklyCompareMode, setWeeklyCompareMode] = useState<"none" | "previous">("previous")
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(false)

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [tenants, selectedTenantId],
  )
  const tenantPreviewUrl = useMemo(() => {
    if (!selectedTenantId) return "/dashboard"
    const params = new URLSearchParams({
      previewTenantId: selectedTenantId,
      previewRole,
    })
    if (selectedTenant?.name) {
      params.set("previewTenantName", selectedTenant.name)
    }
    return `/dashboard?${params.toString()}`
  }, [previewRole, selectedTenant?.name, selectedTenantId])
  const enabledModuleLabels = useMemo(
    () => modulePermissions.filter((module) => module.enabled).map((module) => module.label),
    [modulePermissions],
  )

  const loadTenants = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/tenants")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load tenants")
      }
      setTenants(data.tenants || [])
      if (data.tenants?.length) {
        setSelectedTenantId((prev) => prev || data.tenants[0].id)
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load tenants", variant: "destructive" })
    }
  }, [toast])

  useEffect(() => {
    if (isOwner) return
    if (user?.tenantId) {
      setSelectedTenantId((prev) => prev || user.tenantId)
    }
  }, [isOwner, user?.tenantId])

  const loadUsers = useCallback(async (tenantId: string) => {
    try {
      const response = await fetch(`/api/admin/users?tenantId=${tenantId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load users")
      }
      setUsers(data.users || [])
      const roleDrafts: Record<string, string> = {}
      ;(data.users || []).forEach((user: User) => {
        roleDrafts[user.id] = user.role
      })
      setUserRoleDrafts(roleDrafts)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load users", variant: "destructive" })
    }
  }, [toast])

  const loadModules = useCallback(async (tenantId: string) => {
    try {
      const response = await fetch(`/api/admin/tenant-modules?tenantId=${tenantId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load tenant modules")
      }
      setModulePermissions(data.modules || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load tenant modules", variant: "destructive" })
    }
  }, [toast])

  const loadTenantProfile = useCallback(async (tenantId: string) => {
    setIsTenantProfileLoading(true)
    try {
      const response = await fetch(`/api/admin/tenant-profile?tenantId=${tenantId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load tenant profile")
      }
      setTenantProfileDraft({
        uiVariant: (data.profile?.uiVariant || DEFAULT_TENANT_UI_VARIANT) as TenantUiVariant,
        featureFlags: { ...DEFAULT_TENANT_FEATURE_FLAGS, ...(data.profile?.featureFlags || {}) },
      })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load tenant profile", variant: "destructive" })
      setTenantProfileDraft({
        uiVariant: DEFAULT_TENANT_UI_VARIANT,
        featureFlags: DEFAULT_TENANT_FEATURE_FLAGS,
      })
    } finally {
      setIsTenantProfileLoading(false)
    }
  }, [toast])

  const loadAuditLogs = useCallback(async (tenantId: string, entityType: string) => {
    setIsAuditLoading(true)
    try {
      const params = new URLSearchParams({ tenantId, limit: "50" })
      if (entityType && entityType !== "all") {
        params.set("entityType", entityType)
      }
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load audit logs")
      }
      setAuditLogs(data.logs || [])
      setAuditTotalCount(Number(data.totalCount) || 0)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load audit logs", variant: "destructive" })
      setAuditLogs([])
      setAuditTotalCount(0)
    } finally {
      setIsAuditLoading(false)
    }
  }, [toast])

  const loadWeeklySummary = useCallback(async (): Promise<WeeklySummaryResponse | null> => {
    if (!selectedTenantId) {
      toast({ title: "Select a tenant", description: "Choose a tenant to generate the weekly summary." })
      return null
    }
    if (!weeklyStartDate || !weeklyEndDate) {
      toast({ title: "Choose a date range", description: "Select both start and end dates." })
      return null
    }
    if (weeklyStartDate > weeklyEndDate) {
      toast({ title: "Invalid date range", description: "Start date must be before end date.", variant: "destructive" })
      return null
    }
    setIsWeeklyLoading(true)
    try {
      const params = new URLSearchParams({
        tenantId: selectedTenantId,
        startDate: weeklyStartDate,
        endDate: weeklyEndDate,
        compare: weeklyCompareMode === "previous" ? "true" : "false",
      })
      const response = await fetch(`/api/admin/weekly-summary?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load weekly summary")
      }
      const payload: WeeklySummaryResponse = {
        summary: data.summary as WeeklySummary,
        compareSummary: (data.compareSummary as WeeklySummary | null) || null,
        range: (data.range as WeeklySummaryRange | null) || null,
        compareRange: (data.compareRange as WeeklySummaryRange | null) || null,
      }
      setWeeklySummary(payload.summary)
      setWeeklyCompareSummary(payload.compareSummary)
      setWeeklySummaryRange(payload.range)
      setWeeklyCompareRange(payload.compareRange)
      return payload
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load weekly summary", variant: "destructive" })
      setWeeklySummary(null)
      setWeeklyCompareSummary(null)
      setWeeklySummaryRange(null)
      setWeeklyCompareRange(null)
      return null
    } finally {
      setIsWeeklyLoading(false)
    }
  }, [selectedTenantId, toast, weeklyCompareMode, weeklyEndDate, weeklyStartDate])

  const weeklySummaryText = useMemo(() => {
    if (!weeklySummary || !selectedTenant) return ""
    return buildWeeklySummaryText(
      weeklySummary,
      selectedTenant.name,
      weeklySummaryRange,
      weeklyCompareSummary,
      weeklyCompareRange,
    )
  }, [selectedTenant, weeklyCompareRange, weeklyCompareSummary, weeklySummary, weeklySummaryRange])

  const handleCopyWeeklySummary = async () => {
    let textToCopy = weeklySummaryText
    if (!textToCopy) {
      const payload = await loadWeeklySummary()
      if (!payload) return
      textToCopy = buildWeeklySummaryText(
        payload.summary,
        selectedTenant?.name || "Tenant",
        payload.range,
        payload.compareSummary,
        payload.compareRange,
      )
    }
    try {
      await navigator.clipboard.writeText(textToCopy)
      toast({ title: "Summary copied", description: "Paste into WhatsApp or email." })
    } catch (error: any) {
      toast({ title: "Copy failed", description: error.message || "Unable to copy summary", variant: "destructive" })
    }
  }

  const handleDownloadWeeklySummary = async () => {
    let payload: WeeklySummaryResponse | null = null
    if (!weeklySummary) {
      payload = await loadWeeklySummary()
      if (!payload) return
    } else {
      payload = {
        summary: weeklySummary,
        compareSummary: weeklyCompareSummary,
        range: weeklySummaryRange,
        compareRange: weeklyCompareRange,
      }
    }
    if (!payload) return
    const tenantName = selectedTenant?.name || "Tenant"
    const summaryText = buildWeeklySummaryText(
      payload.summary,
      tenantName,
      payload.range,
      payload.compareSummary,
      payload.compareRange,
    )
    const summaryWindow = window.open("", "_blank")
    if (!summaryWindow) {
      toast({ title: "Popup blocked", description: "Allow popups to save the PDF." })
      return
    }
    const doc = summaryWindow.document
    doc.open()
    summaryWindow.document.write(`
      <html>
        <head>
          <title>Weekly Summary</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 18px; margin-bottom: 12px; }
            pre { white-space: pre-wrap; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1 id="summary-title"></h1>
          <pre id="summary-body"></pre>
        </body>
      </html>
    `)
    doc.close()
    const titleEl = doc.getElementById("summary-title")
    if (titleEl) {
      const rangeLabel = payload.range ? `${payload.range.startDate} to ${payload.range.endDate}` : "Current period"
      titleEl.textContent = `${tenantName} Weekly Summary (${rangeLabel})`
    }
    const bodyEl = doc.getElementById("summary-body")
    if (bodyEl) {
      bodyEl.textContent = summaryText
    }
    summaryWindow.focus()
    summaryWindow.print()
  }

  useEffect(() => {
    if (isOwner) {
      loadTenants()
    }
  }, [isOwner, loadTenants])

  useEffect(() => {
    if (selectedTenantId) {
      setSelectedUserId("")
      loadUsers(selectedTenantId)
      loadModules(selectedTenantId)
      if (isOwner) {
        loadTenantProfile(selectedTenantId)
      }
    }
  }, [isOwner, selectedTenantId, loadModules, loadTenantProfile, loadUsers])

  useEffect(() => {
    if (selectedTenantId) {
      loadAuditLogs(selectedTenantId, auditEntityType)
    }
  }, [selectedTenantId, auditEntityType, loadAuditLogs])

  useEffect(() => {
    setWeeklySummary(null)
    setWeeklyCompareSummary(null)
    setWeeklySummaryRange(null)
    setWeeklyCompareRange(null)
  }, [selectedTenantId])

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId("")
      return
    }
    if (!selectedUserId || !users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(users[0].id)
    }
  }, [users, selectedUserId])

  const loadUserModules = useCallback(async (userId: string) => {
    if (!userId) {
      setUserModulePermissions(MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })))
      setUserModuleSource("default")
      return
    }

    setIsUserModulesLoading(true)
    try {
      const response = await fetch(`/api/admin/user-modules?userId=${userId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load user modules")
      }
      setUserModulePermissions(
        data.modules || MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })),
      )
      setUserModuleSource(data.source || "default")
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load user modules", variant: "destructive" })
      setUserModulePermissions(MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })))
      setUserModuleSource("default")
    } finally {
      setIsUserModulesLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (selectedUserId) {
      loadUserModules(selectedUserId)
      return
    }
    setUserModulePermissions(MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })))
    setUserModuleSource("default")
  }, [selectedUserId, loadUserModules])

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) {
      toast({ title: "Missing name", description: "Enter a tenant name to continue." })
      return
    }

    try {
      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTenantName.trim() }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create tenant")
      }
      setNewTenantName("")
      await loadTenants()
      toast({ title: "Tenant created", description: `${data.tenant.name} is ready.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create tenant", variant: "destructive" })
    }
  }

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (!isOwner) {
      toast({ title: "Platform owner only", description: "Only platform owners can delete tenants." })
      return
    }
    if (tenant.id === user?.tenantId) {
      toast({
        title: "Cannot delete active tenant",
        description: "Switch accounts before deleting this tenant.",
        variant: "destructive",
      })
      return
    }
    if (!window.confirm(`Delete ${tenant.name}? This will remove all estate data.`)) {
      return
    }
    setIsDeletingTenantId(tenant.id)
    try {
      const response = await fetch(`/api/admin/tenants?tenantId=${tenant.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete tenant")
      }
      toast({ title: "Tenant deleted", description: `${tenant.name} removed.` })
      await loadTenants()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete tenant", variant: "destructive" })
    } finally {
      setIsDeletingTenantId(null)
    }
  }

  const handleCreateUser = async () => {
    if (!selectedTenantId) {
      toast({ title: "Pick a tenant", description: "Select a tenant before creating a user." })
      return
    }

    if (!newUsername.trim() || !newPassword) {
      toast({ title: "Missing fields", description: "Username and password are required." })
      return
    }

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          tenantId: selectedTenantId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create user")
      }
      setNewUsername("")
      setNewPassword("")
      setNewRole("user")
      await loadUsers(selectedTenantId)
      toast({ title: "User created", description: `${data.user.username} added.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" })
    }
  }

  const toggleModule = (moduleId: string) => {
    setModulePermissions((prev) =>
      prev.map((module) => (module.id === moduleId ? { ...module, enabled: !module.enabled } : module)),
    )
  }

  const applyModuleBundle = useCallback(
    (bundle: ModuleBundle) => {
      setModulePermissions(
        MODULES.map((module) => ({
          id: module.id,
          label: module.label,
          enabled: bundle.modules.includes(module.id),
        })),
      )
      toast({
        title: `${bundle.label} applied`,
        description: "Review the checklist below and save to confirm module access.",
      })
    },
    [toast],
  )

  const toggleUserModule = (moduleId: string) => {
    setUserModulePermissions((prev) =>
      prev.map((module) => (module.id === moduleId ? { ...module, enabled: !module.enabled } : module)),
    )
  }

  const handleSaveModules = async () => {
    if (!isOwner) {
      toast({ title: "Platform owner only", description: "Only platform owners can change tenant modules." })
      return
    }
    if (!selectedTenantId) {
      return
    }

    try {
      const response = await fetch("/api/admin/tenant-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId, modules: modulePermissions }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update modules")
      }
      toast({ title: "Modules updated", description: "Tenant module access saved." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update modules", variant: "destructive" })
    }
  }

  const handleSaveTenantProfile = async () => {
    if (!isOwner) {
      toast({ title: "Platform owner only", description: "Only platform owners can change tenant profile." })
      return
    }
    if (!selectedTenantId) {
      return
    }

    setIsSavingTenantProfile(true)
    try {
      const response = await fetch("/api/admin/tenant-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          uiVariant: tenantProfileDraft.uiVariant,
          featureFlags: tenantProfileDraft.featureFlags,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update tenant profile")
      }
      setTenantProfileDraft({
        uiVariant: (data.profile?.uiVariant || DEFAULT_TENANT_UI_VARIANT) as TenantUiVariant,
        featureFlags: { ...DEFAULT_TENANT_FEATURE_FLAGS, ...(data.profile?.featureFlags || {}) },
      })
      toast({
        title: "Tenant profile saved",
        description: "UI variant and feature flags updated for the selected tenant.",
      })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update tenant profile", variant: "destructive" })
    } finally {
      setIsSavingTenantProfile(false)
    }
  }

  const handleSaveUserModules = async () => {
    if (!selectedUserId) {
      return
    }

    setIsSavingUserModules(true)
    try {
      const response = await fetch("/api/admin/user-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, modules: userModulePermissions }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update user modules")
      }
      toast({ title: "User access updated", description: "Module access saved for this user." })
      await loadUserModules(selectedUserId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update user modules", variant: "destructive" })
    } finally {
      setIsSavingUserModules(false)
    }
  }

  const handleRoleDraftChange = (userId: string, role: string) => {
    setUserRoleDrafts((prev) => ({ ...prev, [userId]: role }))
  }

  const handleSaveUserRole = async (user: User) => {
    const nextRole = userRoleDrafts[user.id] || user.role
    if (nextRole === user.role) {
      return
    }

    setIsUpdatingUserId(user.id)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: nextRole }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update user role")
      }
      toast({ title: "Role updated", description: `${user.username} is now ${nextRole}.` })
      await loadUsers(selectedTenantId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update user role", variant: "destructive" })
    } finally {
      setIsUpdatingUserId(null)
    }
  }

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.username}? This cannot be undone.`)) {
      return
    }

    setIsDeletingUserId(user.id)
    try {
      const response = await fetch(`/api/admin/users?userId=${user.id}`, {
        method: "DELETE",
        
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete user")
      }
      toast({ title: "User deleted", description: `${user.username} has been removed.` })
      await loadUsers(selectedTenantId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" })
    } finally {
      setIsDeletingUserId(null)
    }
  }

  const handleResetUserPassword = async (user: User) => {
    if (!window.confirm(`Reset password for ${user.username}? A temporary password will be generated.`)) {
      return
    }

    setIsResettingPasswordUserId(user.id)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reset password")
      }

      const tempPassword = String(data.temporaryPassword || "")
      if (tempPassword) {
        window.prompt(`Temporary password for ${user.username} (copy now):`, tempPassword)
      }

      toast({
        title: "Password reset",
        description: `${user.username} must rotate password at next login.`,
      })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset password", variant: "destructive" })
    } finally {
      setIsResettingPasswordUserId(null)
    }
  }

  const handleResetUserModules = async () => {
    if (!selectedUserId) {
      return
    }

    try {
      const response = await fetch(`/api/admin/user-modules?userId=${selectedUserId}`, {
        method: "DELETE",
        
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reset user modules")
      }
      toast({ title: "User reset", description: "User access now follows tenant defaults." })
      await loadUserModules(selectedUserId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset user modules", variant: "destructive" })
    }
  }

  const handleSeedMockData = async () => {
    if (!selectedTenantId) {
      return
    }
    const confirmed = window.confirm(
      "Reseed mock data for this tenant? Existing tenant transaction data will be replaced with fresh mock records.",
    )
    if (!confirmed) {
      return
    }

    setIsSeeding(true)
    try {
      const response = await fetch("/api/admin/seed-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId, resetExisting: true }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to seed tenant data")
      }
      const seededCount =
        Number(data?.counts?.inventoryTransactions || 0) +
        Number(data?.counts?.laborTransactions || 0) +
        Number(data?.counts?.expenseTransactions || 0) +
        Number(data?.counts?.processingRecords || 0) +
        Number(data?.counts?.dispatchRecords || 0) +
        Number(data?.counts?.salesRecords || 0)
      toast({
        title: "Mock data reseeded",
        description: `Sample records refreshed (${seededCount} core records + optional module data).`,
      })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to seed tenant data", variant: "destructive" })
    } finally {
      setIsSeeding(false)
    }
  }

  const handleOpenTenantPreview = (openInNewTab = false) => {
    if (!selectedTenantId) {
      toast({ title: "Pick a tenant", description: "Select a tenant before opening preview." })
      return
    }
    if (openInNewTab) {
      window.open(tenantPreviewUrl, "_blank", "noopener,noreferrer")
      return
    }
    window.location.assign(tenantPreviewUrl)
  }

  const weeklyPeriodDays = weeklySummaryRange?.totalDays || 7
  const weeklyPeriodLabel = `${weeklyPeriodDays}d`
  const weeklyRangeLabel = weeklySummaryRange
    ? `${weeklySummaryRange.startDate} to ${weeklySummaryRange.endDate}`
    : `${weeklyStartDate} to ${weeklyEndDate}`
  const weeklyCompareLabel =
    weeklyCompareSummary && weeklyCompareRange ? `${weeklyCompareRange.startDate} to ${weeklyCompareRange.endDate}` : null
  const getDeltaMeta = (current: number, previous: number, currency = false) => {
    const delta = current - previous
    const magnitude = currency ? formatCurrency(Math.abs(delta)) : formatCount(Math.abs(delta))
    const text =
      delta === 0 ? "No change vs previous period" : `${delta > 0 ? "+" : "-"}${magnitude} vs previous period`
    const className = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-muted-foreground"
    return { text, className }
  }
  const weeklyDeltas =
    weeklySummary && weeklyCompareSummary
      ? {
          transaction: getDeltaMeta(weeklySummary.transactionCount, weeklyCompareSummary.transactionCount),
          processing: getDeltaMeta(weeklySummary.processingCount, weeklyCompareSummary.processingCount),
          dispatch: getDeltaMeta(weeklySummary.dispatchCount, weeklyCompareSummary.dispatchCount),
          salesCount: getDeltaMeta(weeklySummary.salesCount, weeklyCompareSummary.salesCount),
          salesRevenue: getDeltaMeta(weeklySummary.salesRevenue, weeklyCompareSummary.salesRevenue, true),
          laborSpend: getDeltaMeta(weeklySummary.laborSpend, weeklyCompareSummary.laborSpend, true),
          expenseSpend: getDeltaMeta(weeklySummary.expenseSpend, weeklyCompareSummary.expenseSpend, true),
        }
      : null
  const enabledModuleCount = modulePermissions.filter((module) => module.enabled).length
  const ownerSectionLinks: Array<{ id: string; label: string }> = [
    { id: "tenant-users", label: "Users" },
    { id: "user-module-overrides", label: "User Access" },
  ]
  if (isOwner) {
    ownerSectionLinks.unshift(
      { id: "tenants", label: "Tenants" },
      { id: "weekly-summary", label: "Weekly KPI" },
      { id: "tenant-profile", label: "Profile" },
      { id: "tenant-modules", label: "Modules" },
      { id: "seed-data", label: "Seed Data" },
      { id: "audit-log", label: "Audit" },
    )
  }

  return (
    <div className="space-y-6">
      <Card
        id="console-overview"
        className="scroll-mt-24 border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50"
      >
        <CardHeader>
          <CardTitle>{isOwner ? "Owner Console" : "Admin Console"}</CardTitle>
          <CardDescription>
            {isOwner
              ? "Manage tenants, preview experiences, seed demo data, and control platform access."
              : "Manage users and module access for your tenant."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Selected Tenant</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedTenant?.name || "Not selected"}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Tenant ID</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{selectedTenantId || "Unavailable"}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Users Loaded</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{users.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Modules Enabled</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{enabledModuleCount}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">{isOwner ? "Tenants" : "Audit Events"}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{isOwner ? tenants.length : auditTotalCount}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ownerSectionLinks.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-border/70 bg-white/90 px-3 py-1 text-xs text-foreground transition hover:border-emerald-200 hover:text-emerald-700"
              >
                {section.label}
              </a>
            ))}
          </div>
          {isOwner && selectedTenantId && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => handleOpenTenantPreview(false)}>
                Preview as {previewRole === "admin" ? "Estate Admin" : "Estate User"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleOpenTenantPreview(true)}>
                Preview in new tab
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card id="tenants" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
            <CardDescription>Create and manage estates/tenants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="tenantName">New Tenant</Label>
                <Input
                  id="tenantName"
                  placeholder="Estate name"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleCreateTenant}>Create Tenant</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Current Tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-emerald-900">Tenant Preview</p>
                <p className="text-xs text-muted-foreground">
                  Open dashboard in preview mode to see tabs as a tenant admin or user without logging out.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  <Label>Preview role</Label>
                  <Select value={previewRole} onValueChange={(value) => setPreviewRole(value === "user" ? "user" : "admin")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Estate Admin</SelectItem>
                      <SelectItem value="user">Estate User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button onClick={() => handleOpenTenantPreview(false)} disabled={!selectedTenantId}>
                    Open Dashboard Preview
                  </Button>
                  <Button variant="outline" className="bg-transparent" onClick={() => handleOpenTenantPreview(true)} disabled={!selectedTenantId}>
                    Open in New Tab
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-white/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No tenants found yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell>{formatDateOnly(tenant.created_at)}</TableCell>
                      <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteTenant(tenant)}
                            disabled={tenant.id === user?.tenantId || isDeletingTenantId === tenant.id}
                          >
                          {isDeletingTenantId === tenant.id ? "Deleting..." : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card id="weekly-summary" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Weekly Summary</CardTitle>
            <CardDescription>Share a quick snapshot with owners or buyers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="weekly-start">Start date</Label>
                <Input
                  id="weekly-start"
                  type="date"
                  value={weeklyStartDate}
                  onChange={(event) => {
                    setWeeklyStartDate(event.target.value)
                    setWeeklySummary(null)
                    setWeeklyCompareSummary(null)
                    setWeeklySummaryRange(null)
                    setWeeklyCompareRange(null)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weekly-end">End date</Label>
                <Input
                  id="weekly-end"
                  type="date"
                  value={weeklyEndDate}
                  onChange={(event) => {
                    setWeeklyEndDate(event.target.value)
                    setWeeklySummary(null)
                    setWeeklyCompareSummary(null)
                    setWeeklySummaryRange(null)
                    setWeeklyCompareRange(null)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Compare period</Label>
                <Select
                  value={weeklyCompareMode}
                  onValueChange={(value) => {
                    const mode = value === "previous" ? "previous" : "none"
                    setWeeklyCompareMode(mode)
                    setWeeklySummary(null)
                    setWeeklyCompareSummary(null)
                    setWeeklySummaryRange(null)
                    setWeeklyCompareRange(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previous">Previous period</SelectItem>
                    <SelectItem value="none">No compare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Selected range</Label>
                <div className="rounded-md border border-border/60 bg-white/80 px-3 py-2 text-sm text-muted-foreground">
                  {weeklyRangeLabel}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={loadWeeklySummary}
                disabled={!selectedTenantId || isWeeklyLoading}
              >
                {isWeeklyLoading ? "Loading..." : "Generate Summary"}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleCopyWeeklySummary}
                disabled={!selectedTenantId}
              >
                Copy WhatsApp summary
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleDownloadWeeklySummary}
                disabled={!selectedTenantId}
              >
                Print / Save PDF
              </Button>
            </div>
            {weeklyCompareLabel && (
              <p className="text-xs text-muted-foreground">
                Comparison window: {weeklyCompareLabel}
              </p>
            )}
            {!weeklySummary && (
              <p className="text-sm text-muted-foreground">
                Generate a summary to see activity in your selected date range.
              </p>
            )}
            {weeklySummary && (
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Inventory items</p>
                  <p className="font-semibold">{formatCount(weeklySummary.inventoryCount)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Transactions ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCount(weeklySummary.transactionCount)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.transaction.className}`}>{weeklyDeltas.transaction.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Processing records ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCount(weeklySummary.processingCount)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.processing.className}`}>{weeklyDeltas.processing.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Dispatches ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCount(weeklySummary.dispatchCount)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.dispatch.className}`}>{weeklyDeltas.dispatch.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Sales ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCount(weeklySummary.salesCount)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.salesCount.className}`}>{weeklyDeltas.salesCount.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Sales revenue ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCurrency(weeklySummary.salesRevenue)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.salesRevenue.className}`}>{weeklyDeltas.salesRevenue.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Labor spend ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCurrency(weeklySummary.laborSpend)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.laborSpend.className}`}>{weeklyDeltas.laborSpend.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <p className="text-xs text-muted-foreground">Expense spend ({weeklyPeriodLabel})</p>
                  <p className="font-semibold">{formatCurrency(weeklySummary.expenseSpend)}</p>
                  {weeklyDeltas && <p className={`mt-1 text-xs ${weeklyDeltas.expenseSpend.className}`}>{weeklyDeltas.expenseSpend.text}</p>}
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3 md:col-span-2">
                  <p className="text-xs text-muted-foreground">Receivables outstanding</p>
                  <p className="font-semibold">{formatCurrency(weeklySummary.receivablesOutstanding)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card id="tenant-profile" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Tenant Experience Profile</CardTitle>
            <CardDescription>
              Configure UI variant and feature flags for the selected tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedTenantId ? (
              <p className="text-sm text-muted-foreground">Select a tenant first.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>UI variant</Label>
                  <Select
                    value={tenantProfileDraft.uiVariant}
                    onValueChange={(value) =>
                      setTenantProfileDraft((prev) => ({
                        ...prev,
                        uiVariant: (value || DEFAULT_TENANT_UI_VARIANT) as TenantUiVariant,
                      }))
                    }
                    disabled={isTenantProfileLoading}
                  >
                    <SelectTrigger className="w-full md:w-[320px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TENANT_UI_VARIANTS.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {TENANT_UI_VARIANTS.find((variant) => variant.id === tenantProfileDraft.uiVariant)?.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {TENANT_FEATURE_FLAG_DEFINITIONS.map((flag) => (
                    <label
                      key={flag.id}
                      className="flex items-start gap-3 rounded-lg border border-border/60 bg-white/80 p-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(tenantProfileDraft.featureFlags[flag.id])}
                        disabled={isTenantProfileLoading}
                        onChange={(event) =>
                          setTenantProfileDraft((prev) => ({
                            ...prev,
                            featureFlags: {
                              ...prev.featureFlags,
                              [flag.id]: event.target.checked,
                            },
                          }))
                        }
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{flag.label}</p>
                        <p className="text-xs text-muted-foreground">{flag.description}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <Button onClick={handleSaveTenantProfile} disabled={isTenantProfileLoading || isSavingTenantProfile}>
                  {isSavingTenantProfile ? "Saving..." : isTenantProfileLoading ? "Loading..." : "Save Tenant Profile"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card id="tenant-modules" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Tenant Modules</CardTitle>
            <CardDescription>Control which modules are available to users in this tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 text-sm">
              <p className="font-medium text-emerald-900">Enabled modules ({enabledModuleLabels.length})</p>
              <p className="text-xs text-muted-foreground">
                These are active for the selected tenant.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {enabledModuleLabels.length === 0 ? (
                  <span className="text-xs text-muted-foreground">None enabled yet.</span>
                ) : (
                  enabledModuleLabels.map((label) => (
                    <span key={label} className="rounded-full bg-white px-2.5 py-1 text-xs text-emerald-800">
                      {label}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Module bundles</p>
                <p className="text-xs text-muted-foreground">
                  Apply a preset, then adjust individual modules as needed.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {MODULE_BUNDLES.map((bundle) => (
                  <button
                    key={bundle.id}
                    type="button"
                    onClick={() => applyModuleBundle(bundle)}
                    className="rounded-lg border border-border/60 bg-white/80 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <p className="text-sm font-medium text-foreground">{bundle.label}</p>
                    <p className="text-xs text-muted-foreground">{bundle.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modulePermissions.map((module) => (
                <label key={module.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/80 p-3">
                  <input
                    type="checkbox"
                    checked={module.enabled}
                    onChange={() => toggleModule(module.id)}
                  />
                  <span>{module.label}</span>
                </label>
              ))}
            </div>
            <Button onClick={handleSaveModules} disabled={!selectedTenantId}>
              Save Module Access
            </Button>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card id="seed-data" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Seed Tenant Data</CardTitle>
            <CardDescription>
              Generate mock inventory, accounts, processing, dispatch, sales, curing, quality, receivables, and billing records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSeedMockData} disabled={!selectedTenantId || isSeeding}>
              {isSeeding ? "Seeding..." : "Seed Mock Data"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Use this for demo tenants. Reseeding replaces existing tenant transaction data. HoneyFarm is intentionally blocked.
            </p>
          </CardContent>
        </Card>
      )}

      <Card id="tenant-users" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Tenant Users</CardTitle>
          <CardDescription>
            {selectedTenant
              ? `Users for ${selectedTenant.name}`
              : isOwner
                ? "Select a tenant"
                : "Users for your estate"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreateUser} disabled={!selectedTenantId}>
            Create User
          </Button>
          <p className="text-xs text-muted-foreground">System accounts are read-only and cannot be edited.</p>

          <div className="rounded-md border border-border/60 bg-white/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No users found for this tenant.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const isOwnerUser = u.role === "owner"
                    const isSystemUser =
                      String(u.username || "").toLowerCase() === "system" ||
                      String(u.username || "").toLowerCase().startsWith("system_") ||
                      String(u.username || "").toLowerCase().startsWith("system-")
                    return (
                      <TableRow key={u.id}>
                        <TableCell>{u.username}</TableCell>
                        <TableCell>
                          {isOwnerUser ? (
                            <div className="text-sm font-medium text-emerald-700">{roleLabel(u.role)}</div>
                          ) : isSystemUser ? (
                            <div className="text-sm font-medium text-foreground">System Admin</div>
                          ) : (
                            <Select
                              value={userRoleDrafts[u.id] || u.role}
                              onValueChange={(value) => handleRoleDraftChange(u.id, value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {isOwnerUser && (
                            <p className="mt-1 text-xs text-muted-foreground">Platform Owner role cannot be modified.</p>
                          )}
                          {isSystemUser && (
                            <p className="mt-1 text-xs text-muted-foreground">System user is read-only.</p>
                          )}
                        </TableCell>
                        <TableCell>{formatDateOnly(u.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveUserRole(u)}
                              disabled={
                                isOwnerUser ||
                                isSystemUser ||
                                isUpdatingUserId === u.id ||
                                (userRoleDrafts[u.id] || u.role) === u.role
                              }
                            >
                              {isUpdatingUserId === u.id ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleResetUserPassword(u)}
                              disabled={isOwnerUser || isSystemUser || isResettingPasswordUserId === u.id}
                            >
                              {isResettingPasswordUserId === u.id ? "Resetting..." : "Reset Password"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteUser(u)}
                              disabled={isOwnerUser || isSystemUser || isDeletingUserId === u.id}
                            >
                              {isDeletingUserId === u.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card id="user-module-overrides" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>User Module Overrides</CardTitle>
          <CardDescription>
            Override tenant defaults for a single user. Data remains shared within the estate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select User</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={!selectedTenantId || users.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={users.length ? "Choose a user" : "No users available"} />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username} ({roleLabel(u.role)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {userModuleSource
                ? `Source: ${userModuleSource === "user" ? "User override" : userModuleSource === "tenant" ? "Tenant defaults" : "System defaults"}`
                : "Source: System defaults"}
            </p>
            <p className="text-xs text-muted-foreground">
              Enabled for selected user: {userModulePermissions.filter((module) => module.enabled).length}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {userModulePermissions.map((module) => (
              <label key={module.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/80 p-3">
                <input
                  type="checkbox"
                  checked={module.enabled}
                  onChange={() => toggleUserModule(module.id)}
                  disabled={isUserModulesLoading}
                />
                <span>{module.label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSaveUserModules} disabled={!selectedUserId || isUserModulesLoading || isSavingUserModules}>
              {isSavingUserModules ? "Saving..." : "Save User Access"}
            </Button>
            <Button variant="outline" onClick={handleResetUserModules} disabled={!selectedUserId || isUserModulesLoading}>
              Reset to Tenant Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {isOwner && (
        <Card id="audit-log" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Track who changed what for the selected tenant.</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-1">
                  <Label>Filter</Label>
                  <Select value={auditEntityType} onValueChange={setAuditEntityType}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIT_ENTITY_TYPES.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => selectedTenantId && loadAuditLogs(selectedTenantId, auditEntityType)}
                  disabled={!selectedTenantId || isAuditLoading}
                >
                  {isAuditLoading ? "Loading..." : "Refresh"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Showing {auditLogs.length} of {auditTotalCount} recent events.
            </p>
            {isAuditLoading ? (
              <div className="text-sm text-muted-foreground">Loading audit log...</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No audit events yet.</div>
            ) : (
              <div className="rounded-md border border-border/60 bg-white/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatAuditTimestamp(log.created_at)}</TableCell>
                        <TableCell>
                          {log.username}
                          <span className="text-xs text-muted-foreground"> ({roleLabel(log.role)})</span>
                        </TableCell>
                        <TableCell className="capitalize">{log.action}</TableCell>
                        <TableCell>{log.entity_type}</TableCell>
                        <TableCell>{log.entity_id || "-"}</TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer text-xs text-emerald-600">View</summary>
                            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                              <div>
                                <span className="font-semibold text-foreground">Before</span>
                                <pre className="mt-1 whitespace-pre-wrap">{formatAuditPayload(log.before_data)}</pre>
                              </div>
                              <div>
                                <span className="font-semibold text-foreground">After</span>
                                <pre className="mt-1 whitespace-pre-wrap">{formatAuditPayload(log.after_data)}</pre>
                              </div>
                            </div>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
