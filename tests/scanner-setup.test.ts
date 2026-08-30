import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { BIOMETRIC_RELAY_HOST, BIOMETRIC_RELAY_PORT, scannerSetupState, type ScannerSignals } from "../lib/scanner-setup"

const signals = (overrides: Partial<ScannerSignals> = {}): ScannerSignals => ({
  deviceCount: 0,
  anyDeviceSeen: false,
  anyDeviceOnline: false,
  punchCount: 0,
  unmappedCount: 0,
  mappedWorkerCount: 0,
  ...overrides,
})

/**
 * A setup step goes green because the thing happened, not because nothing is outstanding.
 *
 * The onboarding checklist made exactly this mistake: "done" was written as "no items are
 * missing", which is also what an estate with no items at all looks like, and tenants finished
 * onboarding with one of forty items priced. The scanner wizard has the same trap in step 4 --
 * zero unmapped codes is both "every code is matched" and "no punch has ever arrived" -- and it
 * is worse here, because a green tick would tell an estate their roster is linked on the morning
 * the terminal was never plugged in.
 */
describe("a scanner setup step is done only on evidence", () => {
  it("nothing is done on a fresh tenant", () => {
    expect(scannerSetupState(signals())).toEqual({
      registered: false,
      reachedUs: false,
      punchesArriving: false,
      allMapped: false,
    })
  })

  it("does not call the roster matched when no punch has ever arrived", () => {
    // Zero unmapped codes, zero mapped workers: the empty case, not the finished one.
    expect(scannerSetupState(signals({ deviceCount: 1 })).allMapped).toBe(false)
  })

  it("calls the roster matched once codes exist and none are outstanding", () => {
    expect(scannerSetupState(signals({ unmappedCount: 0, mappedWorkerCount: 3 })).allMapped).toBe(true)
  })

  it("keeps the roster unmatched while any code is outstanding", () => {
    expect(scannerSetupState(signals({ unmappedCount: 1, mappedWorkerCount: 3 })).allMapped).toBe(false)
  })

  it("counts a terminal that has ever called in, not only one online right now", () => {
    // A device that connected this morning and is asleep by evening has passed this step.
    // Marking it undone sends somebody back to re-enter an IP that was always right.
    expect(scannerSetupState(signals({ deviceCount: 1, anyDeviceSeen: true, anyDeviceOnline: false })).reachedUs).toBe(
      true,
    )
  })

  it("does not claim contact before any heartbeat", () => {
    expect(scannerSetupState(signals({ deviceCount: 1 })).reachedUs).toBe(false)
  })
})

describe("the relay address has one definition", () => {
  it("is not a bare hostname or port 443", () => {
    // The terminals have no TLS stack. Port 443 is what this panel used to say, and it cannot
    // work with this hardware -- the device does not follow the 308 that HTTPS-only answers with.
    expect(BIOMETRIC_RELAY_PORT).not.toBe("443")
    expect(BIOMETRIC_RELAY_HOST).not.toContain("thefarmflow")
  })

  it("is not re-declared in any component", () => {
    // Two screens show this now. A second copy is how one goes stale while the other is right.
    const settings = readFileSync(resolve(__dirname, "../components/attendance-device-settings.tsx"), "utf8")
    const scanner = readFileSync(resolve(__dirname, "../components/attendance-scanner-tab.tsx"), "utf8")
    for (const source of [settings, scanner]) {
      expect(source).not.toMatch(/NEXT_PUBLIC_BIOMETRIC_RELAY/)
      expect(source).toContain("@/lib/scanner-setup")
    }
  })
})

describe("the scanner tab does not ship to production", () => {
  const workspace = readFileSync(resolve(__dirname, "../components/attendance-workspace.tsx"), "utf8")

  it("gates on NODE_ENV, which is inlined at build time", () => {
    // A runtime flag a signed-in user could flip is not the same promise. This is compile-time:
    // every deployed build, including `vercel --prod --skip-domain`, has NODE_ENV=production.
    expect(workspace).toContain('const SCANNER_TAB_ENABLED = process.env.NODE_ENV !== "production"')
  })

  it("gates the nav entry and the panel, not just one of them", () => {
    // Gating only the button leaves the section reachable by any other path that sets the state.
    expect((workspace.match(/SCANNER_TAB_ENABLED/g) ?? []).length).toBe(3)
  })
})
