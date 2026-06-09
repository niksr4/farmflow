"use client"

import React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { roleLabel } from "@/lib/roles"

type Props = {
  tenantLabel: string
  effectiveRole: string | null
  onExit: () => void
}

export default function PreviewModeBanner({ tenantLabel, effectiveRole, onExit }: Props) {
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/70">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Tenant Preview Mode</CardTitle>
          <CardDescription>
            Showing tab access for {tenantLabel} as {roleLabel(effectiveRole)}. This is for UI/module preview without re-login.
          </CardDescription>
        </div>
        <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
          Preview
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
        <span>Use this to validate what new tenants will see in navigation and module visibility.</span>
        <Button size="sm" variant="outline" className="bg-white" onClick={onExit}>
          Exit preview
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/admin/tenants">Back to Owner Console</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
