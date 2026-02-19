"use client"

import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import InventorySystem from "@/components/inventory-system"

export default function DashboardPage() {
  const { user, status } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
    }
  }, [status, router])

  if (status === "loading") {
    return null
  }

  if (!user) {
    return null
  }

  return <InventorySystem />
}
