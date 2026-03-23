"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { AlertThresholds, useTenantSettings } from "@/hooks/use-tenant-settings"
import { useLocale } from "@/components/locale-provider"
import { DEFAULT_TENANT_ESTATE_PROFILE, type TenantEstateProfile } from "@/lib/tenant-estate-profile"
import {
  DEFAULT_TENANT_PLAN_ID,
  MODULES,
  clampRequestedModuleStatesToPlan,
  normalizeTenantPlanId,
  type ModuleBundle,
} from "@/lib/modules"
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"
import { roleLabel } from "@/lib/roles"
import WorkspacePageShell from "@/components/workspace-page-shell"
import { AuditLogSection, PrivacySection } from "@/components/tenant-settings/governance-sections"
import {
  AccountLanguageSection,
  DataImportSection,
  DisplayPreferencesSection,
  EstateIdentitySection,
  EstateProfileSection,
  OwnerToolsSection,
  TenantExperienceSection,
  TenantSettingsOverview,
} from "@/components/tenant-settings/overview-sections"
import {
  LocationsSection,
  TenantModulesSection,
  TenantUsersSection,
  UserModuleOverridesSection,
} from "@/components/tenant-settings/operations-sections"
import { ThresholdsSection } from "@/components/tenant-settings/thresholds-section"
import type {
  AuditLog,
  LocationRow,
  ModulePermission,
  PrivacyStatus,
  RoleOption,
  SectionLink,
  UiPreferencesDraft,
  User,
  UserModuleSource,
} from "@/components/tenant-settings/types"

export default function TenantSettingsPage() {
  const { user, logout } = useAuth()
  const { update: updateSession } = useSession()
  const { toast } = useToast()
  const { setLocale } = useLocale()
  const { settings, updateSettings, loading: settingsLoading } = useTenantSettings()
  const tenantId = user?.tenantId || ""

  const [estateNameInput, setEstateNameInput] = useState("")
  const [isSavingEstateName, setIsSavingEstateName] = useState(false)
  const [estateProfileDraft, setEstateProfileDraft] = useState<TenantEstateProfile>(DEFAULT_TENANT_ESTATE_PROFILE)
  const [isSavingEstateProfile, setIsSavingEstateProfile] = useState(false)
  const [thresholdDraft, setThresholdDraft] = useState<AlertThresholds | null>(null)
  const [isSavingThresholds, setIsSavingThresholds] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<RoleOption>("user")
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({})
  const [isUpdatingUserId, setIsUpdatingUserId] = useState<string | null>(null)
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null)

  const [modulePermissions, setModulePermissions] = useState<ModulePermission[]>([])
  const [tenantPlanId, setTenantPlanId] = useState<string>(DEFAULT_TENANT_PLAN_ID)
  const [isSavingModules, setIsSavingModules] = useState(false)
  const [uiPreferencesDraft, setUiPreferencesDraft] = useState<UiPreferencesDraft>({ hideEmptyMetrics: false })
  const [isSavingUiPreferences, setIsSavingUiPreferences] = useState(false)
  const [accountPreferredLocale, setAccountPreferredLocale] = useState<AppLocale>(normalizeAppLocale(user?.preferredLocale))
  const [isSavingAccountLanguage, setIsSavingAccountLanguage] = useState(false)
  const [uiVariantDraft, setUiVariantDraft] = useState<TenantUiVariant>(DEFAULT_TENANT_UI_VARIANT)
  const [featureFlagsDraft, setFeatureFlagsDraft] = useState<TenantFeatureFlags>(DEFAULT_TENANT_FEATURE_FLAGS)
  const [isSavingTenantExperience, setIsSavingTenantExperience] = useState(false)

  const [selectedUserId, setSelectedUserId] = useState("")
  const [userModulePermissions, setUserModulePermissions] = useState<ModulePermission[]>([])
  const [userModuleSource, setUserModuleSource] = useState<UserModuleSource>("")
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

  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus | null>(null)
  const [privacyError, setPrivacyError] = useState<string | null>(null)
  const [isPrivacyLoading, setIsPrivacyLoading] = useState(false)
  const [isAcceptingNotice, setIsAcceptingNotice] = useState(false)
  const [isExportingPersonalData, setIsExportingPersonalData] = useState(false)
  const [correctionUsername, setCorrectionUsername] = useState("")
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false)
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false)
  const [isUpdatingConsent, setIsUpdatingConsent] = useState(false)

  const isOwner = user?.role === "owner"
  const isAdminOrOwner = user?.role === "admin" || user?.role === "owner"
  const canManageTenantExperience = isOwner
  const privacyFeatureEnabled = false

  useEffect(() => {
    setEstateNameInput(settings.estateName || "")
  }, [settings.estateName])

  useEffect(() => {
    setUiPreferencesDraft({
      hideEmptyMetrics: Boolean(settings.uiPreferences?.hideEmptyMetrics),
    })
  }, [settings.uiPreferences?.hideEmptyMetrics])

  useEffect(() => {
    setEstateProfileDraft({ ...DEFAULT_TENANT_ESTATE_PROFILE, ...(settings.estateProfile || {}) })
  }, [settings.estateProfile])

  useEffect(() => {
    setAccountPreferredLocale(normalizeAppLocale(user?.preferredLocale))
  }, [user?.preferredLocale])

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

  useEffect(() => {
    if (settings.alertThresholds) {
      setThresholdDraft(settings.alertThresholds)
    }
  }, [settings.alertThresholds])

  const loadUsers = useCallback(async () => {
    if (!tenantId) return
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
  }, [tenantId, toast])

  const loadModules = useCallback(async () => {
    if (!tenantId || !isOwner) return
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
  }, [isOwner, tenantId, toast])

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

  const loadAuditLogs = useCallback(async () => {
    if (!tenantId || !isOwner) return
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
  }, [auditEntityType, isOwner, tenantId, toast])

  const loadLocations = useCallback(async () => {
    if (!tenantId) return
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load locations")
      }
      const nextLocations = Array.isArray(data.locations)
        ? data.locations.map((location: any) => ({
            id: String(location?.id || ""),
            name: String(location?.name || ""),
            code: String(location?.code || ""),
          }))
        : []
      setLocations(nextLocations)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load locations", variant: "destructive" })
    }
  }, [tenantId, toast])

  useEffect(() => {
    if (!tenantId) return
    loadUsers()
    if (isOwner) {
      loadModules()
      loadAuditLogs()
    }
    loadLocations()
  }, [tenantId, loadAuditLogs, loadLocations, loadModules, loadUsers, isOwner])

  useEffect(() => {
    if (tenantId && isOwner) {
      loadAuditLogs()
    }
  }, [auditEntityType, tenantId, loadAuditLogs, isOwner])

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
    if (!isAdminOrOwner) {
      return
    }
    if (selectedUserId) {
      loadUserModules(selectedUserId)
      return
    }
    setUserModulePermissions(MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })))
    setUserModuleSource("default")
  }, [selectedUserId, loadUserModules, isAdminOrOwner])

  const handleCreateUser = async () => {
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
      toast({ title: "Role updated", description: `${user.username} is now ${roleLabel(nextRole)}.` })
      await loadUsers()
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
      await loadUsers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" })
    } finally {
      setIsDeletingUserId(null)
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
    if (!tenantId) return
    setIsSavingModules(true)
    try {
      const response = await fetch("/api/admin/tenant-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, planId: tenantPlanId, modules: modulePermissions }),
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
    if (!canManageTenantExperience) {
      toast({
        title: "Owner required",
        description: "Only owners can update the tenant experience profile.",
        variant: "destructive",
      })
      return
    }
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
          code: String(newLocationCode || "").trim() || undefined,
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
    setEditingLocationName(String(location.name || ""))
    setEditingLocationCode(String(location.code || ""))
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
    const currentLocation = locations.find((location) => location.id === editingLocationId) || null
    const nextCodeInput = String(editingLocationCode || "").trim()
    const fallbackCode = String(currentLocation?.code || "").trim()
    setIsUpdatingLocationId(editingLocationId)
    try {
      const response = await fetch("/api/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingLocationId,
          name: editingLocationName.trim(),
          code: nextCodeInput || fallbackCode || undefined,
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

  const handleEstateProfileChange = (patch: Partial<TenantEstateProfile>) => {
    setEstateProfileDraft((prev) => ({ ...prev, ...patch }))
  }

  const handleSaveEstateProfile = async () => {
    setIsSavingEstateProfile(true)
    try {
      await updateSettings({ estateProfile: estateProfileDraft })
      toast({
        title: "Estate profile updated",
        description: "Acreage and weather coordinates saved.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update acreage and weather coordinates",
        variant: "destructive",
      })
    } finally {
      setIsSavingEstateProfile(false)
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

  const handleHideEmptyMetricsChange = (value: boolean) => {
    setUiPreferencesDraft((prev) => ({ ...prev, hideEmptyMetrics: value }))
  }

  const handleFeatureFlagChange = (flagId: keyof TenantFeatureFlags, enabled: boolean) => {
    setFeatureFlagsDraft((prev) => ({ ...prev, [flagId]: enabled }))
  }

  const handleSaveAccountLanguage = async () => {
    setIsSavingAccountLanguage(true)
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLocale: accountPreferredLocale }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update language")
      }
      setLocale(accountPreferredLocale)
      await updateSession({ preferredLocale: accountPreferredLocale })
      toast({ title: "Language updated", description: "Your account language preference has been saved." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update language", variant: "destructive" })
    } finally {
      setIsSavingAccountLanguage(false)
    }
  }

  const enabledTenantModuleCount = modulePermissions.filter((module) => module.enabled).length
  const enabledUserModuleCount = userModulePermissions.filter((module) => module.enabled).length
  const selectedUser = users.find((u) => u.id === selectedUserId) || null
  const isSelectedUserRoleScoped = selectedUser?.role === "user"
  const roleDisplay = roleLabel(user?.role || "user")
  const sectionLinks: SectionLink[] = [
    { id: "estate-identity", label: "Estate" },
    { id: "estate-profile", label: "Footprint" },
    { id: "account-language", label: "Language" },
    { id: "display-preferences", label: "Display" },
    { id: "data-import", label: "Import" },
    { id: "thresholds", label: "Thresholds" },
    { id: "locations", label: "Locations" },
    { id: "tenant-users", label: "Users" },
  ]
  if (canManageTenantExperience) {
    sectionLinks.push({ id: "tenant-experience", label: "Experience" })
  }
  if (isOwner) {
    sectionLinks.push({ id: "tenant-modules", label: "Modules" })
    sectionLinks.push({ id: "user-module-overrides", label: "User Access" })
    sectionLinks.push({ id: "audit-log", label: "Audit" })
  }
  if (privacyFeatureEnabled) {
    sectionLinks.push({ id: "privacy-dpdp", label: "Privacy" })
  }
  const settingsShellStats = [
    {
      label: "Your Role",
      value: roleDisplay,
      detail: isOwner ? "Owner controls unlocked" : "Estate-level settings access",
    },
    {
      label: "Users",
      value: String(users.length),
      detail: "Tenant accounts configured",
    },
    {
      label: "Locations",
      value: String(locations.length),
      detail: "Estate locations available for operations",
    },
    {
      label: "Enabled Modules",
      value: String(enabledTenantModuleCount),
      detail: isOwner ? "Plan and module controls available" : "Owner-managed access bundle",
    },
  ]

  return (
    <WorkspacePageShell
      badge="Settings workspace"
      title="Estate Settings"
      description="Set estate defaults, people, access, and reporting rules."
      accent="slate"
      className="space-y-0"
      stats={settingsShellStats}
      supportingContent={
        <p>
          Most estates only need identity, locations, people, and a few reporting defaults to get started.
        </p>
      }
    >
      <TenantSettingsOverview
        tenantId={tenantId}
        userCount={users.length}
        locationCount={locations.length}
        isOwner={isOwner}
        enabledTenantModuleCount={enabledTenantModuleCount}
        roleDisplay={roleDisplay}
        sectionLinks={sectionLinks}
        onLogout={logout}
      />

      {isOwner && <OwnerToolsSection />}

      <EstateIdentitySection
        estateNameInput={estateNameInput}
        savedEstateName={settings.estateName || ""}
        isSavingEstateName={isSavingEstateName}
        settingsLoading={settingsLoading}
        onEstateNameChange={setEstateNameInput}
        onSaveEstateName={handleSaveEstateName}
      />

      <EstateProfileSection
        estateProfileDraft={estateProfileDraft}
        isSavingEstateProfile={isSavingEstateProfile}
        settingsLoading={settingsLoading}
        onEstateProfileChange={handleEstateProfileChange}
        onSaveEstateProfile={handleSaveEstateProfile}
      />

      <AccountLanguageSection
        preferredLocale={accountPreferredLocale}
        isSaving={isSavingAccountLanguage}
        onPreferredLocaleChange={setAccountPreferredLocale}
        onSave={handleSaveAccountLanguage}
      />

      {isAdminOrOwner && (
        <DisplayPreferencesSection
          uiPreferencesDraft={uiPreferencesDraft}
          isSavingUiPreferences={isSavingUiPreferences}
          settingsLoading={settingsLoading}
          onHideEmptyMetricsChange={handleHideEmptyMetricsChange}
          onSaveUiPreferences={handleSaveUiPreferences}
        />
      )}

      {canManageTenantExperience && (
        <TenantExperienceSection
          uiVariantDraft={uiVariantDraft}
          featureFlagsDraft={featureFlagsDraft}
          isSavingTenantExperience={isSavingTenantExperience}
          settingsLoading={settingsLoading}
          onUiVariantChange={setUiVariantDraft}
          onFeatureFlagChange={handleFeatureFlagChange}
          onSaveTenantExperience={handleSaveTenantExperience}
        />
      )}

      <DataImportSection />

      <ThresholdsSection
        thresholdDraft={thresholdDraft}
        isSavingThresholds={isSavingThresholds}
        settingsLoading={settingsLoading}
        onThresholdFieldChange={updateThresholdField}
        onTargetFieldChange={updateTargetField}
        onSaveThresholds={handleSaveThresholds}
      />

      <LocationsSection
        locations={locations}
        newLocationName={newLocationName}
        newLocationCode={newLocationCode}
        isCreatingLocation={isCreatingLocation}
        editingLocationId={editingLocationId}
        editingLocationName={editingLocationName}
        editingLocationCode={editingLocationCode}
        isUpdatingLocationId={isUpdatingLocationId}
        onNewLocationNameChange={setNewLocationName}
        onNewLocationCodeChange={setNewLocationCode}
        onCreateLocation={handleCreateLocation}
        onEditingLocationNameChange={setEditingLocationName}
        onEditingLocationCodeChange={setEditingLocationCode}
        onUpdateLocation={handleUpdateLocation}
        onStartEditLocation={startEditLocation}
        onCancelEditLocation={cancelEditLocation}
      />

      {isOwner && (
        <TenantModulesSection
          modulePermissions={modulePermissions}
          tenantId={tenantId}
          tenantPlanId={tenantPlanId}
          isSavingModules={isSavingModules}
          onApplyModuleBundle={applyModuleBundle}
          onToggleModule={toggleModule}
          onSaveModules={handleSaveModules}
        />
      )}

      <TenantUsersSection
        tenantId={tenantId}
        users={users}
        newUsername={newUsername}
        newPassword={newPassword}
        newRole={newRole}
        userRoleDrafts={userRoleDrafts}
        isUpdatingUserId={isUpdatingUserId}
        isDeletingUserId={isDeletingUserId}
        onNewUsernameChange={setNewUsername}
        onNewPasswordChange={setNewPassword}
        onNewRoleChange={setNewRole}
        onCreateUser={handleCreateUser}
        onRoleDraftChange={handleRoleDraftChange}
        onSaveUserRole={handleSaveUserRole}
        onDeleteUser={handleDeleteUser}
      />

      {isAdminOrOwner && (
        <UserModuleOverridesSection
          tenantId={tenantId}
          users={users}
          selectedUserId={selectedUserId}
          userModuleSource={userModuleSource}
          enabledUserModuleCount={enabledUserModuleCount}
          userModulePermissions={userModulePermissions}
          isSelectedUserRoleScoped={isSelectedUserRoleScoped}
          isUserModulesLoading={isUserModulesLoading}
          isSavingUserModules={isSavingUserModules}
          onSelectedUserIdChange={setSelectedUserId}
          onToggleUserModule={toggleUserModule}
          onSaveUserModules={handleSaveUserModules}
          onResetUserModules={handleResetUserModules}
        />
      )}

      {privacyFeatureEnabled && (
        <PrivacySection
          tenantId={tenantId}
          privacyStatus={privacyStatus}
          privacyError={privacyError}
          isPrivacyLoading={isPrivacyLoading}
          isAcceptingNotice={isAcceptingNotice}
          isExportingPersonalData={isExportingPersonalData}
          correctionUsername={correctionUsername}
          isSubmittingCorrection={isSubmittingCorrection}
          isRequestingDeletion={isRequestingDeletion}
          isUpdatingConsent={isUpdatingConsent}
          onCorrectionUsernameChange={setCorrectionUsername}
          onAcceptNotice={handleAcceptNotice}
          onExportPersonalData={handleExportPersonalData}
          onSubmitCorrection={handleSubmitCorrection}
          onRequestDeletion={handleRequestDeletion}
          onConsentToggle={handleConsentToggle}
        />
      )}

      {isOwner && (
        <AuditLogSection
          tenantId={tenantId}
          auditEntityType={auditEntityType}
          auditLogs={auditLogs}
          auditTotalCount={auditTotalCount}
          isAuditLoading={isAuditLoading}
          onAuditEntityTypeChange={setAuditEntityType}
          onRefreshAuditLogs={loadAuditLogs}
        />
      )}
    </WorkspacePageShell>
  )
}
