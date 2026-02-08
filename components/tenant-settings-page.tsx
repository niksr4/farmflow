"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { AlertThresholds, useTenantSettings } from "@/hooks/use-tenant-settings"
import { MODULES } from "@/lib/modules"
import { formatDateForDisplay, formatDateOnly } from "@/lib/date-utils"

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

  useEffect(() => {
    setEstateNameInput(settings.estateName || "")
  }, [settings.estateName])

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
    if (!tenantId) return
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
  }, [tenantId, toast])

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
    if (!tenantId) return
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
  }, [auditEntityType, tenantId, toast])

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
    loadUsers()
    loadModules()
    loadAuditLogs()
    loadLocations()
  }, [tenantId, loadAuditLogs, loadLocations, loadModules, loadUsers])

  useEffect(() => {
    if (tenantId) {
      loadAuditLogs()
    }
  }, [auditEntityType, tenantId, loadAuditLogs])

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
    if (selectedUserId) {
      loadUserModules(selectedUserId)
      return
    }
    setUserModulePermissions(MODULES.map((module) => ({ ...module, enabled: module.defaultEnabled !== false })))
    setUserModuleSource("default")
  }, [selectedUserId, loadUserModules])

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
      toast({ title: "Role updated", description: `${user.username} is now ${nextRole}.` })
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
      prev.map((module) => (module.id === moduleId ? { ...module, enabled: !module.enabled } : module)),
    )
  }

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline gap-3">
            Tenant Settings
            <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">FarmFlow</span>
          </CardTitle>
          <CardDescription>Manage users, access, locations, and audits for this estate.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tenant ID: <span className="font-mono text-foreground">{tenantId || "Unavailable"}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estate Identity</CardTitle>
          <CardDescription>
            Set the estate name shown in the dashboard. The system name remains “FarmFlow.”
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="estate-name">Estate name</Label>
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

      <Card>
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

      <Card>
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
                  <Label htmlFor="threshold-float">Float rate increase (ratio)</Label>
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
                  <Label htmlFor="threshold-yield">Dry parch yield drop (ratio)</Label>
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
                  <Label htmlFor="threshold-mismatch">Inventory mismatch buffer (KGs)</Label>
                  <Input
                    id="threshold-mismatch"
                    type="number"
                    step="1"
                    value={thresholdDraft.mismatchBufferKgs}
                    onChange={(event) => updateThresholdField("mismatchBufferKgs", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold-dispatch">Dispatch unconfirmed days</Label>
                  <Input
                    id="threshold-dispatch"
                    type="number"
                    step="1"
                    value={thresholdDraft.dispatchUnconfirmedDays}
                    onChange={(event) => updateThresholdField("dispatchUnconfirmedDays", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold-bagweight">Bag weight drift (ratio)</Label>
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
                  <Label htmlFor="threshold-minkgs">Minimum KGs for signal</Label>
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
                    <Label htmlFor="target-yield">Target dry parch yield from ripe</Label>
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
                    <Label htmlFor="target-loss">Target transit loss %</Label>
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
                    <Label htmlFor="target-price">Target avg price/kg (INR)</Label>
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
                    <Label htmlFor="target-float">Target float rate</Label>
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

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
          <CardDescription>Add or edit estate locations (HF, MV, PG, etc.).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="location-name">Location name</Label>
              <Input
                id="location-name"
                placeholder="HF, MV, PG"
                value={newLocationName}
                onChange={(event) => setNewLocationName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-code">Location code (optional)</Label>
              <Input
                id="location-code"
                placeholder="HF"
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

          <div className="rounded-md border">
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

      <Card>
        <CardHeader>
          <CardTitle>Tenant Modules</CardTitle>
          <CardDescription>
            Control which modules are available to users in this tenant (subject to your subscription plan).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modulePermissions.map((module) => (
              <label key={module.id} className="flex items-center gap-2 border rounded-md p-3">
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

      <Card>
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
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="user">user</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreateUser} disabled={!tenantId}>
            Create User
          </Button>

          <div className="rounded-md border">
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
                        <Select
                          value={userRoleDrafts[u.id] || u.role}
                          onValueChange={(value) => handleRoleDraftChange(u.id, value)}
                          disabled={isOwnerUser}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="user">user</SelectItem>
                          </SelectContent>
                        </Select>
                        {isOwnerUser && (
                          <p className="mt-1 text-xs text-muted-foreground">Owner role cannot be modified.</p>
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

      <Card>
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
                    {u.username} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {userModuleSource
                ? `Source: ${userModuleSource === "user" ? "User override" : userModuleSource === "tenant" ? "Tenant defaults" : "System defaults"}`
                : "Source: System defaults"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {userModulePermissions.map((module) => (
              <label key={module.id} className="flex items-center gap-2 border rounded-md p-3">
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

      <Card>
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
            <div className="rounded-md border">
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
                        <span className="text-xs text-muted-foreground"> ({log.role})</span>
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
    </div>
  )
}
