"use client"

import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SectionLink, Tenant } from "@/components/admin/types"

type ConsoleOverviewSectionProps = {
  isOwner: boolean
  selectedTenant: Tenant | null
  selectedTenantId: string
  previewRole: "admin" | "user"
  usersCount: number
  enabledModuleCount: number
  tenantsCount: number
  auditTotalCount: number
  ownerSectionLinks: SectionLink[]
  onOpenTenantPreview: (openInNewTab?: boolean) => void
  onLogout: () => void
}

export function ConsoleOverviewSection({
  isOwner,
  selectedTenant,
  selectedTenantId,
  previewRole,
  usersCount,
  enabledModuleCount,
  tenantsCount,
  auditTotalCount,
  ownerSectionLinks,
  onOpenTenantPreview,
  onLogout,
}: ConsoleOverviewSectionProps) {
  return (
    <Card
      id="console-overview"
      className="scroll-mt-24 border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50"
    >
      <CardHeader>
        <CardTitle>{isOwner ? "Owner Console" : "Admin Console"}</CardTitle>
        <CardDescription>
          {isOwner
            ? "Manage tenants, preview experiences, seed demo data, and control platform access."
            : "Manage people, allowed modules, and rare per-user exceptions for your tenant."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Selected Tenant</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{selectedTenant?.name || "Not selected"}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Tenant ID</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{selectedTenantId || "Unavailable"}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Users Loaded</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{usersCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Modules Enabled</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{enabledModuleCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">{isOwner ? "Tenants" : "Audit Events"}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{isOwner ? tenantsCount : auditTotalCount}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ownerSectionLinks.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-full border border-border/70 bg-white/90 px-3 py-1 text-xs text-foreground transition hover:border-emerald-200 hover:text-emerald-700"
            >
              {section.label}
            </a>
          ))}
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            {selectedTenantId && (
              <>
                <Button size="sm" onClick={() => onOpenTenantPreview(false)}>
                  Preview as {previewRole === "admin" ? "Estate Admin" : "Estate User"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenTenantPreview(true)}>
                  Preview in new tab
                </Button>
              </>
            )}
            <Button asChild size="sm" variant="outline">
              <a href="/admin/register-interest">Request Access Inbox</a>
            </Button>
            <Button size="sm" variant="outline" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
