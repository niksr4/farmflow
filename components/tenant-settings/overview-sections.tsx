"use client"

import Link from "next/link"
import { Compass, Info, LogOut } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LocaleSelector } from "@/components/locale-selector"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/components/locale-provider"
import {
  TENANT_FEATURE_FLAG_DEFINITIONS,
  TENANT_UI_VARIANTS,
  type TenantFeatureFlags,
  type TenantUiVariant,
} from "@/lib/tenant-experience"
import type { TenantEstateProfile } from "@/lib/tenant-estate-profile"
import type { AppLocale } from "@/lib/i18n"
import type { SectionLink, UiPreferencesDraft } from "@/components/tenant-settings/types"
import WorkspaceNavigatorBackButton from "@/components/workspace-navigator-back-button"

type TenantSettingsOverviewProps = {
  tenantId: string
  userCount: number
  locationCount: number
  isOwner: boolean
  enabledTenantModuleCount: number
  roleDisplay: string
  sectionLinks: SectionLink[]
  onLogout: () => void
}

export function TenantSettingsOverview({
  tenantId,
  userCount,
  locationCount,
  isOwner,
  enabledTenantModuleCount,
  roleDisplay,
  sectionLinks,
  onLogout,
}: TenantSettingsOverviewProps) {
  // Only the "start here" trio survives. The three flow cards and the Quick jump chip wall both
  // existed to get you to a section -- which is now the sidebar's entire job, permanently on
  // screen. Keeping them cost roughly a full viewport above the settings themselves, so clicking
  // a section appeared to do nothing: the pane it swapped was below the fold.
  const startSections = sectionLinks.filter((section) =>
    ["estate-identity", "locations", "tenant-users"].includes(section.id),
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WorkspaceNavigatorBackButton />
        <Button variant="outline" size="sm" className="bg-white/80" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>

      {startSections.length > 0 ? (
        <Card
          id="settings-overview"
          className="scroll-mt-24 border-emerald-200/70 bg-emerald-50/50"
        >
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-900">Setting up? Start with</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {startSections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-white"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}

export function OwnerToolsSection() {
  return (
    <Card id="owner-tools" className="scroll-mt-24 border-emerald-200/70 bg-emerald-50/60">
      <CardHeader>
        <CardTitle>Owner Tools</CardTitle>
        <CardDescription>Tenant management and wider platform controls are available from a separate owner area.</CardDescription>
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
        <p className="text-xs text-emerald-800">Estate settings stay here. Wider platform controls are available from the owner area.</p>
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
  const estateLabelPreview = savedEstateName || estateNameInput.trim() || "Estate Name"

  return (
    <Card id="estate-identity" className="scroll-mt-24 overflow-hidden border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Estate Identity</CardTitle>
        <CardDescription>
          Set the estate name shown in the dashboard. The system name remains &quot;FarmFlow.&quot;
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50/80 text-emerald-700">
                Used everywhere
              </Badge>
              <p className="text-xs text-muted-foreground">Most estates set this once and rarely change it.</p>
            </div>

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
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50/70 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Live preview</p>
            <p className="mt-3 text-xl font-semibold text-foreground">{estateLabelPreview}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This label shows in the workspace header, exports, reporting views, and buyer-facing documents.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-5 text-slate-700">
          <span className="font-semibold text-slate-900">Keep it simple:</span> use the estate name your staff and buyers already recognize.
          Avoid internal codes here unless that is how the estate is genuinely known.
        </div>
      </CardContent>
    </Card>
  )
}

type EstateProfileSectionProps = {
  estateProfileDraft: TenantEstateProfile
  isSavingEstateProfile: boolean
  settingsLoading: boolean
  /** Sum of every block's acreage. The estate does not carry an acreage of its own. */
  blockAcreageTotal: number | null
  blocksWithAcreage: number
  blocksTotal: number
  onEstateProfileChange: (patch: Partial<TenantEstateProfile>) => void
  onSaveEstateProfile: () => void
  onGoToLocations: () => void
}

export function EstateProfileSection({
  estateProfileDraft,
  isSavingEstateProfile,
  settingsLoading,
  blockAcreageTotal,
  blocksWithAcreage,
  blocksTotal,
  onGoToLocations,
  onEstateProfileChange,
  onSaveEstateProfile,
}: EstateProfileSectionProps) {
  return (
    <Card id="estate-profile" className="scroll-mt-24 overflow-hidden border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Estate Footprint & Weather</CardTitle>
        <CardDescription>
          Acreage adds up from your blocks. Set the weather coordinates here so planning views use the right baseline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40 p-4 shadow-sm">
            <div className="space-y-1">
              <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                Planning baseline
              </Badge>
              <p className="text-base font-semibold text-foreground">Your planted area, added up from every block.</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Give each block its area in Locations and this fills itself in — along with cost per acre on the Costs tab.
              </p>
            </div>

            {/* Derived, not typed. This was a free-text acreage sitting beside a per-block acreage
                in Locations -- two independently editable numbers for one physical fact, which
                drift the first time a block is split or sold and then quietly disagree forever.
                The block is the thing that has an area; the estate is the sum of its blocks. Both
                were empty on every tenant, so making this derived costs nothing and closes the
                gap before anyone types a number into it. */}
            <div className="space-y-2">
              <Label>Acreage (acres)</Label>
              <div className="rounded-xl border border-emerald-100 bg-white/85 px-4 py-3">
                {blockAcreageTotal != null ? (
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {blockAcreageTotal.toLocaleString("en-IN")} <span className="text-base font-normal text-muted-foreground">acres</span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-amber-700">Not set on any block yet</p>
                )}
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {blocksTotal === 0
                    ? "Add your blocks first, then give each one its area."
                    : blocksWithAcreage === 0
                      ? `None of your ${blocksTotal} blocks has an area yet.`
                      : blocksWithAcreage === blocksTotal
                        ? `Added up from all ${blocksTotal} blocks.`
                        : `From ${blocksWithAcreage} of ${blocksTotal} blocks — the other ${blocksTotal - blocksWithAcreage} have no area set, so this total is short.`}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onGoToLocations}>
                Set acreage per block
              </Button>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-white/85 p-3 text-xs leading-5 text-emerald-900">
              <span className="font-semibold">Why per block:</span> cost per acre is only comparable if each
              block carries its own area. One estate-wide number cannot tell you which block is expensive.
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/70 via-white to-sky-50/50 p-4 shadow-sm">
            <div className="space-y-1">
              <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                Exact weather pin
              </Badge>
              <p className="text-base font-semibold text-foreground">Lock forecasts to the real estate instead of a broad regional fallback.</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Save both latitude and longitude when you want rainfall and weather views to reflect the exact estate.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="weather-location-label">Weather location label</Label>
                <Input
                  id="weather-location-label"
                  placeholder="e.g. Laxmi Main Estate"
                  value={estateProfileDraft.weatherLocationLabel || ""}
                  onChange={(event) => onEstateProfileChange({ weatherLocationLabel: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weather-latitude">Latitude</Label>
                <Input
                  id="weather-latitude"
                  type="number"
                  inputMode="decimal"
                  min="-90"
                  max="90"
                  step="0.0001"
                  placeholder="12.4244"
                  value={estateProfileDraft.weatherLatitude ?? ""}
                  onChange={(event) =>
                    onEstateProfileChange({
                      weatherLatitude: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weather-longitude">Longitude</Label>
                <Input
                  id="weather-longitude"
                  type="number"
                  inputMode="decimal"
                  min="-180"
                  max="180"
                  step="0.0001"
                  placeholder="75.7382"
                  value={estateProfileDraft.weatherLongitude ?? ""}
                  onChange={(event) =>
                    onEstateProfileChange({
                      weatherLongitude: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-cyan-100 bg-white/85 p-3 text-xs leading-5 text-cyan-950">
              Leave coordinates blank to use the default regional weather fallback. Add both latitude and longitude to
              lock the forecast to the exact estate.
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted-foreground">
            Acreage strengthens season benchmarking. Exact coordinates strengthen weather accuracy. Save both here once,
            then leave the rest of the app to use them.
          </p>
          <Button onClick={onSaveEstateProfile} disabled={isSavingEstateProfile || settingsLoading}>
            {isSavingEstateProfile ? "Saving..." : "Save Estate Profile"}
          </Button>
        </div>
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
        <CardDescription>Hide empty highlights on the dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-white/90 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Hide empty metrics</p>
            <p className="text-xs text-muted-foreground">
              Removes 0-value highlights like &quot;24h activity&quot; when there is no recent activity.
            </p>
          </div>
          <Switch
            checked={uiPreferencesDraft.hideEmptyMetrics}
            onCheckedChange={onHideEmptyMetricsChange}
            disabled={settingsLoading}
          />
        </div>
        <Button onClick={onSaveUiPreferences} disabled={isSavingUiPreferences || settingsLoading}>
          {isSavingUiPreferences ? "Saving..." : "Save Preferences"}
        </Button>
      </CardContent>
    </Card>
  )
}

type AccountLanguageSectionProps = {
  preferredLocale: AppLocale
  isSaving: boolean
  onPreferredLocaleChange: (value: AppLocale) => void
  onSave: () => void
}

export function AccountLanguageSection({
  preferredLocale,
  isSaving,
  onPreferredLocaleChange,
  onSave,
}: AccountLanguageSectionProps) {
  const { t } = useLocale()

  return (
    <Card id="account-language" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>{t("settings.languageTitle")}</CardTitle>
        <CardDescription>{t("settings.languageDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-2">
          <Label>{t("common.language")}</Label>
          <LocaleSelector value={preferredLocale} onValueChange={onPreferredLocaleChange} />
        </div>
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? t("common.saving") : t("settings.saveLanguage")}
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
            <div key={flag.id} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-white/80 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{flag.label}</p>
                <p className="text-xs text-muted-foreground">{flag.description}</p>
              </div>
              <Switch
                checked={Boolean(featureFlagsDraft[flag.id])}
                onCheckedChange={(checked) => onFeatureFlagChange(flag.id, checked)}
                disabled={settingsLoading}
              />
            </div>
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
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/50 p-4 text-amber-950 shadow-sm">
          <p className="font-semibold">Best used during onboarding or history backfill</p>
          <p className="mt-1 text-sm leading-6 text-amber-900/80">
            Use this when you already have CSVs from paper records, Excel sheets, or a previous system. Once the estate
            is live, most day-to-day work should happen directly inside the app.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Import processing, dispatch, sales, pepper, rainfall, inventory, and accounts data.</p>
          <Button asChild>
            <Link href="/settings/import">Open Data Import</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
