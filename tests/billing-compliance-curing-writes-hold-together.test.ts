import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("Razorpay webhook: a failed event is processed again on redelivery", () => {
  const webhook = read("app/api/billing/webhooks/razorpay/route.ts")

  it("reclaims a 'failed' event instead of answering the retry as a duplicate", () => {
    expect(webhook).toMatch(/ON CONFLICT \(provider, external_event_id\) DO UPDATE/)
    expect(webhook).toMatch(/WHERE billing_webhook_events\.status = 'failed'/)
    expect(webhook).not.toMatch(/DO NOTHING/)
  })
})

describe("invoice creation is atomic", () => {
  const invoices = read("app/api/billing/invoices/route.ts")

  it("writes the header and every line in one transaction", () => {
    expect(invoices).toContain("runTenantTransaction")
    expect(invoices).toContain("...lineStatements(txn)")
    // No line insert may sit in its own runTenantQuery any more.
    expect(invoices).not.toMatch(/runTenantQuery\(\s*sql,\s*tenantContext,\s*sql`\s*INSERT INTO billing_invoice_items/)
  })
})

describe("compliance POST rejects what it cannot save", () => {
  const compliance = read("app/api/compliance/route.ts")

  it("answers 400 for a malformed body and for a missing name, title or id", () => {
    expect(compliance).toContain('"Invalid request body"')
    expect(compliance).toContain('requireText(payload.name, "Name")')
    expect(compliance).toContain('requireText(payload.title, "Title")')
    expect(compliance).toContain('requireText(payload.id, "Checklist item id")')
  })

  it("answers 404 when completing a checklist item that does not exist", () => {
    expect(compliance).toContain('"Checklist item not found"')
  })
})

describe("curing records POST", () => {
  const curing = read("app/api/curing-records/route.ts")

  it("treats an emptied optional number as not recorded, not as a database error", () => {
    expect(curing).toContain("optionalNumber(data.moisture_start_pct)")
    expect(curing).toContain("optionalNumber(data.drying_days)")
  })

  it("refuses a bad date, a moisture above 100% and output above intake with plain messages", () => {
    expect(curing).toContain("Process date must be a valid date")
    expect(curing).toContain("Moisture cannot be more than 100%")
    expect(curing).toContain("Output cannot be more than intake")
  })
})

describe("dashboard and outbound calls degrade instead of hanging or 500ing", () => {
  it("estate-pulse names the rainfall view it actually reads as a tolerated missing relation", () => {
    expect(read("app/api/dashboard/estate-pulse/route.ts")).toContain('["rainfall_daily", "rainfall_records"]')
  })

  it("contact form logs a provider rejection and uses a timeout", () => {
    const contact = read("app/api/contact/route.ts")
    expect(contact).toContain("fetchWithTimeout")
    expect(contact).toContain("Contact form email was rejected by the provider")
  })

  it("orchestrator healthcheck ping has a timeout", () => {
    expect(read("app/api/cron/orchestrator/route.ts")).toContain('fetchWithTimeout(url, { method: "HEAD", timeoutMs: 5_000 })')
  })

  it("benchmarks no longer reads a tenant profile it never used", () => {
    const benchmarks = read("app/api/benchmarks/route.ts")
    expect(benchmarks).not.toContain("mergeTenantEstateProfile")
    expect(benchmarks).not.toContain("ui_preferences")
  })
})
