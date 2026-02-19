"use client"

import { useEffect, useRef } from "react"
import { toast } from "@/components/ui/use-toast"

const ENABLE_PWA_IN_DEV = process.env.NEXT_PUBLIC_ENABLE_PWA_DEV === "true"
const SHOULD_REGISTER_SW = process.env.NODE_ENV === "production" || ENABLE_PWA_IN_DEV
const SYNC_TAG = "farmflow-sync-writes"

type ServiceWorkerMessage = {
  type?: string
  pendingCount?: number
  syncedCount?: number
  remaining?: number
  droppedCount?: number
}

export default function PwaRegister() {
  const lastPendingCountRef = useRef(0)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!SHOULD_REGISTER_SW || typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    let active = true
    let messageHandler: ((event: MessageEvent<ServiceWorkerMessage>) => void) | null = null
    let onlineHandler: (() => void) | null = null
    let controllerChangeHandler: (() => void) | null = null

    const flushQueue = () => {
      const payload = { type: "FLUSH_WRITE_QUEUE" }
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(payload)
        return
      }

      const registration = registrationRef.current
      if (registration?.active) {
        registration.active.postMessage(payload)
        return
      }
      if (registration?.waiting) {
        registration.waiting.postMessage(payload)
        return
      }
      registration?.installing?.postMessage(payload)
    }

    ;(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
        if (!active) return
        registrationRef.current = registration

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
            return
          }

          if (data.type === "WRITE_QUEUE_FLUSHED" && Number(data.syncedCount || 0) > 0) {
            const syncedCount = Number(data.syncedCount || 0)
            const remaining = Number(data.remaining || 0)
            lastPendingCountRef.current = remaining
            toast({
              title: "Offline updates synced",
              description: `${syncedCount} queued update${syncedCount === 1 ? "" : "s"} sent.`,
            })
            return
          }

          if (data.type === "WRITE_QUEUE_DROPPED" && Number(data.droppedCount || 0) > 0) {
            const droppedCount = Number(data.droppedCount || 0)
            toast({
              title: "Some queued updates were dropped",
              description: `${droppedCount} old request${droppedCount === 1 ? "" : "s"} exceeded retry limits.`,
              variant: "destructive",
            })
          }
        }

        navigator.serviceWorker.addEventListener("message", messageHandler)
        onlineHandler = () => flushQueue()
        window.addEventListener("online", onlineHandler)
        controllerChangeHandler = () => flushQueue()
        navigator.serviceWorker.addEventListener("controllerchange", controllerChangeHandler)

        if (navigator.onLine) {
          flushQueue()
        }
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
    }
  }, [])

  return null
}
