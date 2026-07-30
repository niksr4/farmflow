import { describe, expect, it, vi } from "vitest"
import { createSingleFlight, createSingleFlightRunner } from "@/lib/single-flight"

/** Controllable clock so cooldown behaviour is deterministic. */
const fakeClock = (start = 0) => {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

/** A promise we resolve by hand, to hold an action "in flight". */
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("createSingleFlight", () => {
  it("drops a second call made while the first is still in flight — the double-tap case", async () => {
    const gate = deferred<string>()
    const action = vi.fn(() => gate.promise)
    const run = createSingleFlight(action, { now: fakeClock().now })

    const first = run()
    const second = run() // the accidental second tap, before the first resolves

    expect(action).toHaveBeenCalledTimes(1)
    await expect(second).resolves.toBeUndefined()

    gate.resolve("saved")
    await expect(first).resolves.toBe("saved")
  })

  it("drops a repeat tap inside the cooldown, then allows one after it", async () => {
    const clock = fakeClock()
    const action = vi.fn(async () => "ok")
    const run = createSingleFlight(action, { cooldownMs: 600, now: clock.now })

    await run()
    expect(action).toHaveBeenCalledTimes(1)

    clock.advance(300)
    await expect(run()).resolves.toBeUndefined()
    expect(action).toHaveBeenCalledTimes(1)

    clock.advance(400) // 700ms total, past the cooldown
    await expect(run()).resolves.toBe("ok")
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("allows the very first call with no delay", async () => {
    const action = vi.fn(async () => "ok")
    const run = createSingleFlight(action, { now: fakeClock(1_000_000).now })
    await expect(run()).resolves.toBe("ok")
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("releases the guard when the action throws, so one failure cannot wedge the button", async () => {
    const clock = fakeClock()
    const action = vi.fn(async () => { throw new Error("network") })
    const run = createSingleFlight(action, { cooldownMs: 0, now: clock.now })

    await expect(run()).rejects.toThrow("network")
    // Still usable — a failed save must be retryable without a reload.
    await expect(run()).rejects.toThrow("network")
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("passes arguments and the resolved value straight through", async () => {
    const action = vi.fn(async (a: number, b: string) => `${a}-${b}`)
    const run = createSingleFlight(action, { now: fakeClock().now })
    await expect(run(7, "x")).resolves.toBe("7-x")
    expect(action).toHaveBeenCalledWith(7, "x")
  })

  it("does not apply a cooldown between distinct guarded actions", async () => {
    const clock = fakeClock()
    const a = vi.fn(async () => "a")
    const b = vi.fn(async () => "b")
    const runA = createSingleFlight(a, { now: clock.now })
    const runB = createSingleFlight(b, { now: clock.now })

    await runA()
    await expect(runB()).resolves.toBe("b") // separate guard, separate state
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("serialises a burst of taps into exactly one run", async () => {
    const gate = deferred<string>()
    const action = vi.fn(() => gate.promise)
    const run = createSingleFlight(action, { now: fakeClock().now })

    const results = [run(), run(), run(), run(), run()]
    expect(action).toHaveBeenCalledTimes(1)

    gate.resolve("saved")
    const settled = await Promise.all(results)
    expect(settled.filter((r) => r === "saved")).toHaveLength(1)
    expect(settled.filter((r) => r === undefined)).toHaveLength(4)
  })
})

describe("createSingleFlightRunner (the shape the React hook uses)", () => {
  it("drops a second tap while the first is in flight, even with a fresh closure each call", async () => {
    // This is the real scenario: the form's handler is an inline async function with a new
    // identity every render. The guard state must live in the runner, not be keyed on the closure.
    const gate = deferred<string>()
    const calls: number[] = []
    const run = createSingleFlightRunner({ now: fakeClock().now })

    const first = run(async () => { calls.push(1); return gate.promise })
    const second = run(async () => { calls.push(2); return "second" }) // different closure

    expect(calls).toEqual([1])
    await expect(second).resolves.toBeUndefined()

    gate.resolve("saved")
    await expect(first).resolves.toBe("saved")
  })

  it("applies the cooldown across calls with different closures", async () => {
    const clock = fakeClock()
    const run = createSingleFlightRunner({ cooldownMs: 600, now: clock.now })
    const seen: string[] = []

    await run(async () => { seen.push("a") })
    clock.advance(200)
    await run(async () => { seen.push("b") })
    expect(seen).toEqual(["a"])

    clock.advance(500)
    await run(async () => { seen.push("c") })
    expect(seen).toEqual(["a", "c"])
  })

  it("forwards arguments and the return value", async () => {
    const run = createSingleFlightRunner({ now: fakeClock().now })
    await expect(run(async (a: number, b: string) => `${a}${b}`, 4, "z")).resolves.toBe("4z")
  })

  it("stays usable after the action throws", async () => {
    const run = createSingleFlightRunner({ cooldownMs: 0, now: fakeClock().now })
    await expect(run(async () => { throw new Error("boom") })).rejects.toThrow("boom")
    await expect(run(async () => "recovered")).resolves.toBe("recovered")
  })
})
