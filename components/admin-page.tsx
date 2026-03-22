"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import {
  DEFAULT_TENANT_PLAN_ID,
  MODULES,
  MODULE_BUNDLES,
  clampRequestedModuleStatesToPlan,
  normalizeTenantPlanId,
  type ModuleBundle,
} from "@/lib/modules"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"
import { formatDateForDisplay } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"
import { roleLabel } from "@/lib/roles"
import {
  type AuditLog,
  type ModulePermission,
  type SectionLink,
  type SystemHealthCheck,
  type SystemHealthCounts,
  type SystemHealthResponse,
  type Tenant,
  type TenantProfile,
  type User,
  type WeeklyCompareMode,
  type WeeklyDeltas,
  type WeeklySummary,
  type WeeklySummaryRange,
  type WeeklySummaryResponse,
} from "@/components/admin/types"
import {
  AUDIT_ENTITY_TYPES,
  DEFAULT_WEEKLY_END,
  DEFAULT_WEEKLY_START,
  buildWeeklySummaryText,
  formatCount,
} from "@/components/admin/utils"
import { ConsoleOverviewSection } from "@/components/admin/console-overview-section"
import { SystemHealthSection } from "@/components/admin/system-health-section"
import {
  SeedDataSection,
  TenantModulesSection,
  TenantProfileSection,
  TenantsSection,
} from "@/components/admin/tenant-operations-sections"
import { WeeklySummarySection } from "@/components/admin/weekly-summary-section"
import {
  AuditLogSection,
  TenantUsersSection,
  UserModuleOverridesSection,
} from "@/components/admin/user-access-sections"

export default function AdminPage() {
  const { user, isOwner } = useAuth()
  const { toast } = useToast()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string>("")
  const [previewRole, setPreviewRole] = useState<"admin" | "user">("admin")
  const [newTenantName, setNewTenantName] = useState("")
  const [newTenantPlanId, setNewTenantPlanId] = useState<string>(DEFAULT_TENANT_PLAN_ID)
  const [tenantNameDraft, setTenantNameDraft] = useState("")
  const [isSavingTenantName, setIsSavingTenantName] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("user")
  const [userNameDrafts, setUserNameDrafts] = useState<Record<string, string>>({})

  const [modulePermissions, setModulePermissions] = useState<ModulePermission[]>([])
  const [tenantPlanId, setTenantPlanId] = useState<string>(DEFAULT_TENANT_PLAN_ID)
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
  const [weeklyCompareMode, setWeeklyCompareMode] = useState<WeeklyCompareMode>("previous")
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(false)
  const [isSendingWeeklyWhatsApp, setIsSendingWeeklyWhatsApp] = useState(false)
  const [systemHealth, setSystemHealth] = useState<SystemHealthResponse | null>(null)
  const [isSystemHealthLoading, setIsSystemHealthLoading] = useState(false)
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null)

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

  useEffect(() => {
    setTenantNameDraft(selectedTenant?.name || "")
  }, [selectedTenant?.id, selectedTenant?.name])

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
      const usernameDrafts: Record<string, string> = {}
      ;(data.users || []).forEach((user: User) => {
        roleDrafts[user.id] = user.role
        usernameDrafts[user.id] = user.username
      })
      setUserRoleDrafts(roleDrafts)
      setUserNameDrafts(usernameDrafts)
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
      setTenantPlanId(normalizeTenantPlanId(data.planId))
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

  const loadSystemHealth = useCallback(async () => {
    if (!isOwner) return
    setIsSystemHealthLoading(true)
    setSystemHealthError(null)
    try {
      const response = await fetch("/api/admin/system-health")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load system health")
      }
      setSystemHealth({
        generatedAt: String(data.generatedAt || ""),
        checks: Array.isArray(data.checks) ? data.checks : [],
      })
    } catch (error: any) {
      setSystemHealth(null)
      const message = error.message || "Failed to load system health"
      setSystemHealthError(message)
      toast({ title: "System health unavailable", description: message, variant: "destructive" })
    } finally {
      setIsSystemHealthLoading(false)
    }
  }, [isOwner, toast])

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
    const head = doc.head
    const body = doc.body
    if (!head || !body) {
      toast({ title: "Print failed", description: "Unable to prepare summary preview." })
      return
    }

    while (head.firstChild) head.removeChild(head.firstChild)
    while (body.firstChild) body.removeChild(body.firstChild)

    doc.title = "Weekly Summary"
    const styleEl = doc.createElement("style")
    styleEl.textContent = `
      body { font-family: Arial, sans-serif; padding: 24px; }
      h1 { font-size: 18px; margin-bottom: 12px; }
      pre { white-space: pre-wrap; font-size: 14px; }
    `
    head.appendChild(styleEl)

    const titleEl = doc.createElement("h1")
    titleEl.id = "summary-title"
    const rangeLabel = payload.range ? `${payload.range.startDate} to ${payload.range.endDate}` : "Current period"
    titleEl.textContent = `${tenantName} Weekly Summary (${rangeLabel})`

    const bodyEl = doc.createElement("pre")
    bodyEl.id = "summary-body"
    bodyEl.textContent = summaryText

    body.appendChild(titleEl)
    body.appendChild(bodyEl)
    summaryWindow.focus()
    summaryWindow.print()
  }

  const handleSendWeeklySummaryWhatsApp = async () => {
    if (!selectedTenantId) return

    let textToSend = weeklySummaryText
    if (!textToSend) {
      const payload = await loadWeeklySummary()
      if (!payload) return
      textToSend = buildWeeklySummaryText(
        payload.summary,
        selectedTenant?.name || "Tenant",
        payload.range,
        payload.compareSummary,
        payload.compareRange,
      )
    }

    setIsSendingWeeklyWhatsApp(true)
    try {
      const response = await fetch("/api/admin/weekly-summary/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          message: textToSend,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to send WhatsApp summary")
      }

      const recipients = Array.isArray(data.notification?.recipients) ? data.notification.recipients : []
      const sentCount = recipients.filter((item: any) => item?.sent).length
      toast({
        title: "WhatsApp summary sent",
        description: sentCount > 0 ? `Delivered to ${sentCount} recipient(s).` : "No deliveries were confirmed.",
      })
    } catch (error: any) {
      toast({
        title: "WhatsApp send failed",
        description: error.message || "Unable to send WhatsApp summary.",
        variant: "destructive",
      })
    } finally {
      setIsSendingWeeklyWhatsApp(false)
    }
  }

  useEffect(() => {
    if (isOwner) {
      loadTenants()
    }
  }, [isOwner, loadTenants])

  useEffect(() => {
    if (!isOwner) {
      setSystemHealth(null)
      setSystemHealthError(null)
      return
    }
    loadSystemHealth()
  }, [isOwner, loadSystemHealth])

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
        body: JSON.stringify({ name: newTenantName.trim(), planId: newTenantPlanId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create tenant")
      }
      setNewTenantName("")
      setNewTenantPlanId(DEFAULT_TENANT_PLAN_ID)
      await loadTenants()
      toast({ title: "Tenant created", description: `${data.tenant.name} is ready.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create tenant", variant: "destructive" })
    }
  }

  const handleSaveTenantName = async () => {
    if (!isOwner) {
      toast({ title: "Platform owner only", description: "Only platform owners can rename tenants." })
      return
    }
    if (!selectedTenantId || !selectedTenant) {
      toast({ title: "Pick a tenant", description: "Select a tenant before editing its estate name." })
      return
    }

    const nextName = tenantNameDraft.trim()
    if (!nextName) {
      toast({ title: "Missing name", description: "Estate name cannot be empty.", variant: "destructive" })
      return
    }
    if (nextName === selectedTenant.name) {
      return
    }

    setIsSavingTenantName(true)
    try {
      const response = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId, name: nextName }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update tenant name")
      }

      setTenants((prev) => prev.map((tenant) => (tenant.id === selectedTenantId ? { ...tenant, name: data.tenant.name } : tenant)))
      setTenantNameDraft(String(data.tenant?.name || nextName))
      toast({ title: "Estate name updated", description: `${data.tenant.name} saved.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update tenant name", variant: "destructive" })
    } finally {
      setIsSavingTenantName(false)
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
        const blockingSummary = Array.isArray(data?.blockingDependencies)
          ? data.blockingDependencies
              .slice(0, 4)
              .map((entry: any) => `${entry.label} (${entry.count})`)
              .join(", ")
          : ""
        const errorMessage =
          data?.error && blockingSummary
            ? `${data.error} ${blockingSummary}.`
            : data?.error || "Failed to delete tenant"
        throw new Error(errorMessage)
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
      prev.map((module) =>
        module.id === moduleId && !module.lockedByPlan ? { ...module, enabled: !module.enabled } : module,
      ),
    )
  }

  const applyModuleBundle = useCallback(
    (bundle: ModuleBundle) => {
      setTenantPlanId(bundle.id)
      setModulePermissions(clampRequestedModuleStatesToPlan(
        MODULES.map((module) => ({
          id: module.id,
          enabled: bundle.modules.includes(module.id),
        })),
        bundle.id,
      ))
      toast({
        title: `${bundle.label} applied`,
        description: "Review the unlocked modules below and save to confirm tenant access.",
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
        body: JSON.stringify({ tenantId: selectedTenantId, planId: tenantPlanId, modules: modulePermissions }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update modules")
      }
      setModulePermissions(data.modules || [])
      setTenantPlanId(normalizeTenantPlanId(data.planId))
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

  const handleUsernameDraftChange = (userId: string, username: string) => {
    setUserNameDrafts((prev) => ({ ...prev, [userId]: username }))
  }

  const handleSaveUserDetails = async (user: User) => {
    const nextRole = userRoleDrafts[user.id] || user.role
    const nextUsername = String(userNameDrafts[user.id] ?? user.username).trim()
    if (!nextUsername) {
      toast({ title: "Missing username", description: "Username cannot be empty.", variant: "destructive" })
      return
    }
    if (nextRole === user.role && nextUsername === user.username) {
      return
    }

    setIsUpdatingUserId(user.id)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: nextRole, username: nextUsername }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update user")
      }
      toast({
        title: "User updated",
        description: `${data.user.username} saved as ${roleLabel(data.user.role)}.`,
      })
      await loadUsers(selectedTenantId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" })
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
  const selectedUser = users.find((u) => u.id === selectedUserId) || null
  const isSelectedUserRoleScoped = selectedUser?.role === "user"
  const systemHealthGeneratedLabel = systemHealth?.generatedAt ? formatDateForDisplay(systemHealth.generatedAt) : null
  const systemHealthCounts = useMemo<SystemHealthCounts>(() => {
    const counts: SystemHealthCounts = { healthy: 0, warning: 0, critical: 0, unknown: 0 }
    ;(systemHealth?.checks || []).forEach((check) => {
      if (check.status === "critical") counts.critical += 1
      else if (check.status === "warning") counts.warning += 1
      else if (check.status === "healthy") counts.healthy += 1
      else counts.unknown += 1
    })
    return counts
  }, [systemHealth?.checks])
  const sortedSystemChecks = useMemo(() => {
    const rank: Record<SystemHealthCheck["status"], number> = {
      critical: 3,
      warning: 2,
      unknown: 1,
      healthy: 0,
    }
    return [...(systemHealth?.checks || [])].sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0))
  }, [systemHealth?.checks])
  const ownerSectionLinks: SectionLink[] = [
    { id: "tenant-users", label: "Users" },
    { id: "user-module-overrides", label: "User Access" },
  ]
  if (isOwner) {
    ownerSectionLinks.unshift(
      { id: "tenants", label: "Tenants" },
      { id: "weekly-summary", label: "Weekly KPI" },
      { id: "system-health", label: "System Health" },
      { id: "tenant-profile", label: "Profile" },
      { id: "tenant-modules", label: "Modules" },
      { id: "seed-data", label: "Seed Data" },
      { id: "audit-log", label: "Audit" },
    )
  }

  return (
    <div className="space-y-6">
      <ConsoleOverviewSection
        isOwner={isOwner}
        selectedTenant={selectedTenant}
        selectedTenantId={selectedTenantId}
        previewRole={previewRole}
        usersCount={users.length}
        enabledModuleCount={enabledModuleCount}
        tenantsCount={tenants.length}
        auditTotalCount={auditTotalCount}
        ownerSectionLinks={ownerSectionLinks}
        onOpenTenantPreview={handleOpenTenantPreview}
      />

      {isOwner ? (
        <SystemHealthSection
          systemHealthGeneratedLabel={systemHealthGeneratedLabel}
          isSystemHealthLoading={isSystemHealthLoading}
          systemHealth={systemHealth}
          systemHealthError={systemHealthError}
          systemHealthCounts={systemHealthCounts}
          sortedSystemChecks={sortedSystemChecks}
          onRefresh={loadSystemHealth}
        />
      ) : null}

      {isOwner ? (
        <TenantsSection
          tenants={tenants}
          selectedTenant={selectedTenant}
          selectedTenantId={selectedTenantId}
          currentUserTenantId={user?.tenantId}
          newTenantName={newTenantName}
          newTenantPlanId={newTenantPlanId}
          tenantNameDraft={tenantNameDraft}
          previewRole={previewRole}
          isDeletingTenantId={isDeletingTenantId}
          isSavingTenantName={isSavingTenantName}
          onNewTenantNameChange={setNewTenantName}
          onNewTenantPlanIdChange={setNewTenantPlanId}
          onCreateTenant={handleCreateTenant}
          onSelectedTenantIdChange={setSelectedTenantId}
          onTenantNameDraftChange={setTenantNameDraft}
          onPreviewRoleChange={setPreviewRole}
          onSaveTenantName={() => {
            void handleSaveTenantName()
          }}
          onOpenTenantPreview={handleOpenTenantPreview}
          onDeleteTenant={handleDeleteTenant}
        />
      ) : null}

      {isOwner ? (
        <WeeklySummarySection
          selectedTenantId={selectedTenantId}
          weeklyStartDate={weeklyStartDate}
          weeklyEndDate={weeklyEndDate}
          weeklyCompareMode={weeklyCompareMode}
          weeklyRangeLabel={weeklyRangeLabel}
          weeklyCompareLabel={weeklyCompareLabel}
          weeklySummary={weeklySummary}
          weeklyPeriodLabel={weeklyPeriodLabel}
          weeklyDeltas={weeklyDeltas}
          isWeeklyLoading={isWeeklyLoading}
          isSendingWeeklyWhatsApp={isSendingWeeklyWhatsApp}
          onWeeklyStartDateChange={(value) => {
            setWeeklyStartDate(value)
            setWeeklySummary(null)
            setWeeklyCompareSummary(null)
            setWeeklySummaryRange(null)
            setWeeklyCompareRange(null)
          }}
          onWeeklyEndDateChange={(value) => {
            setWeeklyEndDate(value)
            setWeeklySummary(null)
            setWeeklyCompareSummary(null)
            setWeeklySummaryRange(null)
            setWeeklyCompareRange(null)
          }}
          onWeeklyCompareModeChange={(value) => {
            setWeeklyCompareMode(value)
            setWeeklySummary(null)
            setWeeklyCompareSummary(null)
            setWeeklySummaryRange(null)
            setWeeklyCompareRange(null)
          }}
          onLoadWeeklySummary={() => {
            void loadWeeklySummary()
          }}
          onCopyWeeklySummary={() => {
            void handleCopyWeeklySummary()
          }}
          onSendWeeklySummaryWhatsApp={() => {
            void handleSendWeeklySummaryWhatsApp()
          }}
          onDownloadWeeklySummary={() => {
            void handleDownloadWeeklySummary()
          }}
        />
      ) : null}

      {isOwner ? (
        <TenantProfileSection
          selectedTenantId={selectedTenantId}
          tenantProfileDraft={tenantProfileDraft}
          isTenantProfileLoading={isTenantProfileLoading}
          isSavingTenantProfile={isSavingTenantProfile}
          onUiVariantChange={(value) =>
            setTenantProfileDraft((prev) => ({
              ...prev,
              uiVariant: value,
            }))
          }
          onFeatureFlagChange={(flagId, enabled) =>
            setTenantProfileDraft((prev) => ({
              ...prev,
              featureFlags: {
                ...prev.featureFlags,
                [flagId]: enabled,
              },
            }))
          }
          onSaveTenantProfile={() => {
            void handleSaveTenantProfile()
          }}
        />
      ) : null}

      {isOwner ? (
        <TenantModulesSection
          modulePermissions={modulePermissions}
          enabledModuleLabels={enabledModuleLabels}
          selectedTenantId={selectedTenantId}
          tenantPlanId={tenantPlanId}
          onApplyModuleBundle={(bundleId) => {
            const bundle = MODULE_BUNDLES.find((entry) => entry.id === bundleId)
            if (bundle) {
              applyModuleBundle(bundle)
            }
          }}
          onToggleModule={toggleModule}
          onSaveModules={() => {
            void handleSaveModules()
          }}
        />
      ) : null}

      {isOwner ? (
        <SeedDataSection
          selectedTenantId={selectedTenantId}
          isSeeding={isSeeding}
          onSeedMockData={() => {
            void handleSeedMockData()
          }}
        />
      ) : null}

      <TenantUsersSection
        selectedTenant={selectedTenant}
        isOwner={isOwner}
        selectedTenantId={selectedTenantId}
        newUsername={newUsername}
        newPassword={newPassword}
        newRole={newRole}
        users={users}
        userNameDrafts={userNameDrafts}
        userRoleDrafts={userRoleDrafts}
        isUpdatingUserId={isUpdatingUserId}
        isDeletingUserId={isDeletingUserId}
        isResettingPasswordUserId={isResettingPasswordUserId}
        onNewUsernameChange={setNewUsername}
        onNewPasswordChange={setNewPassword}
        onNewRoleChange={setNewRole}
        onCreateUser={() => {
          void handleCreateUser()
        }}
        onUsernameDraftChange={handleUsernameDraftChange}
        onRoleDraftChange={handleRoleDraftChange}
        onSaveUserDetails={(nextUser) => {
          void handleSaveUserDetails(nextUser)
        }}
        onResetUserPassword={(nextUser) => {
          void handleResetUserPassword(nextUser)
        }}
        onDeleteUser={(nextUser) => {
          void handleDeleteUser(nextUser)
        }}
      />

      <UserModuleOverridesSection
        selectedTenantId={selectedTenantId}
        users={users}
        selectedUserId={selectedUserId}
        userModulePermissions={userModulePermissions}
        userModuleSource={userModuleSource}
        isUserModulesLoading={isUserModulesLoading}
        isSavingUserModules={isSavingUserModules}
        isSelectedUserRoleScoped={Boolean(isSelectedUserRoleScoped)}
        onSelectedUserIdChange={setSelectedUserId}
        onToggleUserModule={toggleUserModule}
        onSaveUserModules={() => {
          void handleSaveUserModules()
        }}
        onResetUserModules={() => {
          void handleResetUserModules()
        }}
      />

      {isOwner ? (
        <AuditLogSection
          selectedTenantId={selectedTenantId}
          auditEntityType={auditEntityType}
          auditLogs={auditLogs}
          auditTotalCount={auditTotalCount}
          isAuditLoading={isAuditLoading}
          auditEntityTypes={AUDIT_ENTITY_TYPES}
          onAuditEntityTypeChange={setAuditEntityType}
          onRefreshAuditLogs={() => {
            if (selectedTenantId) {
              void loadAuditLogs(selectedTenantId, auditEntityType)
            }
          }}
        />
      ) : null}
    </div>
  )
}
