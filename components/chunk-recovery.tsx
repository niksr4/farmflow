"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

import {
  CHUNK_RELOAD_COOLDOWN_MS,
  decideReload,
  isChunkLoadError,
} from "@/lib/chunk-recovery"

/**
 * Reloads the page when it asks for a chunk that a later deploy has already replaced.
 *
 * See lib/chunk-recovery.ts for why this is needed and why the reload is so carefully bounded.
 * Mounted once at the root so it covers every route -- a stale tab can fail on any lazy import,
 * not just the dashboard's.
 *
 * Both listeners are needed and catch different things: a failed `import()` rejects a promise
 * (`unhandledrejection`), while a `<script>` that 404s fires `error` on window. The listeners are
 * capture-phase and non-passive so they run before React's own error handling turns the failure
 * into a blank screen.
 */
export default function ChunkRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const handle = (error: unknown) => {
      const decision = decideReload({
        error,
        online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
        now: Date.now(),
        storage: (() => {
          try {
            return window.sessionStorage
          } catch {
            return null
          }
        })(),
      })

      if (!decision.reload) {
        // A chunk error we deliberately did not act on is worth knowing about -- especially
        // "recently-reloaded", which means a reload did not fix it and something else is wrong.
        if (isChunkLoadError(error) && decision.reason !== "not-a-chunk-error") {
          Sentry.captureMessage("Chunk load failed; reload suppressed", {
            level: "warning",
            tags: { chunk_reload_suppressed: decision.reason },
          })
        }
        return
      }

      // Breadcrumb rather than an exception: this is a handled, expected consequence of shipping
      // while people have the app open, and it should not page anyone. It does need to be
      // visible, because a spike means a deploy stranded a lot of open tabs at once.
      Sentry.addBreadcrumb({
        category: "chunk-recovery",
        level: "info",
        message: "Stale chunk detected; reloading to pick up the current build",
      })

      // `location.reload()` can be served from cache in some browsers; replacing the URL with
      // itself forces a fresh document request, which is the entire point of being here.
      window.location.replace(window.location.href)
    }

    const onError = (event: ErrorEvent) => handle(event?.error ?? event?.message)
    const onRejection = (event: PromiseRejectionEvent) => handle(event?.reason)

    window.addEventListener("error", onError, true)
    window.addEventListener("unhandledrejection", onRejection, true)
    return () => {
      window.removeEventListener("error", onError, true)
      window.removeEventListener("unhandledrejection", onRejection, true)
    }
  }, [])

  return null
}

export { CHUNK_RELOAD_COOLDOWN_MS }
