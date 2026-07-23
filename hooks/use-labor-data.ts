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
  taskDescription?: string
  user: string
  locationId?: string | null
  updatedAt?: string
}

type LaborDataOptions = {
  pageSize?: number
  startDate?: string
  endDate?: string
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
  const startDate = options.startDate
  const endDate = options.endDate

  const fetchDeployments = useCallback(
    async (pageIndex = 0, append = false) => {
      if (status === "loading") {
        return
      }
      if (!user?.tenantId) {
        setDeployments([])
        setLoading(false)
        setLoadingMore(false)
        setHasMore(false)
        setPage(0)
        setTotalCount(0)
        setTotalCost(0)
        setError(null)
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
        if (startDate && endDate) {
          query.set("startDate", startDate)
          query.set("endDate", endDate)
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
          console.error("❌ Labour API error:", response.status, responseText)
          setError(responseText || `Failed to load deployments (${response.status})`)
          setDeployments([])
          setHasMore(false)
          setTotalCount(0)
          setTotalCost(0)
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
          // Backward-compat for older response shape.
          const nextDeployments = data.transactions
          const nextTotalCount = Number(data.totalCount) || nextDeployments.length
          const nextTotalCost =
            Number(data.totalCost) ||
            nextDeployments.reduce((sum: number, row: any) => sum + (Number(row?.totalCost) || 0), 0)
          setDeployments(nextDeployments)
          setTotalCount(nextTotalCount)
          setTotalCost(nextTotalCost)
          setHasMore(false)
          setPage(pageIndex)
          setError(null)
        } else {
          console.error("❌ Invalid response format:", data)
          setError(data.message || "Failed to load deployments")
          setDeployments([])
          setHasMore(false)
          setTotalCount(0)
          setTotalCost(0)
        }
      } catch (err: any) {
        console.error("❌ Error fetching labour deployments:", err)
        setError(err.message || "Failed to fetch deployments")
        setDeployments([])
        setHasMore(false)
        setTotalCount(0)
        setTotalCost(0)
      } finally {
        if (append) {
          setLoadingMore(false)
        } else {
          setLoading(false)
        }
      }
    },
    [endDate, locationId, pageSize, startDate, status, user?.tenantId],
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

  const addDeployment = async (deployment: Omit<LaborDeployment, "id" | "totalCost" | "updatedAt">): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch("/api/labor-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // deployment's own locationId (a per-entry form field) wins over the hook-scope
        // default — the spread order matters here, don't swap it back.
        body: JSON.stringify({ locationId, ...deployment }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false)
        setError(null)
        return { ok: true }
      } else {
        console.error("❌ Failed to add deployment:", data.message)
        setError(data.message || "Failed to add deployment")
        return { ok: false, error: data.message || "Failed to save labour record" }
      }
    } catch (err: any) {
      console.error("❌ Error adding deployment:", err)
      setError(err.message || "Failed to add deployment")
      return { ok: false, error: "Network error — labour record may not have saved" }
    }
  }

  const updateDeployment = async (
    id: string,
    deployment: Omit<LaborDeployment, "id" | "totalCost" | "user" | "updatedAt">,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch("/api/labor-neon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, id, ...deployment }),
      })

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false)
        setError(null)
        return { ok: true }
      } else {
        console.error("❌ Failed to update deployment:", data.message)
        setError(data.message || "Failed to update deployment")
        return { ok: false, error: data.message || "Failed to update labour record" }
      }
    } catch (err: any) {
      console.error("❌ Error updating deployment:", err)
      setError(err.message || "Failed to update deployment")
      return { ok: false, error: "Network error — labour record may not have saved" }
    }
  }

  const deleteDeployment = async (id: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const response = await fetch(
        `/api/labor-neon?id=${id}${locationId ? `&locationId=${locationId}` : ""}`,
        { method: "DELETE" },
      )

      const data = await response.json()

      if (data.success) {
        await fetchDeployments(0, false)
        setError(null)
        return { ok: true }
      } else {
        console.error("❌ Failed to delete deployment:", data.message)
        setError(data.message || "Failed to delete deployment")
        return { ok: false, error: data.message || "Failed to delete labour record" }
      }
    } catch (err: any) {
      console.error("❌ Error deleting deployment:", err)
      setError(err.message || "Failed to delete deployment")
      return { ok: false, error: "Network error — labour record may not have deleted" }
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
