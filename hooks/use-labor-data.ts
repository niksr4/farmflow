"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/use-auth"
import { trackRecordCreated } from "@/lib/track-action"
import { useAbortableRequests } from "@/hooks/use-abortable"
import { isAbortError } from "@/lib/abortable"

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
  const [allLoaded, setAllLoaded] = useState(false)
  const pageSize = options.pageSize ?? 50
  const startDate = options.startDate
  const endDate = options.endDate

  // Reads only. This hook's list load is fired from an effect, from "load more", from
  // "load all", and again after every mutation — without cancellation a burst of those
  // leaves several full history downloads racing, and whichever lands last wins regardless
  // of which was asked for most recently. The mutations below are deliberately NOT routed
  // through this: aborting a write does not un-commit it on the server.
  const listRequests = useAbortableRequests()

  const fetchDeployments = useCallback(
    async (pageIndex = 0, append = false, fetchAll = false) => {
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
      // Issued before the try so the catch/finally can tell "we cancelled this" apart from
      // "this failed", and leave the state owned by whichever request superseded it.
      const signal = listRequests.next()
      try {
        if (append) {
          setLoadingMore(true)
        } else {
          setLoading(true)
        }
        setError(null)

        const query = new URLSearchParams()
        if (fetchAll) {
          // all=true makes the API ignore limit/offset and return every row. Used when a search
          // is active: filtering happens client-side, so anything still behind "Load more" is
          // invisible to it and the user gets "no entries match" for codes that plainly exist.
          query.set("all", "true")
        } else {
          query.set("limit", pageSize.toString())
          query.set("offset", String(pageIndex * pageSize))
        }
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
          signal,
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
          let nextDeploymentsLength = 0
          setDeployments((prev) => {
            const nextDeployments = append ? [...prev, ...data.deployments] : data.deployments
            nextDeploymentsLength = nextDeployments.length
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
          setAllLoaded(fetchAll || (nextTotalCount > 0 && nextDeploymentsLength >= nextTotalCount))
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
        // A superseded or unmounted request is not a failure — blanking the list and showing
        // an error here would make fast navigation look like the app breaking.
        if (isAbortError(err)) return
        console.error("❌ Error fetching labour deployments:", err)
        setError(err.message || "Failed to fetch deployments")
        setDeployments([])
        setHasMore(false)
        setTotalCount(0)
        setTotalCost(0)
      } finally {
        // Only the request that still owns the slot may clear the spinner; otherwise a
        // cancelled request turns off the loading state the live one is relying on.
        if (!signal.aborted) {
          if (append) {
            setLoadingMore(false)
          } else {
            setLoading(false)
          }
        }
      }
    },
    [endDate, listRequests, locationId, pageSize, startDate, status, user?.tenantId],
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
        trackRecordCreated("labour", {
          tenant_id: user?.tenantId,
          code: deployment.code,
          location_id: deployment.locationId ?? locationId ?? null,
        })
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
    allLoaded,
    /** Pull the full history in one request — needed before any client-side search is meaningful. */
    loadAll: () => fetchDeployments(0, false, true),
    addDeployment,
    updateDeployment,
    deleteDeployment,
    refetch: fetchDeployments,
  }
}
