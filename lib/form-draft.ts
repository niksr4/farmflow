/**
 * Storage keys for in-progress form drafts (hooks/use-form-draft.ts).
 *
 * Drafts were previously stored under `farmflow:draft:<form>` — no tenant, no user. Estate
 * managers share devices, which is the whole reason the draft feature exists (a killed app
 * on a phone in a field shouldn't lose a half-filled entry). So the realistic sequence was:
 * manager A on tenant X half-fills a labour entry, closes the app, manager B on tenant Y logs
 * in on the same device, opens the same form, and is offered A's draft — activity codes,
 * worker counts, wages and notes belonging to another estate.
 *
 * That is a cross-tenant leak that sits entirely outside the database, so none of the RLS work
 * touches it. Keys are now scoped to tenant + user, and drafts written by the old unscoped
 * scheme are deleted on sight rather than migrated: they cannot be attributed to an owner
 * after the fact, and guessing wrong is the bug.
 */

/** Everything this module has ever written starts here — used to find legacy keys. */
export const DRAFT_KEY_PREFIX = "farmflow:draft:"

/**
 * Scoped keys carry a version segment so unscoped ones are identifiable by shape alone.
 * Without it, `farmflow:draft:labor-form` and `farmflow:draft:<tenant>:<user>:labor-form`
 * cannot be told apart reliably.
 */
export const SCOPED_DRAFT_KEY_PREFIX = `${DRAFT_KEY_PREFIX}v2:`

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Identity a draft belongs to, or null when there is no signed-in user to attribute it to.
 * Null means "do not persist" — an unattributable draft is exactly what caused the leak.
 */
export function buildDraftScope(
  tenantId: string | null | undefined,
  username: string | null | undefined,
): string | null {
  const tenant = String(tenantId ?? "").trim()
  const user = String(username ?? "").trim()
  if (!tenant || !user) return null
  // Encoded so a ':' in either part cannot forge a different scope's key.
  return `${encodeURIComponent(tenant)}:${encodeURIComponent(user)}`
}

export const buildDraftKey = (scope: string, formKey: string): string =>
  `${SCOPED_DRAFT_KEY_PREFIX}${scope}:${formKey}`

/** A draft key from the unscoped scheme, which could belong to anyone who used this device. */
export const isLegacyUnscopedDraftKey = (storageKey: string): boolean =>
  storageKey.startsWith(DRAFT_KEY_PREFIX) && !storageKey.startsWith(SCOPED_DRAFT_KEY_PREFIX)

export const isDraftExpired = (
  savedAt: number | null | undefined,
  now: number = Date.now(),
  ttlMs: number = DRAFT_TTL_MS,
): boolean => now - (savedAt || 0) > ttlMs

/**
 * Remove every draft left behind by the unscoped scheme. Runs once on mount so a device that
 * already holds another tenant's draft is cleaned the first time the fixed build loads,
 * rather than only for drafts written from now on.
 */
export function purgeLegacyDrafts(storage: Pick<Storage, "key" | "length" | "removeItem">): number {
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const storageKey = storage.key(i)
    if (storageKey && isLegacyUnscopedDraftKey(storageKey)) doomed.push(storageKey)
  }
  for (const storageKey of doomed) storage.removeItem(storageKey)
  return doomed.length
}
