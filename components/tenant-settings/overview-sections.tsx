"use client"

import Link from "next/link"
import { ArrowLeft, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  TENANT_FEATURE_FLAG_DEFINITIONS,
  TENANT_UI_VARIANTS,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"
import type { SectionLink, UiPreferencesDraft } from "@/components/tenant-settings/types"

type TenantSettingsOverviewProps = {
  tenantId: string
  userCount: number
  locationCount: number
  isOwner: boolean
  enabledTenantModuleCount: number
  roleDisplay: string
  sectionLinks: SectionLink[]
}

export function TenantSettingsOverview({
  tenantId,
  userCount,
  locationCount,
  isOwner,
  enabledTenantModuleCount,
  roleDisplay,
  sectionLinks,
}: TenantSettingsOverviewProps) {
  return (
    <>
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
              <p className="mt-1 text-lg font-semibold text-foreground">{userCount}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Locations</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{locationCount}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">
                {isOwner ? "Modules Enabled" : "Your Role"}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {isOwner ? enabledTenantModuleCount : roleDisplay}
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
    </>
  )
}

export function OwnerToolsSection() {
  return (
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
  )
}

type EstateIdentitySectionProps = {
  estateNameInput: string
  savedEstateName: string
  isSavingEstateName: boolean
  settingsLoading: boolean
  onEstateNameChange: (value: string) => void
  onSaveEstateName: () => void
}

export function EstateIdentitySection({
  estateNameInput,
  savedEstateName,
  isSavingEstateName,
  settingsLoading,
  onEstateNameChange,
  onSaveEstateName,
}: EstateIdentitySectionProps) {
  return (
    <Card id="estate-identity" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Estate Identity</CardTitle>
        <CardDescription>
          Set the estate name shown in the dashboard. The system name remains &quot;FarmFlow.&quot;
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[2fr_auto]">
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
              onChange={(event) => onEstateNameChange(event.target.value)}
            />
          </div>
          <Button onClick={onSaveEstateName} disabled={isSavingEstateName || settingsLoading}>
            {isSavingEstateName ? "Saving..." : settingsLoading ? "Loading..." : "Save Estate Name"}
          </Button>
        </div>

        {savedEstateName ? (
          <p className="text-xs text-muted-foreground">Currently displayed as: {savedEstateName}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No estate name saved yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

type DisplayPreferencesSectionProps = {
  uiPreferencesDraft: UiPreferencesDraft
  isSavingUiPreferences: boolean
  settingsLoading: boolean
  onHideEmptyMetricsChange: (value: boolean) => void
  onSaveUiPreferences: () => void
}

export function DisplayPreferencesSection({
  uiPreferencesDraft,
  isSavingUiPreferences,
  settingsLoading,
  onHideEmptyMetricsChange,
  onSaveUiPreferences,
}: DisplayPreferencesSectionProps) {
  return (
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
            onChange={(event) => onHideEmptyMetricsChange(event.target.checked)}
          />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Hide empty metrics</p>
            <p className="text-xs text-muted-foreground">
              Removes 0-value highlights like &quot;24h activity&quot; when there is no recent activity.
            </p>
          </div>
        </label>
        <Button onClick={onSaveUiPreferences} disabled={isSavingUiPreferences || settingsLoading}>
          {isSavingUiPreferences ? "Saving..." : "Save Preferences"}
        </Button>
      </CardContent>
    </Card>
  )
}

type TenantExperienceSectionProps = {
  uiVariantDraft: TenantUiVariant
  featureFlagsDraft: TenantFeatureFlags
  isSavingTenantExperience: boolean
  settingsLoading: boolean
  onUiVariantChange: (value: TenantUiVariant) => void
  onFeatureFlagChange: (flagId: keyof TenantFeatureFlags, enabled: boolean) => void
  onSaveTenantExperience: () => void
}

export function TenantExperienceSection({
  uiVariantDraft,
  featureFlagsDraft,
  isSavingTenantExperience,
  settingsLoading,
  onUiVariantChange,
  onFeatureFlagChange,
  onSaveTenantExperience,
}: TenantExperienceSectionProps) {
  return (
    <Card id="tenant-experience" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Tenant Experience Profile</CardTitle>
        <CardDescription>Choose a UI variant and tenant-level feature flags for this estate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>UI variant</Label>
          <Select value={uiVariantDraft} onValueChange={(value) => onUiVariantChange(value as TenantUiVariant)}>
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
            <label key={flag.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-white/80 p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(featureFlagsDraft[flag.id])}
                onChange={(event) => onFeatureFlagChange(flag.id, event.target.checked)}
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{flag.label}</p>
                <p className="text-xs text-muted-foreground">{flag.description}</p>
              </div>
            </label>
          ))}
        </div>

        <Button onClick={onSaveTenantExperience} disabled={isSavingTenantExperience || settingsLoading}>
          {isSavingTenantExperience ? "Saving..." : "Save Experience Profile"}
        </Button>
      </CardContent>
    </Card>
  )
}

export function DataImportSection() {
  return (
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
  )
}
