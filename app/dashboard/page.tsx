"use client"

import { useAuth } from "@/hooks/use-auth"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import InventorySystem from "@/components/inventory-system"

function DashboardPageContent() {
  const { user, status } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const previewTenantId = String(searchParams.get("previewTenantId") || "").trim()
  const previewRole = String(searchParams.get("previewRole") || "").toLowerCase()
  const hasOwnerPreview = Boolean(previewTenantId && (previewRole === "admin" || previewRole === "user"))
  const mustCompleteGuidedSetup = shouldForceGuidedSetup({
    role: user?.role,
    requiresGuidedSetup: user?.requiresGuidedSetup,
    setupCompleted: user?.setupCompleted,
  })

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
      return
    }
    if (status === "authenticated" && user?.role === "owner" && !hasOwnerPreview) {
      router.replace("/admin/tenants")
      return
    }
    if (status === "authenticated" && mustCompleteGuidedSetup) {
      router.replace("/welcome")
    }
  }, [hasOwnerPreview, mustCompleteGuidedSetup, router, status, user?.role])

  if (status === "loading") {
    return null
  }

  if (!user) {
    return null
  }

  if (user.role === "owner" && !hasOwnerPreview) {
    return null
  }

  if (mustCompleteGuidedSetup) {
    return null
  }

  return <InventorySystem />
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  )
}
