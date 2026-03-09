"use client"

import { useEffect, useRef } from "react"
import { toast } from "@/components/ui/use-toast"

const ENABLE_PWA_IN_DEV = process.env.NEXT_PUBLIC_ENABLE_PWA_DEV === "true"
const SHOULD_REGISTER_SW = process.env.NODE_ENV === "production" || ENABLE_PWA_IN_DEV
const SYNC_TAG = "farmflow-sync-writes"
const WRITE_QUEUE_STATUS_EVENT = "farmflow:write-queue-status"
const parseNumberEnv = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(raw || "")
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}
const RUNTIME_SW_CONFIG = {
  navigationCache: process.env.NEXT_PUBLIC_PWA_NAV_CACHE !== "false",
  staticAssetCache: process.env.NEXT_PUBLIC_PWA_STATIC_CACHE !== "false",
  readApiCache: process.env.NEXT_PUBLIC_PWA_READ_API_CACHE !== "false",
  writeQueue: process.env.NEXT_PUBLIC_PWA_WRITE_QUEUE !== "false",
  readApiTimeoutMs: parseNumberEnv(process.env.NEXT_PUBLIC_PWA_READ_API_TIMEOUT_MS, 3500, 800, 30000),
  writeTimeoutMs: parseNumberEnv(process.env.NEXT_PUBLIC_PWA_WRITE_TIMEOUT_MS, 12000, 800, 30000),
  maxWriteQueueEntries: parseNumberEnv(process.env.NEXT_PUBLIC_PWA_WRITE_QUEUE_MAX, 400, 50, 2000),
}

const isSecureRuntime = () => {
  if (typeof window === "undefined") return false
  const host = String(window.location.hostname || "").toLowerCase()
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1"
  return window.isSecureContext || isLocalHost
}

type ServiceWorkerMessage = {
  type?: string
  reason?: string
  pendingCount?: number
  syncedCount?: number
  remaining?: number
  droppedCount?: number
  trimmedCount?: number
  blockedCount?: number
  blockedAuthCount?: number
  blockedReviewCount?: number
  reviewCount?: number
  status?: number
  updatedAt?: number
  blockedAuthEntries?: Array<{
    id: number
    method: string
    pathname: string
    url: string
    queuedAt: number
    attempts: number
    lastError?: string
    lastStatus?: number | null
    blockedReason?: string
  }>
  blockedReviewEntries?: Array<{
    id: number
    method: string
    pathname: string
    url: string
    queuedAt: number
    attempts: number
    lastError?: string
    lastStatus?: number | null
    blockedReason?: string
  }>
}

export default function PwaRegister() {
  const lastPendingCountRef = useRef(0)
  const lastAuthRequiredPendingRef = useRef(0)
  const lastReviewRequiredPendingRef = useRef(0)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!SHOULD_REGISTER_SW || typeof window === "undefined" || !("serviceWorker" in navigator) || !isSecureRuntime()) {
      return
    }

    let active = true
    let messageHandler: ((event: MessageEvent<ServiceWorkerMessage>) => void) | null = null
    let onlineHandler: (() => void) | null = null
    let controllerChangeHandler: (() => void) | null = null
    let visibilityHandler: (() => void) | null = null

    const postMessageToRegistration = (payload: object) => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(payload)
      }
      const registration = registrationRef.current
      registration?.active?.postMessage(payload)
      registration?.waiting?.postMessage(payload)
      registration?.installing?.postMessage(payload)
    }

    const emitQueueStatusEvent = (detail: ServiceWorkerMessage) => {
      window.dispatchEvent(new CustomEvent<ServiceWorkerMessage>(WRITE_QUEUE_STATUS_EVENT, { detail }))
    }

    const syncRuntimeConfig = () => {
      postMessageToRegistration({
        type: "SET_RUNTIME_CONFIG",
        config: RUNTIME_SW_CONFIG,
      })
    }

    const flushQueue = () => {
      postMessageToRegistration({ type: "FLUSH_WRITE_QUEUE" })
    }

    const requestQueueStatus = () => {
      postMessageToRegistration({ type: "GET_WRITE_QUEUE_STATUS" })
    }

    ;(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
        if (!active) return
        registrationRef.current = registration
        void registration.update().catch(() => undefined)
        syncRuntimeConfig()

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" })
        }

        const syncManager = (registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> }
        }).sync
        if (syncManager) {
          try {
            await syncManager.register(SYNC_TAG)
          } catch {
            // Background sync is optional; we still flush on `online`.
          }
        }

        messageHandler = (event: MessageEvent<ServiceWorkerMessage>) => {
          const data = event.data || {}
          if (!data.type) return

          if (data.type === "WRITE_QUEUED") {
            const pendingCount = Number(data.pendingCount || 0)
            if (pendingCount > 0 && pendingCount !== lastPendingCountRef.current) {
              lastPendingCountRef.current = pendingCount
              toast({
                title: "Saved offline",
                description: `No connection right now. ${pendingCount} update${pendingCount === 1 ? "" : "s"} queued.`,
              })
            }
            emitQueueStatusEvent(data)
            return
          }

          if (data.type === "WRITE_QUEUE_FLUSHED" && Number(data.syncedCount || 0) > 0) {
            const syncedCount = Number(data.syncedCount || 0)
            const remaining = Number(data.remaining || 0)
            lastPendingCountRef.current = remaining
            if (remaining === 0) {
              lastAuthRequiredPendingRef.current = 0
              lastReviewRequiredPendingRef.current = 0
            }
            toast({
              title: "Offline updates synced",
              description: `${syncedCount} queued update${syncedCount === 1 ? "" : "s"} sent.`,
            })
            emitQueueStatusEvent(data)
            return
          }

          if (data.type === "WRITE_QUEUE_AUTH_REQUIRED") {
            const pendingCount = Number(data.pendingCount || 0)
            const blockedCount = Number(data.blockedCount || 0)
            if (pendingCount > 0 && pendingCount !== lastAuthRequiredPendingRef.current) {
              lastAuthRequiredPendingRef.current = pendingCount
              toast({
                title: "Sign in required to finish sync",
                description: `${blockedCount || 1} queued update${blockedCount === 1 ? "" : "s"} need a fresh login. ${pendingCount} still pending.`,
                variant: "destructive",
              })
            }
            emitQueueStatusEvent(data)
            return
          }

          if (data.type === "WRITE_QUEUE_REVIEW_REQUIRED") {
            const reviewCount = Number(data.reviewCount || 0)
            const pendingCount = Number(data.pendingCount || 0)
            if (reviewCount > 0 && pendingCount !== lastReviewRequiredPendingRef.current) {
              lastReviewRequiredPendingRef.current = pendingCount
              toast({
                title: "Queued updates need review",
                description: `${reviewCount} queued update${reviewCount === 1 ? "" : "s"} were rejected by the server and need manual retry.`,
                variant: "destructive",
              })
            }
            emitQueueStatusEvent(data)
            return
          }

          if (data.type === "WRITE_QUEUE_STATUS") {
            emitQueueStatusEvent(data)
            return
          }

          if (data.type === "WRITE_QUEUE_DROPPED" && Number(data.droppedCount || 0) > 0) {
            const droppedCount = Number(data.droppedCount || 0)
            toast({
              title: "Some queued updates were dropped",
              description: `${droppedCount} queued request${droppedCount === 1 ? "" : "s"} could not be delivered after repeated retries.`,
              variant: "destructive",
            })
            emitQueueStatusEvent(data)
            return
          }

          if (data.type === "WRITE_QUEUE_TRIMMED" && Number(data.trimmedCount || 0) > 0) {
            const trimmedCount = Number(data.trimmedCount || 0)
            toast({
              title: "Offline queue trimmed",
              description: `${trimmedCount} oldest queued update${trimmedCount === 1 ? "" : "s"} removed to keep sync fast.`,
              variant: "destructive",
            })
            emitQueueStatusEvent(data)
          }
        }

        navigator.serviceWorker.addEventListener("message", messageHandler)
        onlineHandler = () => {
          flushQueue()
          requestQueueStatus()
        }
        window.addEventListener("online", onlineHandler)
        controllerChangeHandler = () => {
          syncRuntimeConfig()
          flushQueue()
          requestQueueStatus()
        }
        navigator.serviceWorker.addEventListener("controllerchange", controllerChangeHandler)
        visibilityHandler = () => {
          if (document.visibilityState === "visible" && navigator.onLine) {
            syncRuntimeConfig()
            flushQueue()
            requestQueueStatus()
          }
        }
        document.addEventListener("visibilitychange", visibilityHandler)

        if (navigator.onLine) {
          flushQueue()
        }
        requestQueueStatus()
      } catch (error) {
        console.warn("Failed to register service worker:", error)
      }
    })()

    return () => {
      active = false
      if (messageHandler) {
        navigator.serviceWorker.removeEventListener("message", messageHandler)
      }
      if (onlineHandler) {
        window.removeEventListener("online", onlineHandler)
      }
      if (controllerChangeHandler) {
        navigator.serviceWorker.removeEventListener("controllerchange", controllerChangeHandler)
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler)
      }
    }
  }, [])

  return null
}
