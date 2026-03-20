"use client"

import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { MODULE_BUNDLES, type ModuleBundle } from "@/lib/modules"
import { formatDateOnly } from "@/lib/date-utils"
import { roleLabel } from "@/lib/roles"
import type { LocationRow, ModulePermission, RoleOption, User, UserModuleSource } from "@/components/tenant-settings/types"
import { formatUserModuleSource } from "@/components/tenant-settings/utils"

type HelpLabelProps = {
  htmlFor: string
  label: string
  help: string
}

function HelpLabel({ htmlFor, label, help }: HelpLabelProps) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label} help`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

type LocationsSectionProps = {
  locations: LocationRow[]
  newLocationName: string
  newLocationCode: string
  isCreatingLocation: boolean
  editingLocationId: string | null
  editingLocationName: string
  editingLocationCode: string
  isUpdatingLocationId: string | null
  onNewLocationNameChange: (value: string) => void
  onNewLocationCodeChange: (value: string) => void
  onCreateLocation: () => void
  onEditingLocationNameChange: (value: string) => void
  onEditingLocationCodeChange: (value: string) => void
  onUpdateLocation: () => void
  onStartEditLocation: (location: LocationRow) => void
  onCancelEditLocation: () => void
}

export function LocationsSection({
  locations,
  newLocationName,
  newLocationCode,
  isCreatingLocation,
  editingLocationId,
  editingLocationName,
  editingLocationCode,
  isUpdatingLocationId,
  onNewLocationNameChange,
  onNewLocationCodeChange,
  onCreateLocation,
  onEditingLocationNameChange,
  onEditingLocationCodeChange,
  onUpdateLocation,
  onStartEditLocation,
  onCancelEditLocation,
}: LocationsSectionProps) {
  return (
    <Card id="locations" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Locations</CardTitle>
        <CardDescription>Add or edit estate locations used by your team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto]">
          <div className="space-y-2">
            <HelpLabel
              htmlFor="location-name"
              label="Location name"
              help="Use the exact names your team uses in the field."
            />
            <Input
              id="location-name"
              placeholder="Main Estate, Block A, Washing Station"
              value={newLocationName}
              onChange={(event) => onNewLocationNameChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <HelpLabel
              htmlFor="location-code"
              label="Location code (optional)"
              help="Short codes show up in exports and buyer docs."
            />
            <Input
              id="location-code"
              placeholder="MAIN"
              value={newLocationCode}
              onChange={(event) => onNewLocationCodeChange(event.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button onClick={onCreateLocation} disabled={isCreatingLocation} className="w-full">
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
                          onChange={(event) => onEditingLocationNameChange(event.target.value)}
                        />
                      ) : (
                        location.name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingLocationId === location.id ? (
                        <Input
                          value={editingLocationCode}
                          onChange={(event) => onEditingLocationCodeChange(event.target.value)}
                        />
                      ) : (
                        location.code
                      )}
                    </TableCell>
                    <TableCell>
                      {editingLocationId === location.id ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={onUpdateLocation} disabled={isUpdatingLocationId === location.id}>
                            {isUpdatingLocationId === location.id ? "Saving..." : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={onCancelEditLocation}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onStartEditLocation(location)}>
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
  )
}

type TenantModulesSectionProps = {
  modulePermissions: ModulePermission[]
  tenantId: string
  tenantPlanId: string
  isSavingModules: boolean
  onApplyModuleBundle: (bundle: ModuleBundle) => void
  onToggleModule: (moduleId: string) => void
  onSaveModules: () => void
}

export function TenantModulesSection({
  modulePermissions,
  tenantId,
  tenantPlanId,
  isSavingModules,
  onApplyModuleBundle,
  onToggleModule,
  onSaveModules,
}: TenantModulesSectionProps) {
  const activePlan = MODULE_BUNDLES.find((bundle) => bundle.id === tenantPlanId) || MODULE_BUNDLES[0]

  return (
    <Card id="tenant-modules" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenant Modules</CardTitle>
        <CardDescription>
          Control which modules are available to users in this tenant (subject to your subscription plan).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-sm">
          <p className="font-medium text-slate-900">Current plan: {activePlan?.label || "Core"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Modules outside this plan stay locked. That gives you a clean entitlement boundary before you add billing.
          </p>
        </div>
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Module bundles</p>
            <p className="text-xs text-muted-foreground">Choose the tenant plan first, then fine-tune only the modules included in that plan.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE_BUNDLES.map((bundle) => (
              <button
                key={bundle.id}
                type="button"
                onClick={() => onApplyModuleBundle(bundle)}
                className="rounded-lg border border-border/60 bg-white/80 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <p className="text-sm font-medium text-foreground">{bundle.label}</p>
                <p className="text-xs text-muted-foreground">{bundle.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {modulePermissions.map((module) => (
            <label
              key={module.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                module.lockedByPlan ? "border-dashed border-slate-200 bg-slate-50/80 text-slate-500" : "border-border/60 bg-white/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={module.enabled}
                  disabled={module.lockedByPlan}
                  onChange={() => onToggleModule(module.id)}
                />
                <span>{module.label}</span>
              </div>
              {module.lockedByPlan ? <span className="text-[11px] font-medium uppercase tracking-[0.18em]">Locked</span> : null}
            </label>
          ))}
        </div>

        <Button onClick={onSaveModules} disabled={!tenantId || isSavingModules}>
          {isSavingModules ? "Saving..." : "Save Module Access"}
        </Button>
      </CardContent>
    </Card>
  )
}

type TenantUsersSectionProps = {
  tenantId: string
  users: User[]
  newUsername: string
  newPassword: string
  newRole: RoleOption
  userRoleDrafts: Record<string, string>
  isUpdatingUserId: string | null
  isDeletingUserId: string | null
  onNewUsernameChange: (value: string) => void
  onNewPasswordChange: (value: string) => void
  onNewRoleChange: (value: RoleOption) => void
  onCreateUser: () => void
  onRoleDraftChange: (userId: string, role: string) => void
  onSaveUserRole: (user: User) => void
  onDeleteUser: (user: User) => void
}

export function TenantUsersSection({
  tenantId,
  users,
  newUsername,
  newPassword,
  newRole,
  userRoleDrafts,
  isUpdatingUserId,
  isDeletingUserId,
  onNewUsernameChange,
  onNewPasswordChange,
  onNewRoleChange,
  onCreateUser,
  onRoleDraftChange,
  onSaveUserRole,
  onDeleteUser,
}: TenantUsersSectionProps) {
  return (
    <Card id="tenant-users" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenant Users</CardTitle>
        <CardDescription>Invite admins or users and manage roles.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={newUsername} onChange={(event) => onNewUsernameChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={newPassword}
              onChange={(event) => onNewPasswordChange(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={newRole} onValueChange={(value) => onNewRoleChange(value as RoleOption)}>
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

        <Button onClick={onCreateUser} disabled={!tenantId}>
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
                users.map((user) => {
                  const isOwnerUser = user.role === "owner"
                  return (
                    <TableRow key={user.id}>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>
                        {isOwnerUser ? (
                          <div className="text-sm font-medium text-emerald-700">{roleLabel(user.role)}</div>
                        ) : (
                          <Select
                            value={userRoleDrafts[user.id] || user.role}
                            onValueChange={(value) => onRoleDraftChange(user.id, value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Estate Admin</SelectItem>
                              <SelectItem value="user">Estate User</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {isOwnerUser && (
                          <p className="mt-1 text-xs text-muted-foreground">Platform Owner role cannot be modified.</p>
                        )}
                      </TableCell>
                      <TableCell>{formatDateOnly(user.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSaveUserRole(user)}
                            disabled={
                              isOwnerUser ||
                              isUpdatingUserId === user.id ||
                              (userRoleDrafts[user.id] || user.role) === user.role
                            }
                          >
                            {isUpdatingUserId === user.id ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDeleteUser(user)}
                            disabled={isOwnerUser || isDeletingUserId === user.id}
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
  tenantId: string
  users: User[]
  selectedUserId: string
  userModuleSource: UserModuleSource
  enabledUserModuleCount: number
  userModulePermissions: ModulePermission[]
  isSelectedUserRoleScoped: boolean
  isUserModulesLoading: boolean
  isSavingUserModules: boolean
  onSelectedUserIdChange: (value: string) => void
  onToggleUserModule: (moduleId: string) => void
  onSaveUserModules: () => void
  onResetUserModules: () => void
}

export function UserModuleOverridesSection({
  tenantId,
  users,
  selectedUserId,
  userModuleSource,
  enabledUserModuleCount,
  userModulePermissions,
  isSelectedUserRoleScoped,
  isUserModulesLoading,
  isSavingUserModules,
  onSelectedUserIdChange,
  onToggleUserModule,
  onSaveUserModules,
  onResetUserModules,
}: UserModuleOverridesSectionProps) {
  return (
    <Card id="user-module-overrides" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>User Module Overrides</CardTitle>
        <CardDescription>Override tenant defaults for a single user.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Select User</Label>
          <Select value={selectedUserId} onValueChange={onSelectedUserIdChange} disabled={!tenantId || users.length === 0}>
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
          <p className="text-xs text-muted-foreground">Source: {formatUserModuleSource(userModuleSource)}</p>
          <p className="text-xs text-muted-foreground">Enabled for selected user: {enabledUserModuleCount}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {userModulePermissions.map((module) => {
            const isLockedForRole = isSelectedUserRoleScoped && module.id === "balance-sheet"
            const isLockedByPlan = Boolean(module.lockedByPlan)
            return (
              <label
                key={module.id}
                className={`flex items-center gap-2 rounded-lg border p-3 ${
                  isLockedByPlan ? "border-dashed border-slate-200 bg-slate-50/80 text-slate-500" : "border-border/60 bg-white/80"
                }`}
              >
                <input
                  type="checkbox"
                  checked={module.enabled}
                  onChange={() => onToggleUserModule(module.id)}
                  disabled={isUserModulesLoading || isLockedForRole || isLockedByPlan}
                />
                <span>{module.label}</span>
                {isLockedByPlan ? (
                  <span className="ml-auto text-xs text-muted-foreground">Plan locked</span>
                ) : isLockedForRole ? (
                  <span className="ml-auto text-xs text-muted-foreground">Admin only</span>
                ) : null}
              </label>
            )
          })}
        </div>

        {(isSelectedUserRoleScoped || userModulePermissions.some((module) => module.lockedByPlan)) && (
          <p className="text-xs text-muted-foreground">
            {isSelectedUserRoleScoped
              ? "Live Balance Sheet is admin-only and remains disabled for user roles."
              : "Plan-locked modules inherit the tenant subscription ceiling and cannot be granted per user."}
          </p>
        )}

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
