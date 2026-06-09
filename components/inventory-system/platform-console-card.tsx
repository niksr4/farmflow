"use client"

import React from "react"
import Link from "next/link"
import { Settings, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function PlatformConsoleCard() {
  return (
    <Card className="border-2 border-muted bg-white/90">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Platform Console</CardTitle>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Platform Owner
          </Badge>
        </div>
        <CardDescription>Company-wide controls for tenants, access, and data health.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col lg:flex-row gap-6 lg:items-start">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="text-sm">Use this console to keep tenant access clean and onboarding smooth.</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Create tenants and users for new estates.</li>
            <li>Enable/disable modules per tenant.</li>
            <li>Seed demo data for trials and onboarding.</li>
            <li>Inspect database health and table sizes.</li>
          </ul>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild variant="outline" className="bg-transparent">
            <Link href="/admin/tenants">
              <Users className="h-4 w-4 mr-2" />
              Manage Tenants
            </Link>
          </Button>
          <Button asChild variant="outline" className="bg-transparent">
            <Link href="/admin/inspect-databases">
              <Settings className="h-4 w-4 mr-2" />
              Inspect Databases
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
