"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { AlertThresholds, useTenantSettings } from "@/hooks/use-tenant-settings"
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
import { roleLabel } from "@/lib/roles"
import { ArrowLeft, Info } from "lucide-react"

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

interface LocationRow {
  id: string
  name: string
  code: string
}

const AUDIT_ENTITY_TYPES = [
  { id: "all", label: "All modules" },
  { id: "processing_records", label: "Processing" },
  { id: "dispatch_records", label: "Dispatch" },
  { id: "sales_records", label: "Sales" },
  { id: "transaction_history", label: "Inventory" },
  { id: "labor_transactions", label: "Labor" },
  { id: "expense_transactions", label: "Expenses" },
]

const formatAuditTimestamp = (value: string) => {
  return formatDateForDisplay(value)
}

const formatAuditPayload = (payload: any) => {
  if (!payload) return "None"
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export default function TenantSettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { settings, updateSettings, loading: settingsLoading } = useTenantSettings()
  const tenantId = user?.tenantId || ""

  const [estateNameInput, setEstateNameInput] = useState("")
  const [isSavingEstateName, setIsSavingEstateName] = useState(false)
  const [thresholdDraft, setThresholdDraft] = useState<AlertThresholds | null>(null)
  const [isSavingThresholds, setIsSavingThresholds] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("user")
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({})
  const [isUpdatingUserId, setIsUpdatingUserId] = useState<string | null>(null)
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null)

  const [modulePermissions, setModulePermissions] = useState<ModulePermission[]>([])
  const [isSavingModules, setIsSavingModules] = useState(false)
  const [uiPreferencesDraft, setUiPreferencesDraft] = useState({ hideEmptyMetrics: false })
  const [isSavingUiPreferences, setIsSavingUiPreferences] = useState(false)
  const [uiVariantDraft, setUiVariantDraft] = useState<TenantUiVariant>(DEFAULT_TENANT_UI_VARIANT)
  const [featureFlagsDraft, setFeatureFlagsDraft] = useState<TenantFeatureFlags>(DEFAULT_TENANT_FEATURE_FLAGS)
  const [isSavingTenantExperience, setIsSavingTenantExperience] = useState(false)

  const [selectedUserId, setSelectedUserId] = useState("")
  const [userModulePermissions, setUserModulePermissions] = useState<ModulePermission[]>([])
  const [userModuleSource, setUserModuleSource] = useState<"user" | "tenant" | "default" | "">("")
  const [isUserModulesLoading, setIsUserModulesLoading] = useState(false)
  const [isSavingUserModules, setIsSavingUserModules] = useState(false)

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotalCount, setAuditTotalCount] = useState(0)
  const [auditEntityType, setAuditEntityType] = useState("all")
  const [isAuditLoading, setIsAuditLoading] = useState(false)

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [newLocationName, setNewLocationName] = useState("")
  const [newLocationCode, setNewLocationCode] = useState("")
  const [isCreatingLocation, setIsCreatingLocation] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editingLocationName, setEditingLocationName] = useState("")
  const [editingLocationCode, setEditingLocationCode] = useState("")
  const [isUpdatingLocationId, setIsUpdatingLocationId] = useState<string | null>(null)

  const [privacyStatus, setPrivacyStatus] = useState<{
    noticeVersion: string
    acceptedAt: string | null
    consentMarketing: boolean
    consentMarketingUpdatedAt: string | null
    deletionRequestedAt: string | null
    anonymizedAt: string | null
  } | null>(null)
  const [privacyError, setPrivacyError] = useState<string | null>(null)
  const [isPrivacyLoading, setIsPrivacyLoading] = useState(false)
  const [isAcceptingNotice, setIsAcceptingNotice] = useState(false)
  const [isExportingPersonalData, setIsExportingPersonalData] = useState(false)
  const [correctionUsername, setCorrectionUsername] = useState("")
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false)
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false)
  const [isUpdatingConsent, setIsUpdatingConsent] = useState(false)

  const [mfaStatus, setMfaStatus] = useState<{ enabled: boolean; enrolledAt: string | null } | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaOtpAuth, setMfaOtpAuth] = useState<string | null>(null)
  const [mfaToken, setMfaToken] = useState("")
  const [isMfaLoading, setIsMfaLoading] = useState(false)
  const [isMfaSetupLoading, setIsMfaSetupLoading] = useState(false)
  const [isMfaVerifyLoading, setIsMfaVerifyLoading] = useState(false)
  const [isMfaDisableLoading, setIsMfaDisableLoading] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)

  const isOwner = user?.role === "owner"
  const isAdminOrOwner = user?.role === "admin" || user?.role === "owner"
  const privacyFeatureEnabled = false
  const mfaFeatureEnabled = false
  const mfaEnabled = mfaFeatureEnabled ? Boolean(mfaStatus?.enabled) : false
  const mfaVerified = mfaFeatureEnabled ? Boolean(user?.mfaVerified) : true
  const mfaGate = Boolean(isAdminOrOwner && mfaFeatureEnabled && mfaEnabled && !mfaVerified)

  useEffect(() => {
    setEstateNameInput(settings.estateName || "")
  }, [settings.estateName])

  useEffect(() => {
    setUiPreferencesDraft({
      hideEmptyMetrics: Boolean(settings.uiPreferences?.hideEmptyMetrics),
    })
  }, [settings.uiPreferences?.hideEmptyMetrics])

  useEffect(() => {
    setUiVariantDraft(settings.uiVariant || DEFAULT_TENANT_UI_VARIANT)
  }, [settings.uiVariant])

  useEffect(() => {
    setFeatureFlagsDraft({ ...DEFAULT_TENANT_FEATURE_FLAGS, ...(settings.featureFlags || {}) })
  }, [settings.featureFlags])

  const loadPrivacyStatus = useCallback(async () => {
    if (!privacyFeatureEnabled || !tenantId) return
    setIsPrivacyLoading(true)
    setPrivacyError(null)
    try {
      const response = await fetch("/api/privacy/notice-status")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load privacy status")
      }
      setPrivacyStatus(data.status)
    } catch (error: any) {
      setPrivacyError(error.message || "Failed to load privacy status")
    } finally {
      setIsPrivacyLoading(false)
    }
  }, [tenantId, privacyFeatureEnabled])

  useEffect(() => {
    if (!privacyFeatureEnabled) return
    loadPrivacyStatus()
  }, [loadPrivacyStatus, privacyFeatureEnabled])

  const handleAcceptNotice = async () => {
    setIsAcceptingNotice(true)
    setPrivacyError(null)
    try {
      const response = await fetch("/api/privacy/accept", { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to record notice acceptance")
      }
      await loadPrivacyStatus()
      toast({ title: "Notice accepted", description: "Your acceptance has been recorded." })
    } catch (error: any) {
      setPrivacyError(error.message || "Failed to accept notice")
    } finally {
      setIsAcceptingNotice(false)
    }
  }

  const handleExportPersonalData = async () => {
    setIsExportingPersonalData(true)
    setPrivacyError(null)
    try {
      const response = await fetch("/api/privacy/export")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to export data")
      }
      const blob = new Blob([JSON.stringify(data.payload, null, 2)], { type: "application/json" })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `farmflow-personal-data-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      window.URL.revokeObjectURL(url)
      toast({ title: "Export ready", description: "Your personal data export has been downloaded." })
    } catch (error: any) {
      setPrivacyError(error.message || "Failed to export data")
    } finally {
      setIsExportingPersonalData(false)
    }
  }

  const handleSubmitCorrection = async () => {
    if (!correctionUsername.trim()) {
      setPrivacyError("Enter the corrected username")
      return
    }
    setIsSubmittingCorrection(true)
    setPrivacyError(null)
    try {
      const response = await fetch("/api/privacy/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername: correctionUsername.trim() }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update username")
      }
      setCorrectionUsername("")
      toast({ title: "Username updated", description: "Sign in again with the new username." })
    } catch (error: any) {
      setPrivacyError(error.message || "Failed to update username")
    } finally {
      setIsSubmittingCorrection(false)
    }
  }

  const handleRequestDeletion = async () => {
    if (!window.confirm("Request deletion and anonymization of your personal data?")) return
    setIsRequestingDeletion(true)
    setPrivacyError(null)
    try {
      const response = await fetch("/api/privacy/delete", { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to request deletion")
      }
      await loadPrivacyStatus()
      toast({ title: "Deletion requested", description: "We will process this per the retention policy." })
    } catch (error: any) {
      setPrivacyError(error.message || "Failed to request deletion")
    } finally {
      setIsRequestingDeletion(false)
    }
  }

  const handleConsentToggle = async (value: boolean) => {
    setIsUpdatingConsent(true)
    setPrivacyError(null)
    try {
      const response = await fetch("/api/privacy/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: value }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update consent")
      }
      await loadPrivacyStatus()
    } catch (error: any) {
      setPrivacyError(error.message || "Failed to update consent")
    } finally {
      setIsUpdatingConsent(false)
    }
  }

  const loadMfaStatus = useCallback(async () => {
    if (!user) return
    setIsMfaLoading(true)
    setMfaError(null)
    try {
      const response = await fetch("/api/mfa/status")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load MFA status")
      }
      setMfaStatus(data.status)
    } catch (error: any) {
      setMfaError(error.message || "Failed to load MFA status")
    } finally {
      setIsMfaLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!mfaFeatureEnabled) return
    loadMfaStatus()
  }, [loadMfaStatus, mfaFeatureEnabled])

  const handleMfaSetup = async () => {
    setIsMfaSetupLoading(true)
    setMfaError(null)
    try {
      const response = await fetch("/api/mfa/setup", { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to start MFA setup")
      }
      setMfaSecret(data.secret)
      setMfaOtpAuth(data.otpauth)
    } catch (error: any) {
      setMfaError(error.message || "Failed to start MFA setup")
    } finally {
      setIsMfaSetupLoading(false)
    }
  }

  const handleMfaVerify = async () => {
    if (!mfaToken.trim()) {
      setMfaError("Enter the 6-digit MFA code")
      return
    }
    setIsMfaVerifyLoading(true)
    setMfaError(null)
    try {
      const response = await fetch("/api/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mfaToken.trim() }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to verify MFA code")
      }
      setMfaToken("")
      setMfaSecret(null)
      setMfaOtpAuth(null)
      await loadMfaStatus()
      toast({ title: "MFA enabled", description: "Admin actions now require MFA." })
    } catch (error: any) {
      setMfaError(error.message || "Failed to verify MFA code")
    } finally {
      setIsMfaVerifyLoading(false)
    }
  }

  const handleMfaDisable = async () => {
    if (!mfaToken.trim()) {
      setMfaError("Enter the 6-digit MFA code")
      return
    }
    setIsMfaDisableLoading(true)
    setMfaError(null)
    try {
      const response = await fetch("/api/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mfaToken.trim() }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to disable MFA")
      }
      setMfaToken("")
      await loadMfaStatus()
      toast({ title: "MFA disabled", description: "Admin actions will be blocked until MFA is re-enabled." })
    } catch (error: any) {
      setMfaError(error.message || "Failed to disable MFA")
    } finally {
      setIsMfaDisableLoading(false)
    }
  }

  useEffect(() => {
    if (settings.alertThresholds) {
      setThresholdDraft(settings.alertThresholds)
    }
  }, [settings.alertThresholds])

  const loadUsers = useCallback(async () => {
    if (!tenantId || mfaGate) return
    try {
      const response = await fetch(`/api/admin/users?tenantId=${tenantId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load users")
      }
      setUsers(data.users || [])
      const drafts: Record<string, string> = {}
      ;(data.users || []).forEach((u: User) => {
        drafts[u.id] = u.role
      })
      setUserRoleDrafts(drafts)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load users", variant: "destructive" })
    }
  }, [tenantId, toast, mfaGate])

  const loadModules = useCallback(async () => {
    if (!tenantId || mfaGate || !isOwner) return
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
  }, [isOwner, tenantId, toast, mfaGate])

  const loadUserModules = useCallback(async (userId: string) => {
    if (mfaGate) {
      return
    }
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
  }, [toast, mfaGate])

  const loadAuditLogs = useCallback(async () => {
    if (!tenantId || mfaGate || !isOwner) return
    setIsAuditLoading(true)
    try {
      const params = new URLSearchParams({ tenantId, limit: "50" })
      if (auditEntityType && auditEntityType !== "all") {
        params.set("entityType", auditEntityType)
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
  }, [auditEntityType, isOwner, tenantId, toast, mfaGate])

  const loadLocations = useCallback(async () => {
    if (!tenantId) return
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load locations")
      }
      setLocations(data.locations || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load locations", variant: "destructive" })
    }
  }, [tenantId, toast])

  useEffect(() => {
    if (!tenantId) return
    if (!mfaGate) {
      loadUsers()
      if (isOwner) {
        loadModules()
        loadAuditLogs()
      }
    }
    loadLocations()
  }, [tenantId, loadAuditLogs, loadLocations, loadModules, loadUsers, mfaGate, isOwner])

  useEffect(() => {
    if (tenantId && !mfaGate && isOwner) {
      loadAuditLogs()
    }
  }, [auditEntityType, tenantId, loadAuditLogs, mfaGate, isOwner])

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId("")
      return
    }
    if (!selectedUserId || !users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(users[0].id)
    }
  }, [users, selectedUserId])

  useEffect(() => {
    if (mfaGate) {
      return
    }
    if (!isAdminOrOwner) {
      return
    }
    if (selectedUserId) {
      loadUserModules(selectedUserId)
      return
    }
    setUserModulePermissions(MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })))
    setUserModuleSource("default")
  }, [selectedUserId, loadUserModules, mfaGate, isAdminOrOwner])

  const handleCreateUser = async () => {
    if (mfaGate) {
      toast({
        title: "MFA required",
        description: "Sign out and sign back in with your MFA code to manage users.",
        variant: "destructive",
      })
      return
    }
    if (!tenantId) {
      toast({ title: "Tenant missing", description: "Tenant context not available." })
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
          tenantId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create user")
      }
      setNewUsername("")
      setNewPassword("")
      setNewRole("user")
      await loadUsers()
      toast({ title: "User created", description: `${data.user.username} added.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create user", variant: "destructive" })
    }
  }

  const handleRoleDraftChange = (userId: string, role: string) => {
    setUserRoleDrafts((prev) => ({ ...prev, [userId]: role }))
  }

  const handleSaveUserRole = async (user: User) => {
    if (mfaGate) {
      toast({
        title: "MFA required",
        description: "Sign out and sign back in with your MFA code to update roles.",
        variant: "destructive",
      })
      return
    }
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
      await loadUsers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update user role", variant: "destructive" })
    } finally {
      setIsUpdatingUserId(null)
    }
  }

  const handleDeleteUser = async (user: User) => {
    if (mfaGate) {
      toast({
        title: "MFA required",
        description: "Sign out and sign back in with your MFA code to delete users.",
        variant: "destructive",
      })
      return
    }
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
      await loadUsers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" })
    } finally {
      setIsDeletingUserId(null)
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
    if (mfaGate) {
      toast({
        title: "MFA required",
        description: "Sign out and sign back in with your MFA code to update tenant modules.",
        variant: "destructive",
      })
      return
    }
    if (!tenantId) return
    setIsSavingModules(true)
    try {
      const response = await fetch("/api/admin/tenant-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, modules: modulePermissions }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update modules")
      }
      toast({ title: "Modules updated", description: "Tenant module access saved." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update modules", variant: "destructive" })
    } finally {
      setIsSavingModules(false)
    }
  }

  const handleSaveUiPreferences = async () => {
    setIsSavingUiPreferences(true)
    try {
      await updateSettings({ uiPreferences: { hideEmptyMetrics: uiPreferencesDraft.hideEmptyMetrics } })
      toast({ title: "Preferences updated", description: "Dashboard display preferences saved." })
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Unable to update preferences.",
        variant: "destructive",
      })
    } finally {
      setIsSavingUiPreferences(false)
    }
  }

  const handleSaveTenantExperience = async () => {
    setIsSavingTenantExperience(true)
    try {
      await updateSettings({
        uiVariant: uiVariantDraft,
        featureFlags: featureFlagsDraft,
      })
      toast({
        title: "Experience profile updated",
        description: "Tenant variant and feature flags were saved.",
      })
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Unable to update tenant experience profile.",
        variant: "destructive",
      })
    } finally {
      setIsSavingTenantExperience(false)
    }
  }

  const handleSaveUserModules = async () => {
    if (mfaGate) {
      toast({
        title: "MFA required",
        description: "Sign out and sign back in with your MFA code to update user modules.",
        variant: "destructive",
      })
      return
    }
    if (!selectedUserId) return
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

  const handleResetUserModules = async () => {
    if (mfaGate) {
      toast({
        title: "MFA required",
        description: "Sign out and sign back in with your MFA code to reset user modules.",
        variant: "destructive",
      })
      return
    }
    if (!selectedUserId) return
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

  const handleCreateLocation = async () => {
    if (!tenantId) return
    if (!newLocationName.trim()) {
      toast({ title: "Missing name", description: "Location name is required." })
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
          tenantId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create location")
      }
      setNewLocationName("")
      setNewLocationCode("")
      await loadLocations()
      toast({ title: "Location created", description: `${data.location.name} added.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create location", variant: "destructive" })
    } finally {
      setIsCreatingLocation(false)
    }
  }

  const startEditLocation = (location: LocationRow) => {
    setEditingLocationId(location.id)
    setEditingLocationName(location.name)
    setEditingLocationCode(location.code)
  }

  const cancelEditLocation = () => {
    setEditingLocationId(null)
    setEditingLocationName("")
    setEditingLocationCode("")
  }

  const handleUpdateLocation = async () => {
    if (!editingLocationId) return
    if (!editingLocationName.trim()) {
      toast({ title: "Missing name", description: "Location name is required." })
      return
    }
    setIsUpdatingLocationId(editingLocationId)
    try {
      const response = await fetch("/api/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingLocationId,
          name: editingLocationName.trim(),
          code: editingLocationCode.trim() || undefined,
          tenantId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update location")
      }
      await loadLocations()
      cancelEditLocation()
      toast({ title: "Location updated", description: `${data.location.name} saved.` })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update location", variant: "destructive" })
    } finally {
      setIsUpdatingLocationId(null)
    }
  }

  const handleSaveEstateName = async () => {
    if (!estateNameInput.trim()) {
      toast({ title: "Estate name required", description: "Please enter a name for this estate." })
      return
    }
    setIsSavingEstateName(true)
    try {
      await updateSettings({ estateName: estateNameInput.trim() })
      toast({ title: "Estate updated", description: "Estate name saved." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update estate name", variant: "destructive" })
    } finally {
      setIsSavingEstateName(false)
    }
  }

  const updateThresholdField = (field: keyof AlertThresholds, value: string) => {
    if (!thresholdDraft) return
    const nextValue = Number(value)
    setThresholdDraft({
      ...thresholdDraft,
      [field]: Number.isFinite(nextValue) ? nextValue : thresholdDraft[field],
    })
  }

  const updateTargetField = (field: keyof NonNullable<AlertThresholds["targets"]>, value: string) => {
    if (!thresholdDraft) return
    if (value.trim() === "") {
      const targets = { ...(thresholdDraft.targets || {}), [field]: null }
      setThresholdDraft({ ...thresholdDraft, targets })
      return
    }
    const nextValue = Number(value)
    const targets = {
      ...(thresholdDraft.targets || {}),
      [field]: Number.isFinite(nextValue) ? nextValue : null,
    }
    setThresholdDraft({ ...thresholdDraft, targets })
  }

  const handleSaveThresholds = async () => {
    if (!thresholdDraft) return
    setIsSavingThresholds(true)
    try {
      await updateSettings({ alertThresholds: thresholdDraft })
      toast({ title: "Thresholds updated", description: "Exception alerts will use these settings." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update thresholds", variant: "destructive" })
    } finally {
      setIsSavingThresholds(false)
    }
  }

  const enabledTenantModuleCount = modulePermissions.filter((module) => module.enabled).length
  const enabledUserModuleCount = userModulePermissions.filter((module) => module.enabled).length
  const selectedUser = users.find((u) => u.id === selectedUserId) || null
  const isSelectedUserRoleScoped = selectedUser?.role === "user"
  const sectionLinks: Array<{ id: string; label: string }> = [
    { id: "estate-identity", label: "Estate" },
    { id: "display-preferences", label: "Display" },
    { id: "tenant-experience", label: "Experience" },
    { id: "data-import", label: "Import" },
    { id: "thresholds", label: "Thresholds" },
    { id: "locations", label: "Locations" },
    { id: "tenant-users", label: "Users" },
  ]
  if (isOwner) {
    sectionLinks.push({ id: "tenant-modules", label: "Modules" })
    sectionLinks.push({ id: "user-module-overrides", label: "User Access" })
    sectionLinks.push({ id: "audit-log", label: "Audit" })
  }
  if (mfaFeatureEnabled && isAdminOrOwner) {
    sectionLinks.push({ id: "admin-security", label: "Security" })
  }
  if (privacyFeatureEnabled) {
    sectionLinks.push({ id: "privacy-dpdp", label: "Privacy" })
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-start">
        <Button asChild variant="outline" size="sm" className="bg-white/80">
          <Link href="/dashboard" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
      <Card
        id="settings-overview"
        className="scroll-mt-24 border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50"
      >
        <CardHeader>
          <CardTitle className="flex items-baseline gap-3">
            Tenant Settings
            <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">FarmFlow</span>
          </CardTitle>
          <CardDescription>Manage users, access, locations, thresholds, and tenant behavior in one place.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Tenant ID</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{tenantId || "Unavailable"}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Users</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{users.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Locations</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{locations.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">
                {isOwner ? "Modules Enabled" : "Your Role"}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {isOwner ? enabledTenantModuleCount : roleLabel(user?.role || "user")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quick jump</p>
            <div className="flex flex-wrap gap-2">
              {sectionLinks.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-full border border-border/70 bg-white/90 px-3 py-1 text-xs text-foreground transition hover:border-emerald-200 hover:text-emerald-700"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {user?.role === "owner" && (
        <Card id="owner-tools" className="scroll-mt-24 border-emerald-200/70 bg-emerald-50/60">
          <CardHeader>
            <CardTitle>Platform Owner Tools</CardTitle>
            <CardDescription>Tenant management and platform controls now live in a dedicated owner view.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-emerald-900">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="bg-white/80">
                <Link href="/admin/tenants">Open Owner Console</Link>
              </Button>
              <Button asChild variant="outline" className="bg-white/80">
                <Link href="/admin/inspect-databases">Inspect Databases</Link>
              </Button>
            </div>
            <p className="text-xs text-emerald-800">
              Estate settings remain on this page. Platform-level controls are separated under the owner console.
            </p>
          </CardContent>
        </Card>
      )}

      {mfaGate && (
        <Card className="border-amber-200/70 bg-amber-50/70">
          <CardHeader>
            <CardTitle>MFA verification required</CardTitle>
            <CardDescription>
              MFA is enabled for your account. Sign out and sign back in with your 6-digit code to access admin settings
              like users, modules, and audit logs.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card id="estate-identity" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Estate Identity</CardTitle>
          <CardDescription>
            Set the estate name shown in the dashboard. The system name remains “FarmFlow.”
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="estate-name">Estate name</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Estate name help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>This appears on dashboards, exports, and buyer reports.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="estate-name"
                placeholder="Estate Name"
                value={estateNameInput}
                onChange={(event) => setEstateNameInput(event.target.value)}
              />
            </div>
            <Button onClick={handleSaveEstateName} disabled={isSavingEstateName || settingsLoading}>
              {isSavingEstateName ? "Saving..." : settingsLoading ? "Loading..." : "Save Estate Name"}
            </Button>
          </div>
          {settings.estateName ? (
            <p className="text-xs text-muted-foreground">Currently displayed as: {settings.estateName}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No estate name saved yet.</p>
          )}
        </CardContent>
      </Card>

      {isAdminOrOwner && (
        <Card id="display-preferences" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Dashboard Preferences</CardTitle>
            <CardDescription>Trim empty highlights for a cleaner estate view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-white/80 p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={uiPreferencesDraft.hideEmptyMetrics}
                onChange={(event) =>
                  setUiPreferencesDraft((prev) => ({
                    ...prev,
                    hideEmptyMetrics: event.target.checked,
                  }))
                }
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Hide empty metrics</p>
                <p className="text-xs text-muted-foreground">
                  Removes 0-value highlights like “24h activity” when there is no recent activity.
                </p>
              </div>
            </label>
            <Button onClick={handleSaveUiPreferences} disabled={isSavingUiPreferences || settingsLoading}>
              {isSavingUiPreferences ? "Saving..." : "Save Preferences"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdminOrOwner && (
        <Card id="tenant-experience" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Tenant Experience Profile</CardTitle>
            <CardDescription>
              Choose a UI variant and tenant-level feature flags for this estate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>UI variant</Label>
              <Select
                value={uiVariantDraft}
                onValueChange={(value) => setUiVariantDraft((value || DEFAULT_TENANT_UI_VARIANT) as TenantUiVariant)}
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
                {TENANT_UI_VARIANTS.find((variant) => variant.id === uiVariantDraft)?.description}
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
                    checked={Boolean(featureFlagsDraft[flag.id])}
                    onChange={(event) =>
                      setFeatureFlagsDraft((prev) => ({
                        ...prev,
                        [flag.id]: event.target.checked,
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

            <Button onClick={handleSaveTenantExperience} disabled={isSavingTenantExperience || settingsLoading}>
              {isSavingTenantExperience ? "Saving..." : "Save Experience Profile"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card id="data-import" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Data Import</CardTitle>
          <CardDescription>Upload CSVs to onboard a new tenant faster.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Import processing, dispatch, sales, pepper, rainfall, inventory, and accounts data.</p>
          <div>
            <Button asChild>
              <Link href="/settings/import">Open Data Import</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="thresholds" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Exception Thresholds & Targets</CardTitle>
          <CardDescription>
            Control how the weekly exception engine flags issues and set optional KPI targets for benchmarking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!thresholdDraft ? (
            <div className="text-sm text-muted-foreground">Loading thresholds...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="threshold-float">Float rate increase (ratio)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Float rate help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Flags lots when float rate jumps vs last week.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="threshold-float"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.floatRateIncreasePct}
                    onChange={(event) => updateThresholdField("floatRateIncreasePct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.15 = 15% above last week.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="threshold-yield">Dry parch yield drop (ratio)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Yield drop help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Flags when dry-parch yield falls below last week.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="threshold-yield"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.yieldDropPct}
                    onChange={(event) => updateThresholdField("yieldDropPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.12 = 12% below last week.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold-loss-abs">Transit loss spike (absolute)</Label>
                  <Input
                    id="threshold-loss-abs"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.lossSpikeAbsPct}
                    onChange={(event) => updateThresholdField("lossSpikeAbsPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.02 = +2 percentage points.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold-loss-rel">Transit loss spike (relative)</Label>
                  <Input
                    id="threshold-loss-rel"
                    type="number"
                    step="0.1"
                    value={thresholdDraft.lossSpikeRelPct}
                    onChange={(event) => updateThresholdField("lossSpikeRelPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.5 = 50% above last week.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="threshold-mismatch">Inventory mismatch buffer (KGs)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Inventory mismatch help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Allowed gap between stock and transaction totals.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="threshold-mismatch"
                    type="number"
                    step="1"
                    value={thresholdDraft.mismatchBufferKgs}
                    onChange={(event) => updateThresholdField("mismatchBufferKgs", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="threshold-dispatch">Dispatch unconfirmed days</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Dispatch unconfirmed help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Days before a shipment is flagged as unconfirmed.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="threshold-dispatch"
                    type="number"
                    step="1"
                    value={thresholdDraft.dispatchUnconfirmedDays}
                    onChange={(event) => updateThresholdField("dispatchUnconfirmedDays", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="threshold-bagweight">Bag weight drift (ratio)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Bag weight drift help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Flags when recorded bag weights deviate from standard.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="threshold-bagweight"
                    type="number"
                    step="0.01"
                    value={thresholdDraft.bagWeightDriftPct}
                    onChange={(event) => updateThresholdField("bagWeightDriftPct", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Example: 0.05 = 5% drift.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="threshold-minkgs">Minimum KGs for signal</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Minimum kgs help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Ignore tiny lots to avoid noisy alerts.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="threshold-minkgs"
                    type="number"
                    step="1"
                    value={thresholdDraft.minKgsForSignal}
                    onChange={(event) => updateThresholdField("minKgsForSignal", event.target.value)}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm font-medium">Season Targets (optional)</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="target-yield">Target dry parch yield from ripe</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Target yield help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Benchmark for seasonal yield performance.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="target-yield"
                      type="number"
                      step="0.01"
                      value={thresholdDraft.targets?.dryParchYieldFromRipe ?? ""}
                      onChange={(event) => updateTargetField("dryParchYieldFromRipe", event.target.value)}
                      placeholder="0.46"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="target-loss">Target transit loss %</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Target loss help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Expected transit shrinkage for buyer reconciliation.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="target-loss"
                      type="number"
                      step="0.01"
                      value={thresholdDraft.targets?.lossPct ?? ""}
                      onChange={(event) => updateTargetField("lossPct", event.target.value)}
                      placeholder="0.03"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="target-price">Target avg price/kg (INR)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Target price help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Benchmark for premium pricing per kg.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="target-price"
                      type="number"
                      step="1"
                      value={thresholdDraft.targets?.avgPricePerKg ?? ""}
                      onChange={(event) => updateTargetField("avgPricePerKg", event.target.value)}
                      placeholder="200"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="target-float">Target float rate</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Target float rate help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Expected float rate for quality grading.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="target-float"
                      type="number"
                      step="0.01"
                      value={thresholdDraft.targets?.floatRate ?? ""}
                      onChange={(event) => updateTargetField("floatRate", event.target.value)}
                      placeholder="0.04"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveThresholds} disabled={isSavingThresholds || settingsLoading}>
                {isSavingThresholds ? "Saving..." : "Save Thresholds"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card id="locations" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Locations</CardTitle>
          <CardDescription>Add or edit estate locations used by your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="location-name">Location name</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Location name help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Use the exact names your team uses in the field.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="location-name"
                placeholder="Main Estate, Block A, Washing Station"
                value={newLocationName}
                onChange={(event) => setNewLocationName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="location-code">Location code (optional)</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Location code help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Short codes show up in exports and buyer docs.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="location-code"
                placeholder="MAIN"
                value={newLocationCode}
                onChange={(event) => setNewLocationCode(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreateLocation} disabled={isCreatingLocation} className="w-full">
                {isCreatingLocation ? "Adding..." : "Add Location"}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-white/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No locations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell>
                        {editingLocationId === location.id ? (
                          <Input
                            value={editingLocationName}
                            onChange={(event) => setEditingLocationName(event.target.value)}
                          />
                        ) : (
                          location.name
                        )}
                      </TableCell>
                      <TableCell>
                        {editingLocationId === location.id ? (
                          <Input
                            value={editingLocationCode}
                            onChange={(event) => setEditingLocationCode(event.target.value)}
                          />
                        ) : (
                          location.code
                        )}
                      </TableCell>
                      <TableCell>
                        {editingLocationId === location.id ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleUpdateLocation}
                              disabled={isUpdatingLocationId === location.id}
                            >
                              {isUpdatingLocationId === location.id ? "Saving..." : "Save"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditLocation}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEditLocation(location)}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isOwner && (
        <Card id="tenant-modules" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Tenant Modules</CardTitle>
            <CardDescription>
              Control which modules are available to users in this tenant (subject to your subscription plan).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Module bundles</p>
                <p className="text-xs text-muted-foreground">
                  Start from a preset and then fine-tune the checklist below.
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
            <Button onClick={handleSaveModules} disabled={!tenantId || isSavingModules}>
              {isSavingModules ? "Saving..." : "Save Module Access"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card id="tenant-users" className="scroll-mt-24 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle>Tenant Users</CardTitle>
          <CardDescription>Invite admins or users and manage roles.</CardDescription>
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
          <Button onClick={handleCreateUser} disabled={!tenantId}>
            Create User
          </Button>

          <div className="rounded-lg border border-border/60 bg-white/80">
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
                    return (
                      <TableRow key={u.id}>
                      <TableCell>{u.username}</TableCell>
                      <TableCell>
                        {isOwnerUser ? (
                          <div className="text-sm font-medium text-emerald-700">{roleLabel(u.role)}</div>
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
                      </TableCell>
                      <TableCell>{formatDateOnly(u.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveUserRole(u)}
                            disabled={
                              isOwnerUser || isUpdatingUserId === u.id || (userRoleDrafts[u.id] || u.role) === u.role
                            }
                          >
                            {isUpdatingUserId === u.id ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteUser(u)}
                            disabled={isOwnerUser || isDeletingUserId === u.id}
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

      {isAdminOrOwner && (
        <Card id="user-module-overrides" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>User Module Overrides</CardTitle>
            <CardDescription>Override tenant defaults for a single user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
                disabled={!tenantId || users.length === 0}
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
              <p className="text-xs text-muted-foreground">Enabled for selected user: {enabledUserModuleCount}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {userModulePermissions.map((module) => {
                const isLockedForRole = isSelectedUserRoleScoped && module.id === "balance-sheet"
                return (
                  <label key={module.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/80 p-3">
                    <input
                      type="checkbox"
                      checked={module.enabled}
                      onChange={() => toggleUserModule(module.id)}
                      disabled={isUserModulesLoading || isLockedForRole}
                    />
                    <span>{module.label}</span>
                    {isLockedForRole && <span className="ml-auto text-xs text-muted-foreground">Admin only</span>}
                  </label>
                )
              })}
            </div>
            {isSelectedUserRoleScoped && (
              <p className="text-xs text-muted-foreground">
                Live Balance Sheet is admin-only and remains disabled for user roles.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleSaveUserModules}
                disabled={!selectedUserId || isUserModulesLoading || isSavingUserModules}
              >
                {isSavingUserModules ? "Saving..." : "Save User Access"}
              </Button>
              <Button variant="outline" onClick={handleResetUserModules} disabled={!selectedUserId || isUserModulesLoading}>
                Reset to Tenant Defaults
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mfaFeatureEnabled && (user?.role === "admin" || user?.role === "owner") && (
        <Card id="admin-security" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Admin Security (MFA)</CardTitle>
            <CardDescription>Admins must enroll in MFA to access sensitive settings and admin APIs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {mfaError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{mfaError}</div>}
            {isMfaLoading ? (
              <div>Loading MFA status...</div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-white/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">MFA status</p>
                    <p>
                      {mfaStatus?.enabled
                        ? `Enabled · Enrolled ${mfaStatus?.enrolledAt ? formatDateForDisplay(mfaStatus.enrolledAt) : ""}`
                        : "Not enabled"}
                    </p>
                  </div>
                  <Button onClick={handleMfaSetup} disabled={isMfaSetupLoading}>
                    {isMfaSetupLoading ? "Preparing..." : "Generate MFA secret"}
                  </Button>
                </div>

                {(mfaSecret || mfaOtpAuth) && (
                  <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-sm font-medium text-emerald-800">Step 1: Add to Authenticator</p>
                    <p>Secret: <span className="font-mono text-emerald-900">{mfaSecret}</span></p>
                    {mfaOtpAuth && (
                      <p className="text-xs text-emerald-800 break-all">OTP URI: {mfaOtpAuth}</p>
                    )}
                    <p className="text-xs text-emerald-800">Use your authenticator app to add a manual key. QR code support can be added later.</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1">
                    <Label>Enter 6-digit MFA code</Label>
                    <Input value={mfaToken} onChange={(event) => setMfaToken(event.target.value)} />
                  </div>
                  <Button onClick={handleMfaVerify} disabled={isMfaVerifyLoading}>
                    {isMfaVerifyLoading ? "Verifying..." : "Verify & enable"}
                  </Button>
                  <Button variant="outline" onClick={handleMfaDisable} disabled={isMfaDisableLoading}>
                    {isMfaDisableLoading ? "Disabling..." : "Disable"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {privacyFeatureEnabled && (
        <Card id="privacy-dpdp" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <CardTitle>Privacy & DPDP</CardTitle>
            <CardDescription>Manage personal data rights, notices, and consent settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {privacyError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{privacyError}</div>}
            {isPrivacyLoading ? (
              <div>Loading privacy status...</div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-white/80 p-4 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Privacy notice</p>
                    <p>
                      Version: {privacyStatus?.noticeVersion || "Not available"}{" "}
                      {privacyStatus?.acceptedAt
                        ? `· Accepted ${formatDateForDisplay(privacyStatus.acceptedAt)}`
                        : "· Not accepted yet"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/privacy">View Notice</Link>
                    </Button>
                    <Button onClick={handleAcceptNotice} disabled={isAcceptingNotice || !tenantId}>
                      {isAcceptingNotice ? "Saving..." : "Acknowledge"}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Optional product updates</p>
                    <p>Allow FarmFlow to send product updates and training materials.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(privacyStatus?.consentMarketing)}
                      onChange={(event) => handleConsentToggle(event.target.checked)}
                      disabled={isUpdatingConsent || !tenantId}
                    />
                    {privacyStatus?.consentMarketing ? "Opted in" : "Opted out"}
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/60 bg-white/80 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Export my data</p>
                  <p>Download a JSON export of your personal data across FarmFlow.</p>
                </div>
                <Button onClick={handleExportPersonalData} disabled={isExportingPersonalData || !tenantId}>
                  {isExportingPersonalData ? "Preparing..." : "Download export"}
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 bg-white/80 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Correct my username</p>
                  <p>Update the username used across logs and records.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={correctionUsername}
                    onChange={(event) => setCorrectionUsername(event.target.value)}
                    placeholder="New username"
                  />
                  <Button onClick={handleSubmitCorrection} disabled={isSubmittingCorrection || !tenantId}>
                    {isSubmittingCorrection ? "Updating..." : "Update"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-900">Request deletion or anonymization</p>
              <p>
                We will remove or anonymize your personal data once the request is processed. Some records may be
                retained when required by law.
              </p>
              {privacyStatus?.deletionRequestedAt && (
                <p className="text-xs text-amber-900">
                  Request logged on {formatDateForDisplay(privacyStatus.deletionRequestedAt)}.
                </p>
              )}
              <Button variant="destructive" onClick={handleRequestDeletion} disabled={isRequestingDeletion || !tenantId}>
                {isRequestingDeletion ? "Submitting..." : "Request deletion"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card id="audit-log" className="scroll-mt-24 border-border/70 bg-white/85">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Track who changed what for this tenant.</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-1">
                  <Label>Filter</Label>
                  <Select value={auditEntityType} onValueChange={setAuditEntityType}>
                    <SelectTrigger className="w-full sm:w-[180px]">
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
                <Button variant="outline" onClick={loadAuditLogs} disabled={!tenantId || isAuditLoading}>
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
              <div className="rounded-lg border border-border/60 bg-white/80">
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
