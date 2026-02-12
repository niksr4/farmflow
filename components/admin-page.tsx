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
import { MODULES } from "@/lib/modules"
import { formatDateForDisplay, formatDateOnly } from "@/lib/date-utils"
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

const formatAuditPayload = (payload: any) => {
  if (!payload) return "None"
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export default function AdminPage() {
  const { user, isOwner } = useAuth()
  const { toast } = useToast()


  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string>("")
  const [newTenantName, setNewTenantName] = useState("")

  const [users, setUsers] = useState<User[]>([])
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("user")

  const [modulePermissions, setModulePermissions] = useState<ModulePermission[]>([])
  const [isSeeding, setIsSeeding] = useState(false)
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, string>>({})
  const [isUpdatingUserId, setIsUpdatingUserId] = useState<string | null>(null)
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [userModulePermissions, setUserModulePermissions] = useState<ModulePermission[]>([])
  const [userModuleSource, setUserModuleSource] = useState<"user" | "tenant" | "default" | "">("")
  const [isUserModulesLoading, setIsUserModulesLoading] = useState(false)
  const [isSavingUserModules, setIsSavingUserModules] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotalCount, setAuditTotalCount] = useState(0)
  const [auditEntityType, setAuditEntityType] = useState("all")
  const [isAuditLoading, setIsAuditLoading] = useState(false)

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [tenants, selectedTenantId],
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
    }
  }, [selectedTenantId, loadModules, loadUsers])

  useEffect(() => {
    if (selectedTenantId) {
      loadAuditLogs(selectedTenantId, auditEntityType)
    }
  }, [selectedTenantId, auditEntityType, loadAuditLogs])

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

  const toggleUserModule = (moduleId: string) => {
    setUserModulePermissions((prev) =>
      prev.map((module) => (module.id === moduleId ? { ...module, enabled: !module.enabled } : module)),
    )
  }

  const handleSaveModules = async () => {
    if (!isOwner) {
      toast({ title: "Owner access only", description: "Only owners can change tenant modules." })
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

    setIsSeeding(true)
    try {
      const response = await fetch("/api/admin/seed-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to seed tenant data")
      }
      toast({ title: "Mock data added", description: "Sample records are ready for this tenant." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to seed tenant data", variant: "destructive" })
    } finally {
      setIsSeeding(false)
    }
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <Card>
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
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Tenant Modules</CardTitle>
            <CardDescription>Control which modules are available to users in this tenant.</CardDescription>
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
            <Button onClick={handleSaveModules} disabled={!selectedTenantId}>
              Save Module Access
            </Button>
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Seed Tenant Data</CardTitle>
            <CardDescription>Generate mock inventory, accounts, processing, dispatch, and sales records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSeedMockData} disabled={!selectedTenantId || isSeeding}>
              {isSeeding ? "Seeding..." : "Seed Mock Data"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Use this for demo tenants that should start with sample data.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
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
                          <div className="text-sm font-medium text-slate-700">System Admin</div>
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
                          <p className="mt-1 text-xs text-muted-foreground">Super Admin role cannot be modified.</p>
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

      <Card>
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
    </div>
  )
}
