"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/use-auth"

export interface LaborEntry {
  name?: string
  laborCount: number
  costPerLabor: number
}

export interface LaborDeployment {
  id: string
  code: string
  reference: string
  laborEntries: LaborEntry[]
  totalCost: number
  date: string
  notes?: string
  user: string
  updatedAt?: string
}

type LaborDataOptions = {
  pageSize?: number
}

export function useLaborData(locationId?: string, options: LaborDataOptions = {}) {
  const { user, status } = useAuth()
  const [deployments, setDeployments] = useState<LaborDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = options.pageSize ?? 50

  const fetchDeployments = useCallback(
    async (pageIndex = 0, append = false) => {
      if (status === "loading") {
        return
      }
      if (!user?.tenantId) {
        setLoading(false)
        setHasMore(false)
        setTotalCount(0)
        setTotalCost(0)
        return
      }
      try {
        if (append) {
          setLoadingMore(true)
        } else {
          setLoading(true)
        }
        setError(null)

      const query = new URLSearchParams()
      query.set("limit", pageSize.toString())
      query.set("offset", String(pageIndex * pageSize))
        if (locationId) {
          query.set("locationId", locationId)
        }

        const response = await fetch(`/api/labor-neon?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        })

        const responseText = await response.text()
        let data: any = null
        try {
          data = responseText ? JSON.parse(responseText) : null
        } catch {
          data = null
        }

        if (!response.ok) {
          console.error("❌ Labor API error:", response.status, responseText)
          setError(responseText || `Failed to load deployments (${response.status})`)
          setDeployments([])
          setHasMore(false)
          return
        }


        if (data.success && Array.isArray(data.deployments)) {
          const nextTotalCount = Number(data.totalCount) || 0
          const nextTotalCost = Number(data.totalCost) || 0
          setTotalCount(nextTotalCount)
          setTotalCost(nextTotalCost)
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
          setError(null)
        } else if (data.success && Array.isArray(data.transactions)) {
          // Handle case where API returns transactions instead of deployments
          setDeployments(data.transactions)
          setHasMore(false)
          setError(null)
        } else {
          console.error("❌ Invalid response format:", data)
          setError(data.message || "Failed to load deployments")
          setDeployments([])
          setHasMore(false)
        }
      } catch (err: any) {
        console.error("❌ Error fetching labor deployments:", err)
        setError(err.message || "Failed to fetch deployments")
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
    [locationId, pageSize, status, user?.tenantId],
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

  const addDeployment = async (deployment: Omit<LaborDeployment, "id" | "totalCost" | "updatedAt">) => {
    try {

      const response = await fetch("/api/labor-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...deployment, locationId }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false)
        setError(null)
        return true
      } else {
        console.error("❌ Failed to add deployment:", data.message)
        setError(data.message || "Failed to add deployment")
        return false
      }
    } catch (err: any) {
      console.error("❌ Error adding deployment:", err)
      setError(err.message || "Failed to add deployment")
      return false
    }
  }

  const updateDeployment = async (
    id: string,
    deployment: Omit<LaborDeployment, "id" | "totalCost" | "user" | "updatedAt">,
  ) => {
    try {

      const response = await fetch("/api/labor-neon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...deployment, locationId }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false)
        setError(null)
        return true
      } else {
        console.error("❌ Failed to update deployment:", data.message)
        setError(data.message || "Failed to update deployment")
        return false
      }
    } catch (err: any) {
      console.error("❌ Error updating deployment:", err)
      setError(err.message || "Failed to update deployment")
      return false
    }
  }

  const deleteDeployment = async (id: string) => {
    try {

      const response = await fetch(
        `/api/labor-neon?id=${id}${locationId ? `&locationId=${locationId}` : ""}`,
        {
          method: "DELETE",
                  },
      )

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false)
        setError(null)
        return true
      } else {
        console.error("❌ Failed to delete deployment:", data.message)
        setError(data.message || "Failed to delete deployment")
        return false
      }
    } catch (err: any) {
      console.error("❌ Error deleting deployment:", err)
      setError(err.message || "Failed to delete deployment")
      return false
    }
  }

  return {
    deployments,
    loading,
    loadingMore,
    error,
    totalCount,
    totalCost,
    hasMore,
    loadMore,
    addDeployment,
    updateDeployment,
    deleteDeployment,
    refetch: fetchDeployments,
  }
}
