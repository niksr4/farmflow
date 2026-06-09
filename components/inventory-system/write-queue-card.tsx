"use client"

import React from "react"
import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type BlockedEntry = {
  id: number
  method: string
  pathname: string
  url: string
  queuedAt: number
  attempts: number
  lastError?: string
  lastStatus?: number | null
}

type WriteQueueStatus = {
  pendingCount: number
  blockedAuthCount: number
  blockedReviewCount: number
  blockedAuthEntries: BlockedEntry[]
  blockedReviewEntries: BlockedEntry[]
}

type Props = {
  status: WriteQueueStatus
  isRetrying: boolean
  onRetry: () => void
  onOpenFix: (entry: BlockedEntry) => void
  onRemoveEntry: (id: number) => void
  onLogout: () => void
}

export default function WriteQueueCard({ status, isRetrying, onRetry, onOpenFix, onRemoveEntry, onLogout }: Props) {
  return (
    <Card className="mb-4 border-amber-200 bg-amber-50/70">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Offline Sync Queue</CardTitle>
            <CardDescription>
              {status.pendingCount} queued update{status.pendingCount === 1 ? "" : "s"} pending.
              {status.blockedAuthCount > 0
                ? ` ${status.blockedAuthCount} need sign-in.`
                : status.blockedReviewCount > 0
                  ? ` ${status.blockedReviewCount} need manual review.`
                  : " Waiting for retry."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-white"
              disabled={isRetrying}
              onClick={onRetry}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
              {isRetrying ? "Retrying..." : "Retry Sync"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.blockedAuthEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">Sign-in required</p>
            {status.blockedAuthEntries.slice(0, 3).map((entry) => (
              <div key={`auth-${entry.id}`} className="rounded-lg border border-rose-200 bg-white p-3">
                <p className="text-sm font-medium text-rose-800">
                  #{entry.id} {entry.method} {entry.pathname || entry.url}
                </p>
                <p className="mt-1 text-xs text-rose-700">
                  {entry.lastStatus ? `HTTP ${entry.lastStatus}` : "Authentication required"} · Attempts {entry.attempts}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="bg-white" onClick={() => onOpenFix(entry)}>
                    Open Fix
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => void onLogout()}>
                    Sign In Again
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {status.blockedReviewEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">Review required</p>
            {status.blockedReviewEntries.slice(0, 5).map((entry) => (
              <div key={`review-${entry.id}`} className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="text-sm font-medium text-amber-900">
                  #{entry.id} {entry.method} {entry.pathname || entry.url}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {entry.lastStatus ? `HTTP ${entry.lastStatus}` : "Server rejected the request"} · Attempts {entry.attempts}
                  {entry.queuedAt > 0 ? ` · Queued ${new Date(entry.queuedAt).toLocaleString()}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.lastError || "Re-open the matching module, correct the value, then retry sync."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="bg-white" onClick={() => onOpenFix(entry)}>
                    Open Fix
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => onRemoveEntry(entry.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
