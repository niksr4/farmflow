import { describe, expect, it } from "vitest"
import {
  DRAFT_KEY_PREFIX,
  SCOPED_DRAFT_KEY_PREFIX,
  buildDraftKey,
  buildDraftScope,
  isDraftExpired,
  isLegacyUnscopedDraftKey,
  purgeLegacyDrafts,
} from "../lib/form-draft"

describe("buildDraftScope", () => {
  it("combines tenant and user", () => {
    expect(buildDraftScope("tenant-a", "manoj")).toBe("tenant-a:manoj")
  })

  // Null means "do not persist". Estate managers share devices, so a draft that cannot be
  // attributed to a signed-in user is the leak this fix exists to close.
  it("returns null when either half is missing", () => {
    expect(buildDraftScope("tenant-a", "")).toBeNull()
    expect(buildDraftScope("", "manoj")).toBeNull()
    expect(buildDraftScope(null, null)).toBeNull()
    expect(buildDraftScope(undefined, "manoj")).toBeNull()
  })

  it("encodes the parts so a colon cannot forge another scope", () => {
    // Without encoding, tenant "a:b" + user "c" and tenant "a" + user "b:c" collide.
    expect(buildDraftScope("a:b", "c")).not.toBe(buildDraftScope("a", "b:c"))
  })
})

describe("buildDraftKey", () => {
  it("produces a versioned, scoped key", () => {
    const key = buildDraftKey("tenant-a:manoj", "labor-form")
    expect(key).toBe(`${SCOPED_DRAFT_KEY_PREFIX}tenant-a:manoj:labor-form`)
  })

  it("gives different tenants different keys for the same form", () => {
    expect(buildDraftKey("tenant-a:manoj", "labor-form")).not.toBe(
      buildDraftKey("tenant-b:manoj", "labor-form"),
    )
  })

  it("gives different users on one tenant different keys", () => {
    expect(buildDraftKey("tenant-a:manoj", "labor-form")).not.toBe(
      buildDraftKey("tenant-a:harish", "labor-form"),
    )
  })
})

describe("isLegacyUnscopedDraftKey", () => {
  it("recognises the old unscoped shape", () => {
    expect(isLegacyUnscopedDraftKey(`${DRAFT_KEY_PREFIX}labor-form`)).toBe(true)
  })

  it("does not flag a scoped key", () => {
    expect(isLegacyUnscopedDraftKey(buildDraftKey("t:u", "labor-form"))).toBe(false)
  })

  it("ignores unrelated storage keys", () => {
    expect(isLegacyUnscopedDraftKey("farmflow:session-beacons")).toBe(false)
    expect(isLegacyUnscopedDraftKey("theme")).toBe(false)
  })
})

describe("purgeLegacyDrafts", () => {
  const makeStorage = (entries: Record<string, string>) => {
    const map = new Map(Object.entries(entries))
    return {
      get length() {
        return map.size
      },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      removeItem: (k: string) => {
        map.delete(k)
      },
      snapshot: () => Array.from(map.keys()),
    }
  }

  it("deletes every unscoped draft on a shared device", () => {
    const storage = makeStorage({
      [`${DRAFT_KEY_PREFIX}labor-form`]: "{}",
      [`${DRAFT_KEY_PREFIX}other-expenses`]: "{}",
      [buildDraftKey("t:u", "labor-form")]: "{}",
      "farmflow:session-beacons": "[]",
    })
    expect(purgeLegacyDrafts(storage)).toBe(2)
    expect(storage.snapshot()).toEqual([
      buildDraftKey("t:u", "labor-form"),
      "farmflow:session-beacons",
    ])
  })

  it("is a no-op when there is nothing legacy left", () => {
    const storage = makeStorage({ [buildDraftKey("t:u", "labor-form")]: "{}" })
    expect(purgeLegacyDrafts(storage)).toBe(0)
    expect(storage.snapshot()).toHaveLength(1)
  })

  it("removes correctly while iterating, without skipping entries", () => {
    // Collect-then-delete matters: removing during the index walk shifts the remaining keys.
    const storage = makeStorage({
      [`${DRAFT_KEY_PREFIX}a`]: "{}",
      [`${DRAFT_KEY_PREFIX}b`]: "{}",
      [`${DRAFT_KEY_PREFIX}c`]: "{}",
    })
    expect(purgeLegacyDrafts(storage)).toBe(3)
    expect(storage.snapshot()).toEqual([])
  })
})

describe("isDraftExpired", () => {
  const NOW = 1_800_000_000_000

  it("keeps a fresh draft", () => {
    expect(isDraftExpired(NOW - 60_000, NOW)).toBe(false)
  })

  it("expires one past the TTL", () => {
    expect(isDraftExpired(NOW - 25 * 60 * 60 * 1000, NOW)).toBe(true)
  })

  it("treats a missing timestamp as expired", () => {
    expect(isDraftExpired(undefined, NOW)).toBe(true)
    expect(isDraftExpired(null, NOW)).toBe(true)
  })
})
