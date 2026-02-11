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
}

type ConsumablesDataOptions = {
  pageSize?: number
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

  const fetchDeployments = useCallback(
    async (pageIndex = 0, append = false) => {
      try {
        if (!user?.tenantId) {
          setLoading(false)
          setHasMore(false)
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

        const response = await fetch(`/api/expenses-neon?${query.toString()}`)
        if (!response.ok) {
          const errorText = await response.text()
          console.error("❌ Failed to load deployments:", errorText)
          setDeployments([])
          setHasMore(false)
          return
        }
        const data = await response.json()


        if (data.success && data.deployments) {
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
        }
      } catch (error) {
        console.error("❌ Error fetching deployments:", error)
        setDeployments([])
        setHasMore(false)
      } finally {
        if (append) {
          setLoadingMore(false)
        } else {
          setLoading(false)
        }
      }
    },
    [locationId, pageSize, user?.tenantId],
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

  const addDeployment = async (deployment: Omit<ConsumableDeployment, "id">) => {
    try {

      const response = await fetch("/api/expenses-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...deployment, locationId }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false) // Refresh the list
      } else {
        console.error("❌ Failed to add deployment:", data)
      }
    } catch (error) {
      console.error("❌ Error adding deployment:", error)
    }
  }

  const updateDeployment = async (id: number, deployment: Omit<ConsumableDeployment, "id" | "user">) => {
    try {

      const response = await fetch("/api/expenses-neon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...deployment, locationId }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false) // Refresh the list
      } else {
        console.error("❌ Failed to update deployment:", data)
      }
    } catch (error) {
      console.error("❌ Error updating deployment:", error)
    }
  }

  const deleteDeployment = async (id: number) => {
    try {

      const response = await fetch(`/api/expenses-neon?id=${id}${locationId ? `&locationId=${locationId}` : ""}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false) // Refresh the list
      } else {
        console.error("❌ Failed to delete deployment:", data)
      }
    } catch (error) {
      console.error("❌ Error deleting deployment:", error)
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
