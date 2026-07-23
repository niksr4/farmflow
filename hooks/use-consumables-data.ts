"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/use-auth"

export interface ConsumableDeployment {
  id: number
  date: string
  code: string
  reference: string
  amount: number
  notes: string
  user: string
  locationId?: string | null
  inventoryItems?: Array<{ itemType: string; quantity: number }>
  inventoryItemType?: string | null
  inventoryQuantity?: number | null
}

type ConsumablesDataOptions = {
  pageSize?: number
  startDate?: string
  endDate?: string
}

export function useConsumablesData(locationId?: string, options: ConsumablesDataOptions = {}) {
  const { user } = useAuth()
  const [deployments, setDeployments] = useState<ConsumableDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = options.pageSize ?? 50
  const startDate = options.startDate
  const endDate = options.endDate

  const fetchDeployments = useCallback(
    async (pageIndex = 0, append = false) => {
      try {
        if (!user?.tenantId) {
          setDeployments([])
          setLoading(false)
          setLoadingMore(false)
          setHasMore(false)
          setPage(0)
          setTotalCount(0)
          setTotalAmount(0)
          return
        }
        if (append) {
          setLoadingMore(true)
        } else {
          setLoading(true)
        }

        const query = new URLSearchParams()
        query.set("limit", pageSize.toString())
        query.set("offset", String(pageIndex * pageSize))
        if (locationId) {
          query.set("locationId", locationId)
        }
        if (startDate && endDate) {
          query.set("startDate", startDate)
          query.set("endDate", endDate)
        }

        const response = await fetch(`/api/expenses-neon?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        })
        if (!response.ok) {
          const errorText = await response.text()
          console.error("❌ Failed to load deployments:", errorText)
          setDeployments([])
          setHasMore(false)
          setTotalCount(0)
          setTotalAmount(0)
          return
        }
        const data = await response.json()

        if (data.success && Array.isArray(data.deployments)) {
          const nextTotalCount = Number(data.totalCount) || 0
          const nextTotalAmount = Number(data.totalAmount) || 0
          setTotalCount(nextTotalCount)
          setTotalAmount(nextTotalAmount)
          setDeployments((prev) => {
            const nextDeployments = append ? [...prev, ...data.deployments] : data.deployments
            const canPaginate = pageSize > 0
            const hasNextPage = canPaginate
              ? nextTotalCount
                ? nextDeployments.length < nextTotalCount
                : data.deployments.length === pageSize
              : false
            setHasMore(hasNextPage)
            return nextDeployments
          })
          setPage(pageIndex)
        } else {
          console.error("❌ Failed to load deployments:", data)
          setDeployments([])
          setHasMore(false)
          setTotalCount(0)
          setTotalAmount(0)
        }
      } catch (error) {
        console.error("❌ Error fetching deployments:", error)
        setDeployments([])
        setHasMore(false)
        setTotalCount(0)
        setTotalAmount(0)
      } finally {
        if (append) {
          setLoadingMore(false)
        } else {
          setLoading(false)
        }
      }
    },
    [endDate, locationId, pageSize, startDate, user?.tenantId],
  )

  useEffect(() => {
    fetchDeployments()
  }, [fetchDeployments])

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) {
      return
    }
    await fetchDeployments(page + 1, true)
  }, [fetchDeployments, hasMore, loading, loadingMore, page])

  const addDeployment = async (deployment: Omit<ConsumableDeployment, "id">): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch("/api/expenses-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // deployment's own locationId (a per-entry form field) wins over the hook-scope
        // default — the spread order matters here, don't swap it back.
        body: JSON.stringify({ locationId, ...deployment }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false) // Refresh the list
        return { ok: true }
      } else {
        console.error("❌ Failed to add deployment:", data)
        return { ok: false, error: data.error || "Failed to save expense" }
      }
    } catch (error) {
      console.error("❌ Error adding deployment:", error)
      return { ok: false, error: "Network error — expense may not have saved" }
    }
  }

  const updateDeployment = async (id: number, deployment: Omit<ConsumableDeployment, "id" | "user">): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch("/api/expenses-neon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, id, ...deployment }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false) // Refresh the list
        return { ok: true }
      } else {
        console.error("❌ Failed to update deployment:", data)
        return { ok: false, error: data.error || "Failed to update expense" }
      }
    } catch (error) {
      console.error("❌ Error updating deployment:", error)
      return { ok: false, error: "Network error — expense may not have saved" }
    }
  }

  const deleteDeployment = async (id: number): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch(`/api/expenses-neon?id=${id}${locationId ? `&locationId=${locationId}` : ""}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false) // Refresh the list
        return { ok: true }
      } else {
        console.error("❌ Failed to delete deployment:", data)
        return { ok: false, error: data.error || "Failed to delete expense" }
      }
    } catch (error) {
      console.error("❌ Error deleting deployment:", error)
      return { ok: false, error: "Network error — expense may not have deleted" }
    }
  }

  return {
    deployments,
    loading,
    loadingMore,
    totalCount,
    totalAmount,
    hasMore,
    loadMore,
    addDeployment,
    updateDeployment,
    deleteDeployment,
    refetch: fetchDeployments,
  }
}
