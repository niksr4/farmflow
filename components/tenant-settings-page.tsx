"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Building2, KeyRound, Layers2, Lock, Settings2, UserCircle, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  LaborDefaultsSection,
  TenantModulesSection,
  TenantUsersSection,
  UserLocationOverridesSection,
  UserModuleOverridesSection,
} from "@/components/tenant-settings/operations-sections"
import { ThresholdsSection } from "@/components/tenant-settings/thresholds-section"
import type {
  AuditLog,
  LocationPermission,
  LocationRow,
  ModulePermission,
  PrivacyStatus,
  RoleOption,
  SectionLink,
  UiPreferencesDraft,
  User,
  UserLocationSource,
  UserModuleSource,
} from "@/components/tenant-settings/types"

type SettingsGroupId = "profile" | "estate" | "operations" | "user-access" | "privacy" | "advanced"


type SettingsSection = {
  id: string
  label: string
  /** Short line under the label in the nav, for sections whose purpose is not obvious. */
  hint?: string
  node: React.ReactNode
}

type SettingsNavGroup = {
  id: SettingsGroupId
  title: string
  icon: React.ComponentType<{ className?: string }>
  sections: SettingsSection[]
}

/**
 * Persistent section list. Replaces the previous one-at-a-time accordion, where opening a group
 * collapsed the one above it -- the document lost that height, everything below slid up, and the
 * viewport landed somewhere inside the newly opened group instead of at its heading.
 *
 * Selecting a section here swaps the content pane rather than scrolling the page, so that whole
 * class of jump cannot happen: there is nothing above the pane to collapse.
 */
function SettingsNav({
  groups,
  activeSectionId,
  onSelect,
}: {
  groups: SettingsNavGroup[]
  activeSectionId: string
  onSelect: (sectionId: string) => void
}) {
  return (
    <nav aria-label="Settings sections" className="space-y-5">
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          <div className="flex items-center gap-2 px-3 pb-1">
            <group.icon className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {group.title}
            </p>
          </div>
          {group.sections.map((section) => {
            const isActive = section.id === activeSectionId
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                  isActive
                    ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                    : "text-slate-700 hover:bg-slate-100/80",
                )}
              >
                <span className={cn("text-sm", isActive ? "font-semibold" : "font-medium")}>
                  {section.label}
                </span>
                {section.hint ? (
                  <span className="text-[11px] leading-4 text-slate-500">{section.hint}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export default function TenantSettingsPage() {
  const { user, logout, isAdminOrOwner } = useAuth()
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
  const [digestEmail, setDigestEmail] = useState("")
  const [isSavingDigestEmail, setIsSavingDigestEmail] = useState(false)
  const [uiVariantDraft, setUiVariantDraft] = useState<TenantUiVariant>(DEFAULT_TENANT_UI_VARIANT)
  const [featureFlagsDraft, setFeatureFlagsDraft] = useState<TenantFeatureFlags>(DEFAULT_TENANT_FEATURE_FLAGS)
  const [isSavingTenantExperience, setIsSavingTenantExperience] = useState(false)

  const [selectedUserId, setSelectedUserId] = useState("")
  const [userModulePermissions, setUserModulePermissions] = useState<ModulePermission[]>([])
  const [userModuleSource, setUserModuleSource] = useState<UserModuleSource>("")
  const [isUserModulesLoading, setIsUserModulesLoading] = useState(false)
  const [isSavingUserModules, setIsSavingUserModules] = useState(false)
  const [userLocationPermissions, setUserLocationPermissions] = useState<LocationPermission[]>([])
  const [userLocationSource, setUserLocationSource] = useState<UserLocationSource>("")
  const [isUserLocationsLoading, setIsUserLocationsLoading] = useState(false)
  const [isSavingUserLocations, setIsSavingUserLocations] = useState(false)

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotalCount, setAuditTotalCount] = useState(0)
  const [auditEntityType, setAuditEntityType] = useState("all")
  const [isAuditLoading, setIsAuditLoading] = useState(false)

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [newLocationName, setNewLocationName] = useState("")
  const [newLocationCode, setNewLocationCode] = useState("")
  const [newLocationEstate, setNewLocationEstate] = useState("")
  const [newLocationArea, setNewLocationArea] = useState("")
  const [newLocationKind, setNewLocationKind] = useState<"block" | "store" | "general">("block")

  // The estate's acreage is the sum of its blocks, never a number of its own. Stores are excluded
  // -- a shed has a footprint but not a planted area, and counting it would inflate every
  // per-acre figure the app produces.
  const blockAcreage = useMemo(() => {
    const blocks = locations.filter((l) => (l.kind || "block") === "block")
    const withArea = blocks.filter((l) => l.areaAcres != null && Number(l.areaAcres) > 0)
    const total = withArea.reduce((sum, l) => sum + Number(l.areaAcres || 0), 0)
    return {
      blocks: blocks.length,
      withArea: withArea.length,
      total: withArea.length > 0 ? Number(total.toFixed(2)) : null,
    }
  }, [locations])
  const [isCreatingLocation, setIsCreatingLocation] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editingLocationName, setEditingLocationName] = useState("")
  const [editingLocationCode, setEditingLocationCode] = useState("")
  const [editingLocationEstate, setEditingLocationEstate] = useState("")
  const [editingLocationArea, setEditingLocationArea] = useState("")
  const [isUpdatingLocationId, setIsUpdatingLocationId] = useState<string | null>(null)
  const [isDeletingLocationId, setIsDeletingLocationId] = useState<string | null>(null)

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
  const canManageTenantExperience = isOwner
  const privacyFeatureEnabled = Boolean(tenantId)
  // One section is shown at a time in the content pane. Null means "not chosen yet" and resolves
  // to the first section the viewer can actually see, which depends on role.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  // Anchor for scrolling to the settings area itself rather than the top of the document.
  const settingsPaneRef = useRef<HTMLDivElement>(null)

  /**
   * Deep links (the overview card's #section anchors, and any bookmarked URL) select a section
   * rather than scrolling to it. The old accordion had to map section -> group by hand, so the
   * two sections missing from that table were silently unreachable; here the nav registry is the
   * only source of truth, so a section cannot exist without being linkable.
   */
  const syncActiveSectionFromHash = useCallback(() => {
    if (typeof window === "undefined") return
    const sectionId = decodeURIComponent(window.location.hash.replace(/^#/, "").trim())
    if (!sectionId) return
    setActiveSectionId(sectionId)
  }, [])

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
    fetch("/api/account/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data.preferences?.email) {
          setDigestEmail(data.preferences.digestEmail || "")
        }
      })
      .catch(() => {})
  }, [])

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

  useEffect(() => {
    syncActiveSectionFromHash()
    window.addEventListener("hashchange", syncActiveSectionFromHash)
    return () => window.removeEventListener("hashchange", syncActiveSectionFromHash)
  }, [syncActiveSectionFromHash])

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

  const loadUserLocations = useCallback(async (userId: string) => {
    if (!userId) {
      setUserLocationPermissions([])
      setUserLocationSource("default")
      return
    }

    setIsUserLocationsLoading(true)
    try {
      const response = await fetch(`/api/admin/user-locations?userId=${userId}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load user locations")
      }
      setUserLocationPermissions(data.locations || [])
      setUserLocationSource(data.source || "default")
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load user locations", variant: "destructive" })
      setUserLocationPermissions([])
      setUserLocationSource("default")
    } finally {
      setIsUserLocationsLoading(false)
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
      // scope=all: this settings page manages every block, regardless of the estate
      // selector's current value elsewhere in the app.
      const response = await fetch("/api/locations?scope=all&kind=all")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load locations")
      }
      const nextLocations = Array.isArray(data.locations)
        ? data.locations.map((location: any) => ({
            id: String(location?.id || ""),
            name: String(location?.name || ""),
            code: String(location?.code || ""),
            estate: location?.estate ? String(location.estate) : null,
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

  useEffect(() => {
    if (!isAdminOrOwner) {
      return
    }
    if (selectedUserId) {
      loadUserLocations(selectedUserId)
      return
    }
    setUserLocationPermissions([])
    setUserLocationSource("default")
  }, [selectedUserId, loadUserLocations, isAdminOrOwner])

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

  const toggleUserLocation = (locationId: string) => {
    setUserLocationPermissions((prev) =>
      prev.map((location) => (location.id === locationId ? { ...location, enabled: !location.enabled } : location)),
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

  const [laborWagesDraft, setLaborWagesDraft] = useState({ defaultInHouseWage: 0, defaultOutsideWage: 0 })
  const [isSavingLaborWages, setIsSavingLaborWages] = useState(false)

  useEffect(() => {
    if (settings.laborWages) {
      setLaborWagesDraft({
        defaultInHouseWage: settings.laborWages.defaultInHouseWage ?? 0,
        defaultOutsideWage: settings.laborWages.defaultOutsideWage ?? 0,
      })
    }
  }, [settings.laborWages])

  const handleSaveLaborWages = async () => {
    setIsSavingLaborWages(true)
    try {
      await updateSettings({ laborWages: laborWagesDraft })
      toast({ title: "Labour defaults saved", description: "Default wage rates updated." })
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message || "Unable to save labour defaults.", variant: "destructive" })
    } finally {
      setIsSavingLaborWages(false)
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

  const handleSaveUserLocations = async () => {
    if (!selectedUserId) return
    setIsSavingUserLocations(true)
    try {
      const response = await fetch("/api/admin/user-locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, locations: userLocationPermissions }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update user locations")
      }
      toast({ title: "User access updated", description: "Location access saved for this user." })
      await loadUserLocations(selectedUserId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update user locations", variant: "destructive" })
    } finally {
      setIsSavingUserLocations(false)
    }
  }

  const handleResetUserLocations = async () => {
    if (!selectedUserId) return
    try {
      const response = await fetch(`/api/admin/user-locations?userId=${selectedUserId}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reset user locations")
      }
      toast({ title: "User reset", description: "User can access every location again." })
      await loadUserLocations(selectedUserId)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reset user locations", variant: "destructive" })
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
          estate: String(newLocationEstate || "").trim() || null,
          areaAcres: String(newLocationArea || "").trim() === "" ? null : Number(newLocationArea),
          kind: newLocationKind,
          tenantId,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create location")
      }
      setNewLocationName("")
      setNewLocationCode("")
      setNewLocationEstate("")
      setNewLocationArea("")
      setNewLocationKind("block")
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
    setEditingLocationArea(location.areaAcres != null ? String(location.areaAcres) : "")
    setEditingLocationEstate(String(location.estate || ""))
  }

  const cancelEditLocation = () => {
    setEditingLocationId(null)
    setEditingLocationName("")
    setEditingLocationCode("")
    setEditingLocationEstate("")
  }

  // Deleting a block is refused by the server the moment anything references it, and the refusal
  // names what is using it. So the confirm here is about intent, not safety -- the estate is
  // being asked "did you mean this one", not "are you sure you want to lose a year of records".
  const handleDeleteLocation = async (location: LocationRow) => {
    if (!window.confirm(`Remove the block "${location.name}"? This only works if nothing has been recorded against it.`)) return
    setIsDeletingLocationId(location.id)
    try {
      const response = await fetch(`/api/locations?id=${encodeURIComponent(location.id)}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) throw new Error(data?.error || "Could not remove the block")
      toast({ title: "Block removed", description: `"${location.name}" is gone.` })
      await loadLocations()
    } catch (error: unknown) {
      toast({
        title: "Kept it",
        description: error instanceof Error ? error.message : "Could not remove the block",
        variant: "destructive",
      })
    } finally {
      setIsDeletingLocationId(null)
    }
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
          // Always send estate explicitly (even "") so clearing the field in the UI actually
          // clears the tag -- the API only preserves the existing value when the key is absent
          // entirely, which is what every pre-existing caller here relied on before this field
          // had a UI at all.
          estate: String(editingLocationEstate || "").trim() || null,
          // Sent even when blank, so clearing the field genuinely clears the area.
          areaAcres: String(editingLocationArea || "").trim() === "" ? null : Number(editingLocationArea),
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

  const handleSaveDigestEmail = async () => {
    const trimmed = digestEmail.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Invalid email", description: "Enter a valid email address.", variant: "destructive" })
      return
    }
    setIsSavingDigestEmail(true)
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestEmail: trimmed }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to update email")
      toast({ title: "Email updated", description: "The weekly digest will now go to this address." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update email", variant: "destructive" })
    } finally {
      setIsSavingDigestEmail(false)
    }
  }

  const enabledTenantModuleCount = modulePermissions.filter((module) => module.enabled).length
  const enabledUserModuleCount = userModulePermissions.filter((module) => module.enabled).length
  const selectedUser = users.find((u) => u.id === selectedUserId) || null
  const isSelectedUserRoleScoped = selectedUser?.role === "user"
  const roleDisplay = roleLabel(user?.role || "user")
  const sectionLinks: SectionLink[] = [
    // Profile sections — visible to everyone
    { id: "account-language", label: "Language" },
    { id: "account-security", label: "Security" },
    // Admin-only sections
    ...(isAdminOrOwner ? [
      { id: "estate-identity", label: "Estate" },
      { id: "estate-profile", label: "Footprint" },
      { id: "display-preferences", label: "Display" },
      { id: "thresholds", label: "Thresholds" },
      { id: "data-import", label: "Import" },
      { id: "locations", label: "Locations" },
    ] : []),
  ]
  if (canManageTenantExperience) {
    sectionLinks.push({ id: "tenant-experience", label: "Experience" })
  }
  if (isOwner) {
    sectionLinks.push({ id: "tenant-modules", label: "Allowed Modules" })
  }
  // People lists every account on the estate and is where roles are changed. A writer has no
  // business there -- and it was the one section pushed unconditionally, so opening Settings to
  // writers without this would have handed them the user list.
  if (isAdminOrOwner) {
    sectionLinks.push({ id: "tenant-users", label: "People" })
  }
  if (isAdminOrOwner) {
    sectionLinks.push({ id: "user-module-overrides", label: "User Exceptions" })
  }
  if (isOwner) {
    sectionLinks.push({ id: "audit-log", label: "Audit" })
  }
  if (privacyFeatureEnabled) {
    sectionLinks.push({ id: "privacy-dpdp", label: "Privacy" })
  }
  const settingsShellStats = isAdminOrOwner ? [
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
    // Module data only loads for owners — showing "0" to admins is misleading
    ...(isOwner
      ? [{
          label: "Enabled Modules",
          value: String(enabledTenantModuleCount),
          detail: "Plan and module controls available",
        }]
      : []),
  ] : [
    {
      label: "Your Role",
      value: roleDisplay,
      detail: "Personal settings — email, language, password",
    },
  ]
  /**
   * The single source of truth for what Settings contains. Nav entries and pane content are built
   * from the same list, so a section cannot be rendered without also being navigable -- the bug
   * the old hand-maintained section->group table had, where "Labour defaults" and "Location
   * exceptions" were reachable by scrolling but invisible to any deep link.
   *
   * Only the active section's element is rendered, so the other eighteen sections do not mount:
   * building this array creates elements but does not run the components.
   */
  const navGroups: SettingsNavGroup[] = [
    {
      id: "profile",
      title: "Profile",
      icon: UserCircle,
      sections: [
        {
          id: "account-email",
          label: "Digest email",
          hint: "Where alerts are sent",
          node: (
            <Card id="account-email" className="scroll-mt-24 border-border/70 bg-white/85">
              <CardHeader>
                <CardTitle>Digest Email</CardTitle>
                <CardDescription>
                  The weekly digest and operational alerts go to this address. Updating it takes effect from the next send.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex max-w-sm gap-2">
                  <Input
                    type="email"
                    value={digestEmail}
                    onChange={(e) => setDigestEmail(e.target.value)}
                    placeholder="admin@yourestate.com"
                  />
                  <Button onClick={handleSaveDigestEmail} disabled={isSavingDigestEmail}>
                    {isSavingDigestEmail ? "Saving…" : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is your account email — it is not visible to other users.
                </p>
              </CardContent>
            </Card>
          ),
        },
        {
          id: "account-language",
          label: "Language",
          node: (
            <AccountLanguageSection
              preferredLocale={accountPreferredLocale}
              isSaving={isSavingAccountLanguage}
              onPreferredLocaleChange={setAccountPreferredLocale}
              onSave={handleSaveAccountLanguage}
            />
          ),
        },
        {
          id: "account-security",
          label: "Security",
          hint: "Password and sign-in email",
          node: (
            <Card id="account-security" className="scroll-mt-24 border-border/70 bg-white/85">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Account Security
                </CardTitle>
                <CardDescription>Keep your login credentials up to date.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Password</p>
                    <p className="text-xs text-muted-foreground">Update your account login password at any time.</p>
                  </div>
                  <Button asChild variant="outline" className="bg-white shrink-0">
                    <Link href="/settings/reset-password">Change password</Link>
                  </Button>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Email address</p>
                    <p className="text-xs text-muted-foreground">
                      This is your sign-in address and where password resets are sent.
                    </p>
                  </div>
                  <Button asChild variant="outline" className="bg-white shrink-0">
                    <Link href="/settings/email">Change email</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ),
        },
      ],
    },
    ...(isAdminOrOwner
      ? ([
          {
            id: "estate",
            title: "Estate",
            icon: Building2,
            sections: [
              {
                id: "estate-identity",
                label: "Estate identity",
                node: (
                  <EstateIdentitySection
                    estateNameInput={estateNameInput}
                    savedEstateName={settings.estateName || ""}
                    isSavingEstateName={isSavingEstateName}
                    settingsLoading={settingsLoading}
                    onEstateNameChange={setEstateNameInput}
                    onSaveEstateName={handleSaveEstateName}
                  />
                ),
              },
              {
                id: "estate-profile",
                label: "Footprint",
                hint: "Acreage, crops, weather point",
                node: (
                  <EstateProfileSection
                    estateProfileDraft={estateProfileDraft}
                    isSavingEstateProfile={isSavingEstateProfile}
                    settingsLoading={settingsLoading}
                    blockAcreageTotal={blockAcreage.total}
                    blocksWithAcreage={blockAcreage.withArea}
                    blocksTotal={blockAcreage.blocks}
                    onEstateProfileChange={handleEstateProfileChange}
                    onSaveEstateProfile={handleSaveEstateProfile}
                    onGoToLocations={() => setActiveSectionId("locations")}
                  />
                ),
              },
              {
                id: "display-preferences",
                label: "Display",
                node: (
                  <DisplayPreferencesSection
                    uiPreferencesDraft={uiPreferencesDraft}
                    isSavingUiPreferences={isSavingUiPreferences}
                    settingsLoading={settingsLoading}
                    onHideEmptyMetricsChange={handleHideEmptyMetricsChange}
                    onSaveUiPreferences={handleSaveUiPreferences}
                  />
                ),
              },
              {
                id: "thresholds",
                label: "Thresholds",
                hint: "When exceptions are flagged",
                node: (
                  <ThresholdsSection
                    thresholdDraft={thresholdDraft}
                    isSavingThresholds={isSavingThresholds}
                    settingsLoading={settingsLoading}
                    onThresholdFieldChange={updateThresholdField}
                    onTargetFieldChange={updateTargetField}
                    onSaveThresholds={handleSaveThresholds}
                  />
                ),
              },
            ],
          },
          {
            id: "operations",
            title: "Operations",
            icon: Settings2,
            sections: [
              {
                id: "locations",
                label: "Locations",
                hint: locations.length > 0 ? `${locations.length} configured` : "Blocks and estates",
                node: (
                  <LocationsSection
                    locations={locations}
                    newLocationName={newLocationName}
                    newLocationCode={newLocationCode}
                    newLocationEstate={newLocationEstate}
                    isCreatingLocation={isCreatingLocation}
                    editingLocationId={editingLocationId}
                    editingLocationName={editingLocationName}
                    editingLocationCode={editingLocationCode}
                    editingLocationEstate={editingLocationEstate}
                    newLocationArea={newLocationArea}
                    onNewLocationAreaChange={setNewLocationArea}
                    newLocationKind={newLocationKind}
                    onNewLocationKindChange={setNewLocationKind}
                    editingLocationArea={editingLocationArea}
                    onEditingLocationAreaChange={setEditingLocationArea}
                    isUpdatingLocationId={isUpdatingLocationId}
                    onNewLocationNameChange={setNewLocationName}
                    onNewLocationCodeChange={setNewLocationCode}
                    onNewLocationEstateChange={setNewLocationEstate}
                    onCreateLocation={handleCreateLocation}
                    onEditingLocationNameChange={setEditingLocationName}
                    onEditingLocationCodeChange={setEditingLocationCode}
                    onEditingLocationEstateChange={setEditingLocationEstate}
                    onUpdateLocation={handleUpdateLocation}
                    onStartEditLocation={startEditLocation}
                    onDeleteLocation={handleDeleteLocation}
                    isDeletingLocationId={isDeletingLocationId}
                    onCancelEditLocation={cancelEditLocation}
                  />
                ),
              },
              {
                id: "labour-defaults",
                label: "Labour defaults",
                hint: "Default wage rates",
                node: (
                  <LaborDefaultsSection
                    defaultInHouseWage={laborWagesDraft.defaultInHouseWage}
                    defaultOutsideWage={laborWagesDraft.defaultOutsideWage}
                    isSaving={isSavingLaborWages}
                    onInHouseWageChange={(v) => setLaborWagesDraft((prev) => ({ ...prev, defaultInHouseWage: v }))}
                    onOutsideWageChange={(v) => setLaborWagesDraft((prev) => ({ ...prev, defaultOutsideWage: v }))}
                    onSave={handleSaveLaborWages}
                  />
                ),
              },
              { id: "data-import", label: "Import data", node: <DataImportSection /> },
            ],
          },
          {
            id: "user-access",
            title: "User access",
            icon: Users,
            sections: [
              {
                id: "tenant-users",
                label: "People",
                hint: users.length > 0 ? `${users.length} account${users.length !== 1 ? "s" : ""}` : "Add your team",
                node: (
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
                ),
              },
              {
                id: "user-module-overrides",
                label: "Module exceptions",
                hint: "Per-person overrides",
                node: (
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
                ),
              },
              {
                id: "user-location-overrides",
                label: "Location exceptions",
                hint: "Restrict who sees which block",
                node: (
                  <UserLocationOverridesSection
                    tenantId={tenantId}
                    users={users}
                    selectedUserId={selectedUserId}
                    userLocationSource={userLocationSource}
                    userLocationPermissions={userLocationPermissions}
                    isUserLocationsLoading={isUserLocationsLoading}
                    isSavingUserLocations={isSavingUserLocations}
                    onSelectedUserIdChange={setSelectedUserId}
                    onToggleUserLocation={toggleUserLocation}
                    onSaveUserLocations={handleSaveUserLocations}
                    onResetUserLocations={handleResetUserLocations}
                  />
                ),
              },
              ...(isOwner
                ? [{
                    id: "tenant-modules",
                    label: "Allowed modules",
                    hint: `${enabledTenantModuleCount} enabled`,
                    node: (
                      <TenantModulesSection
                        modulePermissions={modulePermissions}
                        tenantId={tenantId}
                        tenantPlanId={tenantPlanId}
                        isSavingModules={isSavingModules}
                        onApplyModuleBundle={applyModuleBundle}
                        onToggleModule={toggleModule}
                        onSaveModules={handleSaveModules}
                      />
                    ),
                  }]
                : []),
            ],
          },
        ] as SettingsNavGroup[])
      : []),
    ...(privacyFeatureEnabled
      ? ([{
          id: "privacy",
          title: "Privacy",
          icon: Lock,
          sections: [{
            id: "privacy-dpdp",
            label: "Privacy & data",
            hint: "Consent, export, deletion",
            node: (
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
            ),
          }],
        }] as SettingsNavGroup[])
      : []),
    ...(isOwner
      ? ([{
          id: "advanced",
          title: "Advanced",
          icon: Layers2,
          sections: [
            { id: "owner-tools", label: "Owner tools", node: <OwnerToolsSection /> },
            ...(canManageTenantExperience
              ? [{
                  id: "tenant-experience",
                  label: "Experience",
                  hint: "Feature flags and variants",
                  node: (
                    <TenantExperienceSection
                      uiVariantDraft={uiVariantDraft}
                      featureFlagsDraft={featureFlagsDraft}
                      isSavingTenantExperience={isSavingTenantExperience}
                      settingsLoading={settingsLoading}
                      onUiVariantChange={setUiVariantDraft}
                      onFeatureFlagChange={handleFeatureFlagChange}
                      onSaveTenantExperience={handleSaveTenantExperience}
                    />
                  ),
                }]
              : []),
            {
              id: "audit-log",
              label: "Audit log",
              node: (
                <AuditLogSection
                  tenantId={tenantId}
                  auditEntityType={auditEntityType}
                  auditLogs={auditLogs}
                  auditTotalCount={auditTotalCount}
                  isAuditLoading={isAuditLoading}
                  onAuditEntityTypeChange={setAuditEntityType}
                  onRefreshAuditLogs={loadAuditLogs}
                />
              ),
            },
          ],
        }] as SettingsNavGroup[])
      : []),
  ]

  const allSections = navGroups.flatMap((group) => group.sections)
  // Falls back to the first section the viewer can see rather than a hardcoded id: a plain `user`
  // sees only the Profile group, so defaulting to an estate section would render a blank pane.
  const activeSection =
    allSections.find((section) => section.id === activeSectionId) ?? allSections[0] ?? null

  const handleSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId)
    // Scroll to the settings area, NOT the document top. Scrolling to 0 puts the page header and
    // the start-here hint on screen instead of the section you just picked, so switching sections
    // looked like it did nothing. Only scroll when the pane has actually drifted off screen --
    // otherwise every click yanks a page that was already in the right place.
    window.requestAnimationFrame(() => {
      const pane = settingsPaneRef.current
      if (!pane) return
      const { top } = pane.getBoundingClientRect()
      if (top < 0 || top > window.innerHeight * 0.4) {
        pane.scrollIntoView({ block: "start", behavior: "smooth" })
      }
    })
  }

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

      <div ref={settingsPaneRef} className="scroll-mt-20 pt-4 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        {/* Mobile: the nav collapses to a single picker. A 19-item sidebar on a phone would
            push the actual settings below the fold on every visit. */}
        <div className="lg:hidden">
          <Label htmlFor="settings-section-picker" className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Section
          </Label>
          <Select value={activeSection?.id ?? ""} onValueChange={handleSelectSection}>
            <SelectTrigger id="settings-section-picker" className="mt-1.5 bg-white">
              <SelectValue placeholder="Choose a section" />
            </SelectTrigger>
            <SelectContent>
              {navGroups.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel>{group.title}</SelectLabel>
                  {group.sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sticky so the section list stays reachable while a long section (People, Audit log)
            scrolls independently. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-[22px] border border-slate-200/80 bg-white/80 p-3 shadow-sm backdrop-blur-sm">
            <SettingsNav
              groups={navGroups}
              activeSectionId={activeSection?.id ?? ""}
              onSelect={handleSelectSection}
            />
          </div>
        </aside>

        <div className="mt-5 min-w-0 space-y-4 lg:mt-0">
          {activeSection ? (
            activeSection.node
          ) : (
            <Card className="border-border/70 bg-white/85">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No settings are available for your account.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </WorkspacePageShell>
  )
}
