import { describe, it, expect } from "vitest"
import { resolveDatabaseUrl, resolveAppDatabaseUrl, resolveDatabaseUrlSource } from "@/lib/server/db"

describe("resolveDatabaseUrl (owner/DDL connection)", () => {
  it("uses DATABASE_URL in production", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "prod", DATABASE_URL_DEV: "dev" })).toBe("prod")
  })

  it("prefers DATABASE_URL_DEV outside production", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: "prod", DATABASE_URL_DEV: "dev" })).toBe("dev")
  })

  it("falls back to DATABASE_URL outside production when no dev url is set", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: "prod" })).toBe("prod")
  })

  it("returns null in production when DATABASE_URL is missing", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL_DEV: "dev" })).toBeNull()
  })

  it("treats blank/whitespace values as unset", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL_DEV: "   ", DATABASE_URL: "prod" })).toBe("prod")
  })
})

describe("resolveAppDatabaseUrl (runtime connection)", () => {
  it("uses APP_DATABASE_URL when set (the least-privilege role switch)", () => {
    const env = { NODE_ENV: "production", DATABASE_URL: "owner", APP_DATABASE_URL: "runtime" }
    expect(resolveAppDatabaseUrl(env)).toBe("runtime")
  })

  it("falls back to the owner url when APP_DATABASE_URL is unset (unchanged behavior)", () => {
    const env = { NODE_ENV: "production", DATABASE_URL: "owner" }
    expect(resolveAppDatabaseUrl(env)).toBe("owner")
    expect(resolveAppDatabaseUrl(env)).toBe(resolveDatabaseUrl(env))
  })

  it("ignores a blank APP_DATABASE_URL", () => {
    const env = { NODE_ENV: "development", DATABASE_URL_DEV: "dev", APP_DATABASE_URL: "  " }
    expect(resolveAppDatabaseUrl(env)).toBe("dev")
  })
})

describe("resolveDatabaseUrlSource", () => {
  it("reports which env var supplied the connection", () => {
    expect(resolveDatabaseUrlSource({ NODE_ENV: "production", DATABASE_URL: "x" })).toBe("DATABASE_URL")
    expect(resolveDatabaseUrlSource({ NODE_ENV: "development", DATABASE_URL_DEV: "x" })).toBe("DATABASE_URL_DEV")
    expect(resolveDatabaseUrlSource({ NODE_ENV: "development" })).toBeNull()
  })
})
