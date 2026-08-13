import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every field the edit form loads must also be SENT on save.
 *
 * The failure this guards against is silent and convincing: startEdit populated
 * editForm.deviceUserCode and the input rendered it, but the PUT body omitted it. The request
 * succeeded, the other fields saved, the toast said "Worker updated" -- and the code stayed
 * null. Nothing surfaced as an error anywhere.
 */
const src = readFileSync(resolve(process.cwd(), "components/worker-profiles-tab.tsx"), "utf8")

const putBody = src.slice(src.indexOf("method: \"PUT\""), src.indexOf("const data = await res.json()", src.indexOf("method: \"PUT\"")))
const postBody = src.slice(src.indexOf("/api/attendance/workers\", {"), src.indexOf("const data = await res.json()", src.indexOf("/api/attendance/workers\", {")))

const EDITABLE = ["name", "workerType", "phone", "dailyRate", "bankName", "bankAccount", "bankIfsc", "estate", "deviceUserCode"]

describe("worker profiles: edit form round-trips every field", () => {
  for (const field of EDITABLE) {
    it(`sends ${field} on save`, () => {
      expect(putBody, `${field} is editable but missing from the PUT body`).toContain(`${field}:`)
    })
  }

  it("loads deviceUserCode into the edit form", () => {
    expect(src).toContain("deviceUserCode: worker.deviceUserCode")
  })
})

describe("worker profiles: add form sends what it collects", () => {
  for (const field of ["name", "workerType", "dailyRate", "estate", "phone", "bankName", "bankAccount", "bankIfsc", "deviceUserCode"]) {
    it(`sends ${field} on create`, () => {
      expect(postBody, `${field} is collected but missing from the POST body`).toContain(`${field}:`)
    })
  }
})

describe("worker profiles: reload is not cached", () => {
  it("re-reads the roster with no-store after a write", () => {
    // A cached read straight after a save shows pre-edit values and looks like a failed write.
    expect(src).toContain('cache: "no-store"')
  })
})
