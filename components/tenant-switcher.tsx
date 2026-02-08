"use client"

import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"

export function TenantSwitcher() {
  const { user } = useAuth()

  if (!user?.tenantId) {
    return (
      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
        No tenant
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
      Tenant {user.tenantId.slice(0, 8)}
    </Badge>
  )
}
