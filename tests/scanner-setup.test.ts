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
      rosterHasIds: false,
      punchesArriving: false,
      allMapped: false,
    })
  })

  it("the roster step waits for a fingerprint id, not for a device", () => {
    // It is the step you can do before the hardware arrives, and the numbers you enrol come from
    // it -- so owning a terminal must not tick it and not owning one must not block it.
    expect(scannerSetupState(signals({ deviceCount: 1, anyDeviceSeen: true })).rosterHasIds).toBe(false)
    expect(scannerSetupState(signals({ mappedWorkerCount: 1 })).rosterHasIds).toBe(true)
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

describe("the instructions only promise what the ingest can do", () => {
  const tab = readFileSync(resolve(__dirname, "../components/attendance-scanner-tab.tsx"), "utf8")

  it("does not claim FarmFlow reads a name typed on the terminal", () => {
    // It does not. recordEnrollment fires only on the hdata.aspx realtimeEnroll message, and the
    // iclock/ADMS path this hardware speaks has no enrolment message -- biometric_enrollments is
    // empty in both databases. An instruction whose next step depends on a message that never
    // arrives is worse than no instruction: the estate does as told and blames itself.
    expect(tab).not.toContain("FarmFlow reads that name back")
    expect(tab).toContain("FarmFlow shows the name from your")
  })

  it("assigns the ids in FarmFlow before asking anyone to enrol a finger", () => {
    // Order is the fix. Enrol-first needs the device to tell us who code 7 is; roster-first never
    // asks, because the estate already said.
    const assign = tab.indexOf("Give each worker a fingerprint ID in FarmFlow")
    const enrol = tab.indexOf("Enrol the same IDs on the terminal")
    expect(assign).toBeGreaterThan(-1)
    expect(enrol).toBeGreaterThan(-1)
    expect(assign).toBeLessThan(enrol)
  })

  it("still tells estates to keep per-estate id blocks", () => {
    // Two terminals issuing "7" to different people is unrecoverable after the fact.
    expect(tab).toContain("1–99 for one, 101–199 for the next")
  })
})

describe("the scanner tab ships", () => {
  const workspace = readFileSync(resolve(__dirname, "../components/attendance-workspace.tsx"), "utf8")

  it("is no longer gated on NODE_ENV", () => {
    // Dev-only until 2026-09-01, while no estate had hardware. HoneyFarm's terminal went in and
    // the gate came out.
    expect(workspace).not.toContain("SCANNER_TAB_ENABLED")
  })

  it("does not require the tenant to already own a device", () => {
    // The muster's collapsed panel gates on hasBiometricDevices, which is right for a settings
    // panel and fatal for a setup wizard -- the screen for registering your FIRST device cannot
    // require you to have one. That chicken-and-egg is what this tab exists to remove.
    const scannerBlock = workspace.slice(workspace.indexOf('activeSection === "scanner"'))
    expect(scannerBlock).not.toContain("hasBiometricDevices")
    expect(workspace).toContain('{ value: "scanner" as AttendanceSection, label: "Scanner", icon: Fingerprint }')
  })

  it("still sits behind labour management, like every other roster screen", () => {
    expect(workspace).toContain('showLaborManagement && activeSection === "scanner"')
  })
})

/**
 * A registered terminal stays editable.
 *
 * Reported 2026-09-03 while commissioning HoneyFarm's second scanner: the estate could be chosen
 * when registering and never afterwards, and a terminal could not be removed at all. Both routes
 * existed — PUT ignored `estate`, DELETE was never called by anything.
 *
 * Neither is cosmetic. A serial typed with one character wrong is permanent, and the tab sits on
 * "waiting for the terminal to call in" forever with no way to correct it — the single most likely
 * mistake at this step. And a terminal stuck on the default "serves every estate" is how a finger
 * id enrolled at Sidapur collides with the same number at Honeyfarm and the punch lands on the
 * wrong person. Correcting either meant a hand-written SQL transaction, which is exactly the
 * intervention this tab exists to remove.
 */
describe("a terminal can be corrected after it is registered", () => {
  const tab = readFileSync(resolve(__dirname, "../components/attendance-scanner-tab.tsx"), "utf8")
  const route = readFileSync(resolve(__dirname, "../app/api/attendance/devices/[id]/route.ts"), "utf8")

  it("the edit route accepts an estate at all", () => {
    expect(route).toContain("body?.estate !== undefined")
    expect(route).toContain("estate = CASE WHEN ${estate !== undefined}")
  })

  it("clearing the estate is possible, so COALESCE is not used", () => {
    // null is a real value here — "serves every estate" — and COALESCE would make it unreachable,
    // the same trap the rainfall edit path had.
    expect(route).not.toContain("estate = COALESCE(")
  })

  it("validates the name against the tenant's own estates", () => {
    // A typo does not fail; it invents an estate that exists on this row and matches no worker.
    expect(route).toContain("is not one of your estates")
  })

  it("the tab lets you change it and remove the terminal", () => {
    expect(tab).toContain("handleSetEstate")
    expect(tab).toContain("handleRemoveDevice")
    expect(tab).toContain('method: "DELETE"')
  })

  it("warns before removing, and says punches are kept", () => {
    expect(tab).toContain("Punches already received are kept")
  })

  it("only asks about estates when the tenant has more than one", () => {
    const block = tab.slice(tab.indexOf("handleSetEstate(device.id"))
    expect(tab).toContain("isMultiEstate && estates.length > 0 && (")
    expect(block.length).toBeGreaterThan(0)
  })
})
