import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards the one monitor that can tell us a fingerprint terminal stopped delivering.
 *
 * Every way this breaks is silent: the relay host reclaimed, its IP changed, the estate offline,
 * or somebody editing ServerIP on the device. None surface an error in FarmFlow, and an empty
 * attendance tab is indistinguishable from nobody turning up.
 */
const src = readFileSync(resolve(process.cwd(), "lib/server/agents/biometric-health-agent.ts"), "utf8")
const orchestrator = readFileSync(resolve(process.cwd(), "app/api/cron/orchestrator/route.ts"), "utf8")

describe("biometric health agent", () => {
  it("runs on the cron orchestrator", () => {
    // A monitor nobody schedules is not a monitor.
    expect(orchestrator).toContain("runBiometricHealthAgent")
    expect(orchestrator).toContain("biometricHealth: toResult(biometricHealth)")
  })

  it("uses the owner connection, since it reads across every tenant", () => {
    // Cron has no per-request app.tenant_id, so the RLS-scoped client would return zero rows
    // silently and the monitor would report all-clear forever.
    expect(src).toContain("adminSql as sql")
  })

  it("ignores devices that have never checked in", () => {
    // A freshly registered device is mid-setup, not an incident.
    expect(src).toContain("row.last_seen_at !== null")
  })

  it("only considers active devices", () => {
    expect(src).toContain("d.active = TRUE")
  })

  it("cannot take the orchestrator down with it", () => {
    // A monitoring check that throws would break the digests and cleanups sharing this run.
    expect(src).toContain("catch (error)")
    expect(src).toContain('skippedReason: "error"')
  })

  it("tells the reader punches are buffered, not lost", () => {
    // The alert must not read as data loss, or it will be treated as an emergency it is not.
    expect(src).toContain("buffers and retries")
  })
})
