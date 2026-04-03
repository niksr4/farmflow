"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateOnly } from "@/lib/date-utils"
import { roleLabel } from "@/lib/roles"
import type {
  AuditLog,
  AuditEntityTypeOption,
  ModulePermission,
  Tenant,
  User,
  UserModuleSource,
} from "@/components/admin/types"
import { formatAuditPayload, formatAuditTimestamp } from "@/components/admin/utils"

type TenantUsersSectionProps = {
  selectedTenant: Tenant | null
  isOwner: boolean
  selectedTenantId: string
  newUsername: string
  newPassword: string
  newRole: string
  users: User[]
  userNameDrafts: Record<string, string>
  userRoleDrafts: Record<string, string>
  isUpdatingUserId: string | null
  isDeletingUserId: string | null
  isResettingPasswordUserId: string | null
  onNewUsernameChange: (value: string) => void
  onNewPasswordChange: (value: string) => void
  onNewRoleChange: (value: string) => void
  onCreateUser: () => void
  onUsernameDraftChange: (userId: string, username: string) => void
  onRoleDraftChange: (userId: string, role: string) => void
  onSaveUserDetails: (user: User) => void
  onResetUserPassword: (user: User) => void
  onDeleteUser: (user: User) => void
}

export function TenantUsersSection({
  selectedTenant,
  isOwner,
  selectedTenantId,
  newUsername,
  newPassword,
  newRole,
  users,
  userNameDrafts,
  userRoleDrafts,
  isUpdatingUserId,
  isDeletingUserId,
  isResettingPasswordUserId,
  onNewUsernameChange,
  onNewPasswordChange,
  onNewRoleChange,
  onCreateUser,
  onUsernameDraftChange,
  onRoleDraftChange,
  onSaveUserDetails,
  onResetUserPassword,
  onDeleteUser,
}: TenantUsersSectionProps) {
  return (
    <Card id="tenant-users" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenant Users</CardTitle>
        <CardDescription>
          {selectedTenant
            ? `Step 2. Add or edit people for ${selectedTenant.name}. They inherit the tenant access settings by default.`
            : isOwner
              ? "Select a tenant"
              : "Step 2. Add or edit people for your estate. They inherit the tenant access settings by default."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={newUsername} onChange={(event) => onNewUsernameChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={newPassword} onChange={(event) => onNewPasswordChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={newRole} onValueChange={onNewRoleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Estate Admin</SelectItem>
                <SelectItem value="user">Estate User</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={onCreateUser} disabled={!selectedTenantId}>
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
                users.map((user) => {
                  const isOwnerUser = user.role === "owner"
                  const normalizedUsername = String(user.username || "").toLowerCase()
                  const isSystemUser =
                    normalizedUsername === "system" ||
                    normalizedUsername.startsWith("system_") ||
                    normalizedUsername.startsWith("system-")
                  const draftUsername = String(userNameDrafts[user.id] ?? user.username)
                  const nextUsername = draftUsername.trim()
                  const nextRole = userRoleDrafts[user.id] ?? user.role

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        {isOwnerUser || isSystemUser ? (
                          user.username
                        ) : (
                          <Input
                            value={draftUsername}
                            onChange={(event) => onUsernameDraftChange(user.id, event.target.value)}
                            className="h-9"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {isOwnerUser ? (
                          <div className="text-sm font-medium text-emerald-700">{roleLabel(user.role)}</div>
                        ) : isSystemUser ? (
                          <div className="text-sm font-medium text-foreground">System Admin</div>
                        ) : (
                          <Select value={nextRole} onValueChange={(value) => onRoleDraftChange(user.id, value)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Estate Admin</SelectItem>
                              <SelectItem value="user">Estate User</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {isOwnerUser ? (
                          <p className="mt-1 text-xs text-muted-foreground">Platform Owner role cannot be modified.</p>
                        ) : null}
                        {isSystemUser ? (
                          <p className="mt-1 text-xs text-muted-foreground">System user is read-only.</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDateOnly(user.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSaveUserDetails(user)}
                            disabled={
                              isOwnerUser ||
                              isSystemUser ||
                              isUpdatingUserId === user.id ||
                              !nextUsername ||
                              (nextRole === user.role && nextUsername === user.username)
                            }
                          >
                            {isUpdatingUserId === user.id ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onResetUserPassword(user)}
                            disabled={isOwnerUser || isSystemUser || isResettingPasswordUserId === user.id}
                          >
                            {isResettingPasswordUserId === user.id ? "Resetting..." : "Reset Password"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDeleteUser(user)}
                            disabled={isOwnerUser || isSystemUser || isDeletingUserId === user.id}
                          >
                            {isDeletingUserId === user.id ? "Deleting..." : "Delete"}
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
  )
}

type UserModuleOverridesSectionProps = {
  selectedTenantId: string
  users: User[]
  selectedUserId: string
  userModulePermissions: ModulePermission[]
  userModuleSource: UserModuleSource
  isUserModulesLoading: boolean
  isSavingUserModules: boolean
  isSelectedUserRoleScoped: boolean
  onSelectedUserIdChange: (value: string) => void
  onToggleUserModule: (moduleId: string) => void
  onSaveUserModules: () => void
  onResetUserModules: () => void
}

export function UserModuleOverridesSection({
  selectedTenantId,
  users,
  selectedUserId,
  userModulePermissions,
  userModuleSource,
  isUserModulesLoading,
  isSavingUserModules,
  isSelectedUserRoleScoped,
  onSelectedUserIdChange,
  onToggleUserModule,
  onSaveUserModules,
  onResetUserModules,
}: UserModuleOverridesSectionProps) {
  const planUserModulePermissions = userModulePermissions.filter((module) => !module.lockedByPlan)
  const ownerOverridePermissions = userModulePermissions.filter((module) => module.lockedByPlan)
  const enabledVisibleModuleCount = userModulePermissions.filter((module) => module.enabled).length

  return (
    <Card id="user-module-overrides" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Per-User Exceptions</CardTitle>
        <CardDescription>
          Step 3. Override tenant defaults only when one person needs exceptional access. Data remains shared within the estate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-sm">
          <p className="font-medium text-amber-950">Keep this rare.</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Most users should stay on tenant defaults. If the owner enabled extra modules outside the plan, they appear separately below.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Select User</Label>
          <Select value={selectedUserId} onValueChange={onSelectedUserIdChange} disabled={!selectedTenantId || users.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder={users.length ? "Choose a user" : "No users available"} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.username} ({roleLabel(user.role)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {userModuleSource
              ? `Source: ${userModuleSource === "user" ? "User exception" : userModuleSource === "tenant" ? "Estate defaults" : "System defaults"}`
              : "Source: System defaults"}
          </p>
          <p className="text-xs text-muted-foreground">
            Enabled for selected user: {enabledVisibleModuleCount} of {userModulePermissions.length} shown
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Modules In Plan</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {planUserModulePermissions.map((module) => {
              const isLockedForRole = isSelectedUserRoleScoped && module.id === "balance-sheet"
              return (
                <label key={module.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/80 p-3">
                  <input
                    type="checkbox"
                    checked={module.enabled}
                    onChange={() => onToggleUserModule(module.id)}
                    disabled={isUserModulesLoading || isLockedForRole}
                  />
                  <span>{module.label}</span>
                  {isLockedForRole ? (
                    <span className="ml-auto text-xs text-muted-foreground">Admin only</span>
                  ) : null}
                </label>
              )
            })}
          </div>
        </div>

        {ownerOverridePermissions.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-900">Owner Override Modules</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {ownerOverridePermissions.map((module) => {
                const isLockedForRole = isSelectedUserRoleScoped && module.id === "balance-sheet"
                return (
                  <label key={module.id} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white/90 p-3">
                    <input
                      type="checkbox"
                      checked={module.enabled}
                      onChange={() => onToggleUserModule(module.id)}
                      disabled={isUserModulesLoading || isLockedForRole}
                    />
                    <span>{module.label}</span>
                    {isLockedForRole ? (
                      <span className="ml-auto text-xs text-muted-foreground">Admin only</span>
                    ) : (
                      <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-amber-900">
                        Outside plan
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}
        {isSelectedUserRoleScoped ? (
          <p className="text-xs text-muted-foreground">
            Live Balance Sheet is admin-only and remains disabled for user roles.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onSaveUserModules} disabled={!selectedUserId || isUserModulesLoading || isSavingUserModules}>
            {isSavingUserModules ? "Saving..." : "Save User Access"}
          </Button>
          <Button variant="outline" onClick={onResetUserModules} disabled={!selectedUserId || isUserModulesLoading}>
            Reset to Tenant Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type AuditLogSectionProps = {
  selectedTenantId: string
  auditEntityType: string
  auditLogs: AuditLog[]
  auditTotalCount: number
  isAuditLoading: boolean
  auditEntityTypes: AuditEntityTypeOption[]
  onAuditEntityTypeChange: (value: string) => void
  onRefreshAuditLogs: () => void
}

export function AuditLogSection({
  selectedTenantId,
  auditEntityType,
  auditLogs,
  auditTotalCount,
  isAuditLoading,
  auditEntityTypes,
  onAuditEntityTypeChange,
  onRefreshAuditLogs,
}: AuditLogSectionProps) {
  return (
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
              <Select value={auditEntityType} onValueChange={onAuditEntityTypeChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {auditEntityTypes.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={onRefreshAuditLogs} disabled={!selectedTenantId || isAuditLoading}>
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
  )
}
