"use client"

import { useCallback, useEffect, useState } from "react"
import posthog from "posthog-js"

import {
  EMPTY_WRITE_QUEUE_STATUS,
  WRITE_QUEUE_STATUS_EVENT,
  parseWriteQueueStatus,
  type WriteQueueStatusSnapshot,
} from "@/lib/write-queue"

/** Give the worker a moment to act before asking what changed. */
const RETRY_SETTLE_MS = 900
const REMOVE_SETTLE_MS = 250

/**
 * Talks to the service worker about the offline write queue: subscribes to its status
 * broadcasts and exposes retry/remove actions.
 *
 * Extracted from components/inventory-system.tsx, where it was ~100 lines of service-worker
 * messaging interleaved with unrelated dashboard state.
 */
export function useWriteQueue() {
  const [status, setStatus] = useState<WriteQueueStatusSnapshot>(EMPTY_WRITE_QUEUE_STATUS)
  const [isRetrying, setIsRetrying] = useState(false)

  // A message is posted to the controller AND to every registration state. During an update
  // the page can be controlled by one worker while the new one is still installing, and only
  // one of them holds the live queue — posting to just the controller loses the message.
  const postToServiceWorker = useCallback((payload: Record<string, unknown>) => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload)
    }
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (!registration) return
        registration.active?.postMessage(payload)
        registration.waiting?.postMessage(payload)
        registration.installing?.postMessage(payload)
      })
      .catch(() => undefined)
  }, [])

  const requestStatus = useCallback(() => {
    postToServiceWorker({ type: "GET_WRITE_QUEUE_STATUS" })
  }, [postToServiceWorker])

  const retry = useCallback(() => {
    setIsRetrying(true)
    postToServiceWorker({ type: "FLUSH_WRITE_QUEUE" })
    posthog.capture("offline_queue_retry_requested", {
      pending_count: status.pendingCount,
      blocked_auth_count: status.blockedAuthCount,
      blocked_review_count: status.blockedReviewCount,
    })
    window.setTimeout(() => {
      requestStatus()
      setIsRetrying(false)
    }, RETRY_SETTLE_MS)
  }, [
    postToServiceWorker,
    requestStatus,
    status.blockedAuthCount,
    status.blockedReviewCount,
    status.pendingCount,
  ])

  const removeEntry = useCallback(
    (entryId: number) => {
      if (!entryId) return
      postToServiceWorker({ type: "DELETE_QUEUED_REQUEST", id: entryId })
      posthog.capture("offline_queue_entry_removed", { queue_entry_id: entryId })
      window.setTimeout(() => {
        requestStatus()
      }, REMOVE_SETTLE_MS)
    },
    [postToServiceWorker, requestStatus],
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleQueueStatusEvent = (rawEvent: Event) => {
      const detail = (rawEvent as CustomEvent<Record<string, unknown>>).detail
      setStatus(parseWriteQueueStatus(detail))
    }

    window.addEventListener(WRITE_QUEUE_STATUS_EVENT, handleQueueStatusEvent as EventListener)
    requestStatus()

    return () => {
      window.removeEventListener(WRITE_QUEUE_STATUS_EVENT, handleQueueStatusEvent as EventListener)
    }
  }, [requestStatus])

  return { status, isRetrying, requestStatus, retry, removeEntry }
}
