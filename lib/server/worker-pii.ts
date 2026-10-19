import { isAdminRole, type UserRole } from "@/lib/permissions"

/**
 * WORKER CONTACT AND BANK DETAILS ARE ADMIN-ONLY.
 *
 * ⚠ GET /api/attendance AND GET /api/attendance/workers/[id] HANDED THESE TO ANY WRITER.
 * Both routes were guarded by requireModuleAccess("accounts") and nothing else. `accounts` is
 * tenant-enabled everywhere and only `balance-sheet` is in USER_ROLE_BLOCKED_MODULES, so a
 * role=user account with no user_modules rows resolves it as enabled -- and read every worker's
 * account number, IFSC and phone number.
 *
 * The clincher that this was an oversight rather than a decision: the PUT handler in
 * workers/[id] already writes `bank_account: "[redacted]"` into its OWN audit log. The code
 * knew the fields were sensitive on write and gave them away on read.
 *
 * Deliberately NOT here: monthlyWage and dailyRate. Whether a writer may see the wage sheet is a
 * live product question with a trap attached -- `accounts` is in USER_MUTATION_MODULES, so moving
 * the module gate would also remove every writer's ability to RECORD attendance. Wages are what
 * the muster is for; a bank account is not.
 */
export const WORKER_PII_FIELDS = ["phone", "bankName", "bankAccount", "bankIfsc"] as const

export type WorkerPiiField = (typeof WORKER_PII_FIELDS)[number]

/** True when this role may see worker contact and bank details. */
export const canReadWorkerPii = (role: UserRole | string | null | undefined): boolean =>
  isAdminRole(role as UserRole)

/**
 * Blank the PII fields unless the role may read them.
 *
 * Returns null rather than dropping the keys, so the response shape does not change by role --
 * a missing key and a null read identically to a form that has not been filled in, and the
 * client already types all four as nullable.
 */
export function redactWorkerPii<T extends Partial<Record<WorkerPiiField, unknown>>>(
  worker: T,
  role: UserRole | string | null | undefined,
): T {
  if (canReadWorkerPii(role)) return worker
  const out = { ...worker }
  for (const field of WORKER_PII_FIELDS) {
    if (field in out) (out as Record<string, unknown>)[field] = null
  }
  return out
}

/**
 * ⚠ CANNOT-READ MUST IMPLY CANNOT-WRITE, OR REDACTING THE READ DESTROYS DATA.
 *
 * This was nearly shipped as a one-sided fix. The Workers tab renders the Bank column to every
 * role (it is not isAdmin-gated), so once the GET returns null for a writer, their edit form
 * loads EMPTY -- and the PUT computes `String(body.bankAccount || "").trim() || null`, where
 * null !== undefined, so the CASE WHEN writes it. A writer correcting a worker's spelling would
 * silently wipe the account number, and nobody would find out until a payout failed.
 *
 * So a role that cannot read these fields does not get to submit them either: every protected
 * field becomes `undefined`, which every one of these handlers already means "leave alone".
 *
 * Returns the values unchanged for admin and owner.
 */
export function stripWorkerPiiWrites<T extends Partial<Record<WorkerPiiField, unknown>>>(
  values: T,
  role: UserRole | string | null | undefined,
): T {
  if (canReadWorkerPii(role)) return values
  const out = { ...values }
  for (const field of WORKER_PII_FIELDS) {
    if (field in out) (out as Record<string, unknown>)[field] = undefined
  }
  return out
}
