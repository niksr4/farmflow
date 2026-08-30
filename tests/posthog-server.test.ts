import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getPostHogClient, shutdownPostHog } from "@/lib/posthog-server"

const ENV_KEYS = ["POSTHOG_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_HOST"] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

describe("getPostHogClient", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  })

  it("returns null when no API key is configured", () => {
    process.env.POSTHOG_HOST = "https://posthog.example.com"
    expect(getPostHogClient()).toBeNull()
  })

  it("returns null when no host is configured", () => {
    process.env.POSTHOG_API_KEY = "phc_test"
    expect(getPostHogClient()).toBeNull()
  })

  it("returns null when neither key nor host is configured", () => {
    expect(getPostHogClient()).toBeNull()
  })

  it("falls back to the NEXT_PUBLIC_-prefixed variables when the server-only ones are absent", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_public"
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://posthog.example.com"
    expect(getPostHogClient()).not.toBeNull()
  })

  it("shutdownPostHog does not throw when no client has ever been created", async () => {
    await expect(shutdownPostHog()).resolves.toBeUndefined()
  })
})
