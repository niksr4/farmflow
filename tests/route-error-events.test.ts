import { beforeEach, describe, expect, it, vi } from "vitest"

const { logAppErrorEvent } = vi.hoisted(() => ({
  logAppErrorEvent: vi.fn(),
}))

vi.mock("@/lib/server/error-events", () => ({ logAppErrorEvent }))

import { logRouteMutationFailure } from "@/lib/server/route-error-events"

describe("logRouteMutationFailure", () => {
  beforeEach(() => {
    logAppErrorEvent.mockReset()
    logAppErrorEvent.mockResolvedValue(undefined)
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("extracts message/name/code from a real Error", async () => {
    const error = new Error("insert failed")
    ;(error as any).code = "23505"
    await logRouteMutationFailure({ source: "test", endpoint: "/api/test", action: "create", error })

    expect(logAppErrorEvent).toHaveBeenCalledTimes(1)
    const call = logAppErrorEvent.mock.calls[0][0]
    expect(call.message).toBe("insert failed")
    expect(call.metadata.errorName).toBe("Error")
    expect(call.metadata.errorCode).toBe("23505")
    expect(call.errorCode).toBe("create_failed")
  })

  it("extracts message/code from a plain object error (e.g. a Postgres driver error)", async () => {
    const error = { message: "duplicate key value", code: "23505" }
    await logRouteMutationFailure({ source: "test", endpoint: "/api/test", action: "update", error })

    const call = logAppErrorEvent.mock.calls[0][0]
    expect(call.message).toBe("duplicate key value")
    expect(call.metadata.errorCode).toBe("23505")
    expect(call.metadata.errorName).toBeNull()
  })

  it("falls back to String() for a bare string throw", async () => {
    await logRouteMutationFailure({ source: "test", endpoint: "/api/test", action: "delete", error: "boom" })

    const call = logAppErrorEvent.mock.calls[0][0]
    expect(call.message).toBe("boom")
    expect(call.metadata.errorCode).toBeNull()
    expect(call.metadata.errorName).toBeNull()
  })

  it("falls back to 'Unknown error' for a falsy/null throw", async () => {
    await logRouteMutationFailure({ source: "test", endpoint: "/api/test", action: "delete", error: null })

    const call = logAppErrorEvent.mock.calls[0][0]
    expect(call.message).toBe("Unknown error")
  })

  it("swallows a failure in the logging call itself rather than propagating", async () => {
    logAppErrorEvent.mockRejectedValueOnce(new Error("logging backend down"))
    await expect(
      logRouteMutationFailure({ source: "test", endpoint: "/api/test", action: "create", error: new Error("x") }),
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
