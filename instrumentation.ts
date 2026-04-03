import { assertCoreRuntimeConfig } from "@/lib/runtime-config"

export async function register() {
  assertCoreRuntimeConfig()

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}
