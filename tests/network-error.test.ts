import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { isNetworkError } from "@/lib/network-error"

/**
 * From a real Sentry issue: KAB123, Chrome Mobile on Android, PWA, 07:30 IST — a writer walking a
 * coffee estate. `TypeError: Failed to fetch`, reported at error level, on a card that blanked
 * itself in response.
 */
describe("a dropped connection is recognised across engines", () => {
  it.each([
    ["Chrome", new TypeError("Failed to fetch")],
    ["Firefox", new TypeError("NetworkError when attempting to fetch resource.")],
    ["Safari", new TypeError("Load failed")],
    ["React Native", new TypeError("Network request failed")],
    ["Chrome, disconnected", new TypeError("net::ERR_INTERNET_DISCONNECTED")],
  ])("%s", (_engine, err) => {
    expect(isNetworkError(err)).toBe(true)
  })

  it("does not swallow an abort — that is our own cancellation, not the network", () => {
    const abort = new Error("The operation was aborted")
    abort.name = "AbortError"
    expect(isNetworkError(abort)).toBe(false)
  })

  it.each([
    new TypeError("Cannot read properties of undefined (reading 'map')"),
    new Error("Insufficient stock for the linked inventory item"),
    new SyntaxError("Unexpected token < in JSON at position 0"),
  ])("leaves a real bug alone: %s", (err) => {
    expect(isNetworkError(err)).toBe(false)
  })

  it.each([null, undefined, ""])("handles %s without throwing", (v) => {
    expect(isNetworkError(v)).toBe(false)
  })
})

describe("Sentry keeps the reports that mean something", () => {
  const track = readFileSync("lib/track-action.ts", "utf8")

  it("a network failure becomes a breadcrumb, not an exception", () => {
    const branch = track.slice(track.indexOf("if (isNetworkError(err))"), track.indexOf("if (isNetworkError(err))") + 500)
    expect(branch).toContain("addBreadcrumb")
    expect(branch).not.toContain("captureException")
  })

  it("but still reaches PostHog, where the volume is the signal", () => {
    const branch = track.slice(track.indexOf("if (isNetworkError(err))"), track.indexOf("if (isNetworkError(err))") + 500)
    expect(branch).toContain("posthog.capture")
    expect(branch).toContain('reason: "network"')
  })

  it("a real exception is still captured", () => {
    expect(track).toContain("Sentry.captureException")
  })
})

describe("the gaps card does not turn 'unknown' into 'nothing to do'", () => {
  const card = readFileSync("components/today-gaps-card.tsx", "utf8")

  it("keeps its data when the connection drops instead of emptying", () => {
    const catchBlock = card.slice(card.indexOf("} catch (err) {"), card.indexOf("} finally {"))
    const netBranch = catchBlock.indexOf("isNetworkError(err)")
    expect(netBranch).toBeGreaterThan(-1)
    // The clearing must come after, and be unreachable for a network failure.
    expect(catchBlock.indexOf("setGaps([])")).toBeGreaterThan(netBranch)
    expect(catchBlock.slice(netBranch, netBranch + 120)).toContain("return")
  })

  it("cannot claim the estate is caught up on data it failed to load", () => {
    expect(card).toContain("const allCaughtUp = !offline")
  })

  it("says so on screen rather than silently showing stale figures", () => {
    expect(card).toContain("No connection")
  })
})
