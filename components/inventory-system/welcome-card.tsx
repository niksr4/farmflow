"use client"

import React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  buildWorkspaceHref: (path: string) => string
  isAdmin: boolean
  canShowResources: boolean
  onTabChange: (tab: string) => void
  onDismiss: () => void
}

export default function WelcomeCard({
  buildWorkspaceHref,
  isAdmin,
  canShowResources,
  onTabChange,
  onDismiss,
}: Props) {
  return (
    <Card className="mb-6 border-emerald-100 bg-emerald-50/70">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Welcome to your estate workspace</CardTitle>
          <CardDescription>
            Start by adding locations and logging your first pulping output. Everything else builds on those
            records.
          </CardDescription>
        </div>
        <Badge variant="outline" className="bg-white text-emerald-700 border-emerald-200">
          First login
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Use the checklist below to get to a live, traceable setup in under 10 minutes.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onTabChange("inventory")}>Start setup</Button>
          <Button asChild variant="outline" className="bg-transparent">
            <Link href={buildWorkspaceHref("/manuals")}>Open training manuals</Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline" className="bg-transparent">
              <Link href={buildWorkspaceHref("/settings")}>Manage users</Link>
            </Button>
          )}
          {canShowResources && (
            <Button variant="outline" className="bg-transparent" onClick={() => onTabChange("resources")}>
              Open resources
            </Button>
          )}
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
