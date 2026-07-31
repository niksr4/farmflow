import { describe, expect, it } from "vitest"
import {
  fingerprintForException,
  fingerprintForMessage,
  normalizeForFingerprint,
  scrubSentryEvent,
} from "../lib/observability"
import { redactText, redactValue } from "../lib/redaction"

describe("normalizeForFingerprint", () => {
  // The failure this prevents: logServerError writes lines like
  // "Weekly digest generation failed for tenant 8789431e-…". Grouping on the raw message
  // mints one Sentry issue per tenant, so a single regression looks like six unrelated bugs
  // and the real signal is buried.
  it("collapses tenant ids so one failure is one issue", () => {
    const a = normalizeForFingerprint(
      "Weekly digest generation failed for tenant 8789431e-d4e2-4341-a010-d3aa58e5a8eb",
    )
    const b = normalizeForFingerprint(
      "Weekly digest generation failed for tenant 41b4b10c-428c-4155-882f-1cc7f6e89a78",
    )
    expect(a).toBe(b)
    expect(a).toBe("Weekly digest generation failed for tenant <uuid>")
  })

  it("collapses dates", () => {
    expect(normalizeForFingerprint("No rainfall row for 2026-07-30")).toBe(
      "No rainfall row for <date>",
    )
    expect(normalizeForFingerprint("Run started 2026-07-30T02:12:37Z")).toBe(
      "Run started <date>",
    )
  })

  it("collapses long hex ids and bare numbers", () => {
    expect(normalizeForFingerprint("Deploy dpl_9f3ab12cd45ef6789a0b1c2d3e4f5061 failed")).toBe(
      "Deploy dpl_<hex> failed",
    )
    expect(normalizeForFingerprint("Upstream returned 503 after 1200 ms")).toBe(
      "Upstream returned <n> after <n> ms",
    )
  })

  it("collapses ids sitting behind an underscore prefix", () => {
    // `\b` does not fire after an underscore, so a naive word-boundary rule lets the whole
    // `xxx_<id>` family through unnormalised — one Sentry issue per id.
    expect(normalizeForFingerprint("Deploy dpl_9f3ab12cd45ef6789a0b1c2d3e4f5061 failed")).toBe(
      "Deploy dpl_<hex> failed",
    )
    expect(
      normalizeForFingerprint("tenant_8789431e-d4e2-4341-a010-d3aa58e5a8eb not found"),
    ).toBe("tenant_<uuid> not found")
    expect(normalizeForFingerprint("req_4821 timed out")).toBe("req_<n> timed out")
  })

  it("collapses adjacent numbers independently", () => {
    expect(normalizeForFingerprint("retried 3 times over 1200 ms after 503")).toBe(
      "retried 3 times over <n> ms after <n>",
    )
  })

  it("leaves alphanumeric tokens that merely end in digits alone", () => {
    // `arabica2` is a value, not an id — collapsing it would merge unrelated failures.
    expect(normalizeForFingerprint("unknown grade arabica2")).toBe("unknown grade arabica2")
  })

  it("keeps genuinely different failures apart", () => {
    // Over-normalising is the opposite failure — everything in one bucket is just as useless.
    expect(normalizeForFingerprint("Digest send failed")).not.toBe(
      normalizeForFingerprint("Digest generation failed"),
    )
  })

  it("normalises whitespace so wrapped messages group together", () => {
    expect(normalizeForFingerprint("failed  to\n  load")).toBe("failed to load")
  })

  it("handles empty and non-string input without throwing", () => {
    expect(normalizeForFingerprint("")).toBe("")
    expect(normalizeForFingerprint(undefined as unknown as string)).toBe("")
  })
})

describe("fingerprints", () => {
  it("keeps Sentry's stack grouping for real exceptions and adds the normalised message", () => {
    expect(fingerprintForException("Failed for tenant 8789431e-d4e2-4341-a010-d3aa58e5a8eb")).toEqual([
      "{{ default }}",
      "Failed for tenant <uuid>",
    ])
  })

  it("groups stackless log lines purely on the normalised message", () => {
    // These share the logging helper's frames, so the default stack grouping is worthless.
    expect(fingerprintForMessage("Cache miss for 12345")).toEqual([
      "log-server-error",
      "Cache miss for <n>",
    ])
  })
})

describe("scrubSentryEvent", () => {
  it("redacts the event message", () => {
    const event = scrubSentryEvent({ message: "failed for nik@example.com" }, redactText)
    expect(event.message).toBe("failed for [REDACTED_EMAIL]")
  })

  it("redacts exception values", () => {
    const event = scrubSentryEvent(
      { exception: { values: [{ value: "auth failed: Bearer abc123.def" }] } },
      redactText,
    )
    expect(event.exception.values[0].value).toBe("auth failed: Bearer [REDACTED]")
  })

  it("leaves an event without message or exception untouched", () => {
    expect(scrubSentryEvent({}, redactText)).toEqual({})
  })

  it("never drops an event when redaction throws", () => {
    // A bug in the scrubber must not blind the error reporter.
    const exploding = () => {
      throw new Error("regex blew up")
    }
    const event = { message: "original" }
    expect(scrubSentryEvent(event, exploding)).toBe(event)
    expect(event.message).toBe("original")
  })
})

describe("redaction rules", () => {
  it("strips emails, bearer tokens and secret query params", () => {
    expect(redactText("contact nik@example.com")).toBe("contact [REDACTED_EMAIL]")
    expect(redactText("Authorization: Bearer eyJhbGciOi.J9")).toContain("Bearer [REDACTED]")
    expect(redactText("GET /x?api_key=supersecret&b=1")).toBe("GET /x?api_key=[REDACTED]&b=1")
  })

  it("redacts sensitive object keys rather than their values alone", () => {
    expect(redactValue({ password: "hunter2", note: "fine" })).toEqual({
      password: "[REDACTED]",
      note: "fine",
    })
  })

  it("truncates beyond the recursion limit instead of hanging", () => {
    const deep: any = { a: { b: { c: { d: { e: { f: "too deep" } } } } } }
    expect(JSON.stringify(redactValue(deep))).toContain("[Truncated]")
  })
})
