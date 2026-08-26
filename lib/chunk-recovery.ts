/**
 * Recovering from a chunk that no longer exists on the server.
 *
 * Next.js splits the app into hashed chunks and loads them on demand. A deploy replaces those
 * files with new hashes, so any tab still running the old build is holding references to URLs
 * that now 404. The moment such a tab needs a chunk it has not already downloaded -- opening a
 * tab it has not visited, a dialog, a lazily-loaded panel -- the import rejects.
 *
 * What the user sees is not an error message. React was mid-render of a lazy component; when the
 * import fails the component resolves to nothing and the hook count for that position changes,
 * so React throws "Rendered more hooks than during the previous render" and the page goes blank.
 * That is the shape this arrived in: a HoneyFarm admin on 2026-08-26, whose tab had been open
 * since the previous afternoon across four deploys.
 *
 * THIS PROJECT IS UNUSUALLY EXPOSED TO IT, by two decisions that are each correct alone:
 * sessions last 30 days because estate managers use personal devices, and every push to main
 * auto-deploys with no staging gate. Long-lived tabs meet frequent chunk churn. Harvest makes it
 * worse -- the app stays open all day.
 *
 * The fix is to reload, because the tab is simply out of date and a reload gets the new build.
 * The whole difficulty is doing that without ever trapping someone in a reload loop, which would
 * be far worse than the blank screen it replaces. Hence:
 *
 *   - a reload is attempted at most once per cooldown window, recorded in sessionStorage so it
 *     survives the reload itself (localStorage would leak the suppression across tabs, and a
 *     second tab's genuine failure deserves its own recovery);
 *   - offline is never a reload, because the chunk is unreachable rather than gone, and
 *     reloading an offline tab replaces a working page with the browser's error page;
 *   - storage being unavailable means we do NOT reload. Without a durable record of having
 *     tried, "reload once" cannot be enforced, and an unbounded loop is the one outcome worse
 *     than the bug.
 */

export const CHUNK_RELOAD_STORAGE_KEY = "farmflow_chunk_reload_at"

/** One window covers a deploy settling; a second failure after this is a real problem, not staleness. */
export const CHUNK_RELOAD_COOLDOWN_MS = 30_000

/**
 * Whether a thrown value is a chunk/module load failure.
 *
 * Matched on name, message and the script URL, because the shape differs by browser and by how
 * the failure surfaces (webpack's own ChunkLoadError, a bare TypeError from a failed dynamic
 * import, Safari's "Importing a module script failed"). Over-matching here is cheap -- the worst
 * case is one extra reload of a page that is already broken -- while under-matching returns the
 * blank screen this exists to prevent.
 */
export function isChunkLoadError(value: unknown): boolean {
  if (!value) return false

  const parts: string[] = []
  if (typeof value === "string") parts.push(value)
  else if (typeof value === "object") {
    const err = value as { name?: unknown; message?: unknown; toString?: () => string }
    if (typeof err.name === "string") parts.push(err.name)
    if (typeof err.message === "string") parts.push(err.message)
  }
  if (parts.length === 0) return false

  const text = parts.join(" ")
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk \S+ failed/i.test(text) ||
    /Failed to load chunk/i.test(text) ||
    /Loading CSS chunk/i.test(text) ||
    // Dynamic `import()` failures, which is how the App Router surfaces most of these.
    /error loading dynamically imported module/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  )
}

export type ReloadDecision =
  | { reload: true }
  | { reload: false; reason: "not-a-chunk-error" | "offline" | "recently-reloaded" | "no-storage" }

/**
 * Decide, without performing any side effect, whether this failure should trigger a reload.
 *
 * Split out from the listener so the policy can be tested directly. `now` and `storage` are
 * injected for the same reason.
 */
export function decideReload(input: {
  error: unknown
  online: boolean
  now: number
  storage: Pick<Storage, "getItem" | "setItem"> | null
}): ReloadDecision {
  const { error, online, now, storage } = input

  if (!isChunkLoadError(error)) return { reload: false, reason: "not-a-chunk-error" }

  // A missing chunk on a dead connection is a network problem. Reloading turns a page that still
  // works into the browser's offline page, and the chunk will still be unreachable afterwards.
  if (!online) return { reload: false, reason: "offline" }

  if (!storage) return { reload: false, reason: "no-storage" }

  try {
    // Absent and zero are different: `Number(null)` is 0, so testing `last > 0` would treat a
    // genuine timestamp of 0 as "never reloaded". Read the raw value and decide on that.
    const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY)
    const last = raw === null ? null : Number(raw)
    if (last !== null && Number.isFinite(last) && now - last < CHUNK_RELOAD_COOLDOWN_MS) {
      return { reload: false, reason: "recently-reloaded" }
    }
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now))
  } catch {
    // Storage present but unusable (Safari private mode, quota). Same reasoning as no-storage:
    // without a durable marker we cannot promise "once", so we do not reload at all.
    return { reload: false, reason: "no-storage" }
  }

  return { reload: true }
}
