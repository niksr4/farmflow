import { describe, it, expect } from "vitest"
import { validateCoreRuntimeConfig } from "@/lib/runtime-config"

const base = {
  NODE_ENV: "development" as const,
  NEXTAUTH_SECRET: "secret",
  DATABASE_URL_DEV: "postgres://dev",
}

describe("validateCoreRuntimeConfig", () => {
  it("skips validation in the test environment", () => {
    expect(validateCoreRuntimeConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toEqual({ valid: true, errors: [] })
  })

  it("passes a well-formed dev config", () => {
    expect(validateCoreRuntimeConfig(base as NodeJS.ProcessEnv)).toEqual({ valid: true, errors: [] })
  })

  it("requires NEXTAUTH_SECRET", () => {
    const result = validateCoreRuntimeConfig({ ...base, NEXTAUTH_SECRET: "" } as NodeJS.ProcessEnv)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("NEXTAUTH_SECRET is required")
  })

  it("requires a database url, with a prod-specific message", () => {
    const dev = validateCoreRuntimeConfig({ NODE_ENV: "development", NEXTAUTH_SECRET: "s" } as NodeJS.ProcessEnv)
    expect(dev.errors).toContain("DATABASE_URL_DEV or DATABASE_URL is required")

    const prod = validateCoreRuntimeConfig({ NODE_ENV: "production", NEXTAUTH_SECRET: "s" } as NodeJS.ProcessEnv)
    expect(prod.errors).toContain("DATABASE_URL is required")
  })

  it("rejects a non-https app url in production", () => {
    const result = validateCoreRuntimeConfig({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "s",
      DATABASE_URL: "postgres://prod",
      NEXT_PUBLIC_APP_URL: "http://thefarmflow.in",
    } as NodeJS.ProcessEnv)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must use https in production")
  })

  it("allows http localhost app urls in production", () => {
    const result = validateCoreRuntimeConfig({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "s",
      DATABASE_URL: "postgres://prod",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    } as NodeJS.ProcessEnv)
    expect(result.valid).toBe(true)
  })

  it("rejects a malformed app url", () => {
    const result = validateCoreRuntimeConfig({ ...base, NEXTAUTH_URL: "not a url" } as NodeJS.ProcessEnv)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must be a valid URL")
  })
})
