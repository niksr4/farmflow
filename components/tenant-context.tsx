"use client"

import { useAuth } from "@/hooks/use-auth"

export function useTenant() {
  const { user, status } = useAuth()
  return {
    tenantId: user?.tenantId || null,
    isLoading: status === "loading",
  }
}
