"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MODULE_BUNDLES } from "@/lib/modules"
import {
  TENANT_FEATURE_FLAG_DEFINITIONS,
  TENANT_UI_VARIANTS,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"
import { formatDateOnly } from "@/lib/date-utils"
import type { ModulePermission, Tenant, TenantProfile } from "@/components/admin/types"

type TenantsSectionProps = {
  tenants: Tenant[]
  selectedTenantId: string
  currentUserTenantId: string | undefined
  newTenantName: string
  previewRole: "admin" | "user"
  isDeletingTenantId: string | null
  onNewTenantNameChange: (value: string) => void
  onCreateTenant: () => void
  onSelectedTenantIdChange: (value: string) => void
  onPreviewRoleChange: (value: "admin" | "user") => void
  onOpenTenantPreview: (openInNewTab?: boolean) => void
  onDeleteTenant: (tenant: Tenant) => void
}

export function TenantsSection({
  tenants,
  selectedTenantId,
  currentUserTenantId,
  newTenantName,
  previewRole,
  isDeletingTenantId,
  onNewTenantNameChange,
  onCreateTenant,
  onSelectedTenantIdChange,
  onPreviewRoleChange,
  onOpenTenantPreview,
  onDeleteTenant,
}: TenantsSectionProps) {
  return (
    <Card id="tenants" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenants</CardTitle>
        <CardDescription>Create and manage estates/tenants.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex-1 space-y-2">
            <Label htmlFor="tenantName">New Tenant</Label>
            <Input
              id="tenantName"
              placeholder="Estate name"
              value={newTenantName}
              onChange={(event) => onNewTenantNameChange(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={onCreateTenant}>Create Tenant</Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Current Tenant</Label>
          <Select value={selectedTenantId} onValueChange={onSelectedTenantIdChange}>
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

        <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
          <div>
            <p className="text-sm font-medium text-emerald-900">Tenant Preview</p>
            <p className="text-xs text-muted-foreground">
              Open dashboard in preview mode to see tabs as a tenant admin or user without logging out.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <Label>Preview role</Label>
              <Select value={previewRole} onValueChange={(value) => onPreviewRoleChange(value === "user" ? "user" : "admin")}>
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
              <Button onClick={() => onOpenTenantPreview(false)} disabled={!selectedTenantId}>
                Open Dashboard Preview
              </Button>
              <Button variant="outline" className="bg-transparent" onClick={() => onOpenTenantPreview(true)} disabled={!selectedTenantId}>
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
                      onClick={() => onDeleteTenant(tenant)}
                      disabled={tenant.id === currentUserTenantId || isDeletingTenantId === tenant.id}
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
  )
}

type TenantProfileSectionProps = {
  selectedTenantId: string
  tenantProfileDraft: TenantProfile
  isTenantProfileLoading: boolean
  isSavingTenantProfile: boolean
  onUiVariantChange: (value: TenantUiVariant) => void
  onFeatureFlagChange: (flagId: keyof TenantFeatureFlags, enabled: boolean) => void
  onSaveTenantProfile: () => void
}

export function TenantProfileSection({
  selectedTenantId,
  tenantProfileDraft,
  isTenantProfileLoading,
  isSavingTenantProfile,
  onUiVariantChange,
  onFeatureFlagChange,
  onSaveTenantProfile,
}: TenantProfileSectionProps) {
  return (
    <Card id="tenant-profile" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenant Experience Profile</CardTitle>
        <CardDescription>Configure UI variant and feature flags for the selected tenant.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedTenantId ? (
          <p className="text-sm text-muted-foreground">Select a tenant first.</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label>UI variant</Label>
              <Select value={tenantProfileDraft.uiVariant} onValueChange={(value) => onUiVariantChange((value || TENANT_UI_VARIANTS[0].id) as TenantUiVariant)} disabled={isTenantProfileLoading}>
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
                <label key={flag.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-white/80 p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(tenantProfileDraft.featureFlags[flag.id])}
                    disabled={isTenantProfileLoading}
                    onChange={(event) => onFeatureFlagChange(flag.id, event.target.checked)}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{flag.label}</p>
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <Button onClick={onSaveTenantProfile} disabled={isTenantProfileLoading || isSavingTenantProfile}>
              {isSavingTenantProfile ? "Saving..." : isTenantProfileLoading ? "Loading..." : "Save Tenant Profile"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

type TenantModulesSectionProps = {
  modulePermissions: ModulePermission[]
  enabledModuleLabels: string[]
  selectedTenantId: string
  onApplyModuleBundle: (bundleId: string) => void
  onToggleModule: (moduleId: string) => void
  onSaveModules: () => void
}

export function TenantModulesSection({
  modulePermissions,
  enabledModuleLabels,
  selectedTenantId,
  onApplyModuleBundle,
  onToggleModule,
  onSaveModules,
}: TenantModulesSectionProps) {
  return (
    <Card id="tenant-modules" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenant Modules</CardTitle>
        <CardDescription>Control which modules are available to users in this tenant.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Enabled modules ({enabledModuleLabels.length})</p>
          <p className="text-xs text-muted-foreground">These are active for the selected tenant.</p>
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
            <p className="text-xs text-muted-foreground">Apply a preset, then adjust individual modules as needed.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE_BUNDLES.map((bundle) => (
              <button
                key={bundle.id}
                type="button"
                onClick={() => onApplyModuleBundle(bundle.id)}
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
            <label key={module.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/80 p-3">
              <input type="checkbox" checked={module.enabled} onChange={() => onToggleModule(module.id)} />
              <span>{module.label}</span>
            </label>
          ))}
        </div>
        <Button onClick={onSaveModules} disabled={!selectedTenantId}>
          Save Module Access
        </Button>
      </CardContent>
    </Card>
  )
}

type SeedDataSectionProps = {
  selectedTenantId: string
  isSeeding: boolean
  onSeedMockData: () => void
}

export function SeedDataSection({ selectedTenantId, isSeeding, onSeedMockData }: SeedDataSectionProps) {
  return (
    <Card id="seed-data" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Seed Tenant Data</CardTitle>
        <CardDescription>
          Generate mock inventory, accounts, processing, dispatch, sales, curing, quality, receivables, and billing records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={onSeedMockData} disabled={!selectedTenantId || isSeeding}>
          {isSeeding ? "Seeding..." : "Seed Mock Data"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Use this for demo tenants. Reseeding replaces existing tenant transaction data. HoneyFarm is intentionally blocked.
        </p>
      </CardContent>
    </Card>
  )
}
