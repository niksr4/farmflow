import { describe, expect, it } from "vitest"
import {
  buildActivitySignal,
  evaluateDigestDormancy,
  evaluateProbeDormancy,
  mostRecentActivityAt,
  DIGEST_QUIET_DAYS,
  DIGEST_MIN_TENANT_AGE_DAYS,
  type TenantActivityInput,
} from "../lib/server/agents/tenant-dormancy"

const NOW = new Date("2026-07-31T02:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

const signal = (overrides: Partial<TenantActivityInput> = {}) =>
  buildActivitySignal(
    {
      tenantId: "t1",
      tenantCreatedAt: daysAgo(200),
      lastLoginAt: null,
      lastDataWriteAt: null,
      lastProbeSentAt: null,
      probeLastKnownActivityAt: null,
      ...overrides,
    },
    NOW,
  )

describe("mostRecentActivityAt", () => {
  it("prefers whichever sign of life is newest", () => {
    expect(
      mostRecentActivityAt({
        tenantCreatedAt: daysAgo(200),
        lastLoginAt: daysAgo(30),
        lastDataWriteAt: daysAgo(2),
      }),
    ).toEqual(daysAgo(2))
  })

  it("falls back to tenant creation when there is no login or data", () => {
    expect(
      mostRecentActivityAt({
        tenantCreatedAt: daysAgo(5),
        lastLoginAt: null,
        lastDataWriteAt: null,
      }),
    ).toEqual(daysAgo(5))
  })
})

describe("unactivated tenants", () => {
  it("marks an account nobody has ever opened as unactivated", () => {
    expect(signal({ tenantCreatedAt: daysAgo(8) }).isUnactivated).toBe(true)
  })

  it("does not mark an account with data but no recorded login as unactivated", () => {
    // Older tenants can predate the security_events login trail — they are real users.
    expect(signal({ lastLoginAt: null, lastDataWriteAt: daysAgo(3) }).isUnactivated).toBe(false)
  })

  it("suppresses the digest even inside the new-tenant grace window", () => {
    const result = evaluateDigestDormancy(signal({ tenantCreatedAt: daysAgo(2) }))
    expect(result.dormant).toBe(true)
    expect(result.reason).toContain("never activated")
  })

  it("does not probe an unactivated tenant", () => {
    expect(evaluateProbeDormancy(signal({ tenantCreatedAt: daysAgo(30) })).dormant).toBe(false)
  })

  it("still sends to a tenant with data but no recorded login", () => {
    const result = evaluateDigestDormancy(
      signal({ lastLoginAt: null, lastDataWriteAt: daysAgo(1) }),
    )
    expect(result.dormant).toBe(false)
  })
})

describe("evaluateDigestDormancy", () => {
  it("keeps sending to a new tenant that has started using the product", () => {
    const result = evaluateDigestDormancy(
      signal({
        tenantCreatedAt: daysAgo(DIGEST_MIN_TENANT_AGE_DAYS - 1),
        lastLoginAt: daysAgo(DIGEST_MIN_TENANT_AGE_DAYS - 1),
      }),
    )
    expect(result.dormant).toBe(false)
  })

  it("keeps sending when the tenant logged in recently", () => {
    expect(evaluateDigestDormancy(signal({ lastLoginAt: daysAgo(3) })).dormant).toBe(false)
  })

  // The important case: 30-day sessions mean an active user can hold a very stale
  // auth_login_success event. Data writes must keep them subscribed on their own.
  it("keeps sending when the login is stale but data is still being entered", () => {
    const result = evaluateDigestDormancy(
      signal({ lastLoginAt: daysAgo(28), lastDataWriteAt: daysAgo(1) }),
    )
    expect(result.dormant).toBe(false)
  })

  it("suppresses when there is neither a login nor a data write", () => {
    const result = evaluateDigestDormancy(
      signal({ lastLoginAt: daysAgo(40), lastDataWriteAt: daysAgo(70) }),
    )
    expect(result.dormant).toBe(true)
    expect(result.reason).toContain("last login 40d ago")
    expect(result.reason).toContain("last entry 70d ago")
  })

  it("reports never-used signals rather than a bogus day count", () => {
    const result = evaluateDigestDormancy(signal({ lastLoginAt: daysAgo(40) }))
    expect(result.dormant).toBe(true)
    expect(result.reason).toContain("last entry never")
  })

  it("holds the line exactly at the quiet-days boundary", () => {
    expect(evaluateDigestDormancy(signal({ lastLoginAt: daysAgo(DIGEST_QUIET_DAYS - 1) })).dormant).toBe(
      false,
    )
    expect(evaluateDigestDormancy(signal({ lastLoginAt: daysAgo(DIGEST_QUIET_DAYS) })).dormant).toBe(
      true,
    )
  })
})

describe("evaluateProbeDormancy", () => {
  it("flags a tenant quiet past the probe threshold", () => {
    const result = evaluateProbeDormancy(signal({ lastLoginAt: daysAgo(5) }))
    expect(result.dormant).toBe(true)
    expect(result.daysSinceLastLogin).toBe(5)
  })

  it("leaves a recently active tenant alone", () => {
    expect(evaluateProbeDormancy(signal({ lastLoginAt: daysAgo(2) })).dormant).toBe(false)
  })

  it("does not probe a tenant too new to have gone quiet", () => {
    expect(evaluateProbeDormancy(signal({ tenantCreatedAt: daysAgo(2) })).dormant).toBe(false)
  })

  it("suppresses a repeat probe within the same dormancy episode", () => {
    const result = evaluateProbeDormancy(
      signal({
        lastLoginAt: daysAgo(20),
        lastProbeSentAt: daysAgo(16),
        probeLastKnownActivityAt: daysAgo(20),
      }),
    )
    expect(result.alreadyProbedThisEpisode).toBe(true)
  })

  it("treats a fresh login as a new episode", () => {
    const result = evaluateProbeDormancy(
      signal({
        lastLoginAt: daysAgo(6),
        lastProbeSentAt: daysAgo(30),
        probeLastKnownActivityAt: daysAgo(40),
      }),
    )
    expect(result.dormant).toBe(true)
    expect(result.alreadyProbedThisEpisode).toBe(false)
  })

  // Regression: a tenant with no login event has a NULL last_known_activity_at, which the
  // original check read as "never probed" — so it re-sent the probe every single daily run.
  // Still reachable for tenants whose data predates the security_events login trail.
  it("does not re-probe a tenant with no login event that was already probed", () => {
    const result = evaluateProbeDormancy(
      signal({ tenantCreatedAt: daysAgo(60), lastDataWriteAt: daysAgo(30), lastProbeSentAt: daysAgo(1) }),
    )
    expect(result.dormant).toBe(true)
    expect(result.alreadyProbedThisEpisode).toBe(true)
  })

  it("still sends the first probe to a tenant with no login event", () => {
    const result = evaluateProbeDormancy(
      signal({ tenantCreatedAt: daysAgo(60), lastDataWriteAt: daysAgo(30), lastProbeSentAt: null }),
    )
    expect(result.dormant).toBe(true)
    expect(result.alreadyProbedThisEpisode).toBe(false)
  })
})
