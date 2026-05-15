"use client"

import { Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { MODULE_BUNDLES, filterPlanVisibleModules, type ModuleBundle } from "@/lib/modules"
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
    <Card id="locations" className="scroll-mt-24 overflow-hidden border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Locations</CardTitle>
        <CardDescription>Add or edit estate locations used by your team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40 p-4 shadow-sm">
            <p className="text-sm font-semibold text-emerald-950">Set locations before the team starts entering daily work.</p>
            <p className="mt-1 text-sm leading-6 text-emerald-900/80">
              Each location becomes a reporting bucket across processing, dispatch, rainfall, and seasonal reporting.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Naming pattern that keeps things clean</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              Use the full branch or unit name for staff-facing labels, and keep the optional code short for exports and
              shorthand only.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto]">
            <div className="space-y-2">
              <HelpLabel
                htmlFor="location-name"
                label="Location name"
                help="Use the full place label your team recognizes day to day, for example Seshagiri A."
              />
              <Input
                id="location-name"
                placeholder="Seshagiri A, Main Estate, Washing Station"
                value={newLocationName}
                onChange={(event) => onNewLocationNameChange(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <HelpLabel
                htmlFor="location-code"
                label="Location code (optional)"
                help="Use a short shorthand like A, B, C or SG-A. This appears in exports and buyer-facing documents."
              />
              <Input
                id="location-code"
                placeholder="A or SG-A"
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
        </div>

        <p className="text-xs text-muted-foreground">
          Use <span className="font-medium text-foreground">Location name</span> for the full branch or unit label, such as
          {" "}
          <span className="font-medium text-foreground">Seshagiri A</span>. Use <span className="font-medium text-foreground">Location code</span>
          {" "}
          only for the short shorthand, such as <span className="font-medium text-foreground">A</span> or
          {" "}
          <span className="font-medium text-foreground">SG-A</span>.
        </p>

        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Saved locations</p>
          <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
            {locations.length} total
          </Badge>
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
                        location.code || "-"
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
  const visibleModulePermissions = filterPlanVisibleModules(modulePermissions)
  const enabledModuleCount = visibleModulePermissions.filter((module) => module.enabled).length

  return (
    <Card id="tenant-modules" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Allowed Modules</CardTitle>
        <CardDescription>
          Step 1. Choose the estate plan, then fine-tune only the modules that belong to that plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm shadow-sm">
            <p className="font-medium text-slate-900">Current plan: {activePlan?.label || "Core"}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Only modules included in this plan are shown below. Anything outside the plan stays out of view until the
              estate moves to a higher plan.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm shadow-sm">
            <p className="font-medium text-amber-950">Keep module changes rare and intentional.</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">
              Most estates should apply the right bundle, then only fine-tune inside the plan when there is a clear
              operational reason.
            </p>
          </div>
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

        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Modules In This Plan</p>
          <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
            {enabledModuleCount} enabled / {visibleModulePermissions.length} shown
          </Badge>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm shadow-sm">
          <p className="font-medium text-emerald-900">Users inherit this list by default.</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            Set the estate-level access here first. Per-user changes belong in the exceptions section later.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleModulePermissions.map((module) => (
            <label
              key={module.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-white/80 p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={module.enabled}
                  onChange={() => onToggleModule(module.id)}
                />
                <span className="flex items-center gap-2">
                  <span>{module.label}</span>
                  {module.enabled ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50/80 text-emerald-700">
                      Enabled
                    </Badge>
                  ) : null}
                </span>
              </div>
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
    <Card id="tenant-users" className="scroll-mt-24 overflow-hidden border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>People and Roles</CardTitle>
        <CardDescription>Step 2. Add people and roles. Everyone starts from the estate access set above.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50/80 text-emerald-700">
                Add only what you need
              </Badge>
              <p className="text-xs text-muted-foreground">Most estates only need 1 or 2 admins.</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
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

            <div className="mt-4">
              <Button onClick={onCreateUser} disabled={!tenantId}>
                Create User
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
              <p className="text-sm font-medium text-emerald-900">Estate Admin</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Best for supervisors or office staff who manage setup, people, locations, and day-to-day records.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-900">Estate User</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                Best for staff who mainly enter daily work. Give this role first unless the person truly manages the workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 shadow-sm">
              <p className="text-sm font-medium text-amber-950">Keep this simple</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                Fewer admins means fewer accidental setting changes. Add admin access only for people who truly supervise the estate setup.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current users</p>
          <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
            {users.length} total
          </Badge>
        </div>

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
  const visibleUserModulePermissions = filterPlanVisibleModules(userModulePermissions)

  return (
    <Card id="user-module-overrides" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Per-User Exceptions</CardTitle>
        <CardDescription>
          Step 3. Use this only when one person should have different access than the rest of the estate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm shadow-sm">
          <p className="font-medium text-amber-950">Use this only for exceptions.</p>
          <p className="mt-1 text-xs leading-5 text-amber-900/80">
            Most estates should leave users on estate defaults. Only modules included in the current plan appear here,
            and special rules are harder to explain and maintain.
          </p>
        </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              Source: {formatUserModuleSource(userModuleSource)}
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
              {enabledUserModuleCount} enabled / {visibleUserModulePermissions.length} shown
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleUserModulePermissions.map((module) => {
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

        {isSelectedUserRoleScoped && (
          <p className="text-xs text-muted-foreground">
            Live Balance Sheet is admin-only and remains disabled for user roles.
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

type LaborDefaultsSectionProps = {
  defaultInHouseWage: number
  defaultOutsideWage: number
  isSaving: boolean
  onInHouseWageChange: (value: number) => void
  onOutsideWageChange: (value: number) => void
  onSave: () => void
}

export function LaborDefaultsSection({
  defaultInHouseWage,
  defaultOutsideWage,
  isSaving,
  onInHouseWageChange,
  onOutsideWageChange,
  onSave,
}: LaborDefaultsSectionProps) {
  return (
    <Card id="labor-defaults">
      <CardHeader>
        <CardTitle>Labor wage defaults</CardTitle>
        <CardDescription>
          Set the default wage rates that pre-fill when logging a new labor entry. Each entry can still be adjusted individually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <HelpLabel
              htmlFor="default-inhouse-wage"
              label="In-house wage (₹ per worker)"
              help="Wage for estate-employed workers. Pre-fills the In-house group when you open a new labor entry."
            />
            <Input
              id="default-inhouse-wage"
              type="number"
              min={0}
              step={1}
              value={defaultInHouseWage}
              onChange={(e) => onInHouseWageChange(Number(e.target.value) || 0)}
              className="h-11"
              placeholder="e.g. 475"
            />
          </div>
          <div className="space-y-2">
            <HelpLabel
              htmlFor="default-outside-wage"
              label="Outside wage (₹ per worker)"
              help="Wage for contract or outside workers. Pre-fills the Outside group when you open a new labor entry."
            />
            <Input
              id="default-outside-wage"
              type="number"
              min={0}
              step={1}
              value={defaultOutsideWage}
              onChange={(e) => onOutsideWageChange(Number(e.target.value) || 0)}
              className="h-11"
              placeholder="e.g. 450"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          These are starting defaults only. You can override the wage on any individual entry or add extra labor groups at any time.
        </p>
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save labor defaults"}
        </Button>
      </CardContent>
    </Card>
  )
}
