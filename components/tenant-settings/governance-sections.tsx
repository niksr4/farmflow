"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateForDisplay } from "@/lib/date-utils"
import { roleLabel } from "@/lib/roles"
import type { AuditLog, PrivacyStatus } from "@/components/tenant-settings/types"
import { AUDIT_ENTITY_TYPES, formatAuditPayload, formatAuditTimestamp } from "@/components/tenant-settings/utils"

type PrivacySectionProps = {
  tenantId: string
  privacyStatus: PrivacyStatus | null
  privacyError: string | null
  isPrivacyLoading: boolean
  isAcceptingNotice: boolean
  isExportingPersonalData: boolean
  correctionUsername: string
  isSubmittingCorrection: boolean
  isRequestingDeletion: boolean
  isUpdatingConsent: boolean
  onCorrectionUsernameChange: (value: string) => void
  onAcceptNotice: () => void
  onExportPersonalData: () => void
  onSubmitCorrection: () => void
  onRequestDeletion: () => void
  onConsentToggle: (value: boolean) => void
}

export function PrivacySection({
  tenantId,
  privacyStatus,
  privacyError,
  isPrivacyLoading,
  isAcceptingNotice,
  isExportingPersonalData,
  correctionUsername,
  isSubmittingCorrection,
  isRequestingDeletion,
  isUpdatingConsent,
  onCorrectionUsernameChange,
  onAcceptNotice,
  onExportPersonalData,
  onSubmitCorrection,
  onRequestDeletion,
  onConsentToggle,
}: PrivacySectionProps) {
  return (
    <Card id="privacy-dpdp" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <CardTitle>Privacy & DPDP</CardTitle>
        <CardDescription>Manage personal data rights, notices, and consent settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        {privacyError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{privacyError}</div>}

        {isPrivacyLoading ? (
          <div>Loading privacy status...</div>
        ) : (
          <div className="space-y-2 rounded-lg border border-border/60 bg-white/80 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Privacy notice</p>
                <p>
                  Version: {privacyStatus?.noticeVersion || "Not available"}{" "}
                  {privacyStatus?.acceptedAt
                    ? `· Accepted ${formatDateForDisplay(privacyStatus.acceptedAt)}`
                    : "· Not accepted yet"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/privacy">View Notice</Link>
                </Button>
                <Button onClick={onAcceptNotice} disabled={isAcceptingNotice || !tenantId}>
                  {isAcceptingNotice ? "Saving..." : "Acknowledge"}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium text-foreground">Optional product updates</p>
                <p>Allow FarmFlow to send product updates and training materials.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(privacyStatus?.consentMarketing)}
                  onChange={(event) => onConsentToggle(event.target.checked)}
                  disabled={isUpdatingConsent || !tenantId}
                />
                {privacyStatus?.consentMarketing ? "Opted in" : "Opted out"}
              </label>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border/60 bg-white/80 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Export my data</p>
              <p>Download a JSON export of your personal data across FarmFlow.</p>
            </div>
            <Button onClick={onExportPersonalData} disabled={isExportingPersonalData || !tenantId}>
              {isExportingPersonalData ? "Preparing..." : "Download export"}
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 bg-white/80 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Correct my username</p>
              <p>Update the username used across logs and records.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={correctionUsername}
                onChange={(event) => onCorrectionUsernameChange(event.target.value)}
                placeholder="New username"
              />
              <Button onClick={onSubmitCorrection} disabled={isSubmittingCorrection || !tenantId}>
                {isSubmittingCorrection ? "Updating..." : "Update"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">Request deletion or anonymization</p>
          <p>
            We will remove or anonymize your personal data once the request is processed. Some records may be retained
            when required by law.
          </p>
          {privacyStatus?.deletionRequestedAt && (
            <p className="text-xs text-amber-900">
              Request logged on {formatDateForDisplay(privacyStatus.deletionRequestedAt)}.
            </p>
          )}
          <Button variant="destructive" onClick={onRequestDeletion} disabled={isRequestingDeletion || !tenantId}>
            {isRequestingDeletion ? "Submitting..." : "Request deletion"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type AuditLogSectionProps = {
  tenantId: string
  auditEntityType: string
  auditLogs: AuditLog[]
  auditTotalCount: number
  isAuditLoading: boolean
  onAuditEntityTypeChange: (value: string) => void
  onRefreshAuditLogs: () => void
}

export function AuditLogSection({
  tenantId,
  auditEntityType,
  auditLogs,
  auditTotalCount,
  isAuditLoading,
  onAuditEntityTypeChange,
  onRefreshAuditLogs,
}: AuditLogSectionProps) {
  return (
    <Card id="audit-log" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>Track who changed what for this tenant.</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label>Filter</Label>
              <Select value={auditEntityType} onValueChange={onAuditEntityTypeChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
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
            <Button variant="outline" onClick={onRefreshAuditLogs} disabled={!tenantId || isAuditLoading}>
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
          <div className="rounded-lg border border-border/60 bg-white/80">
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
