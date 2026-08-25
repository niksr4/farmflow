/**
 * How a worker is engaged and, more usefully, how they get paid.
 *
 * The old list -- permanent / seasonal / contractor -- described employment status, which is a
 * human-resources idea. What an estate actually needs to know when costing a day is *how the money
 * works*, and those are not the same question: a permanent writer on a monthly salary and a
 * permanent field hand on a daily wage are both "permanent" and could not be more different to the
 * muster.
 *
 * These are the names HoneyFarm's own payroll uses, which is the point -- an estate should not have
 * to translate its roster into our vocabulary to file it.
 *
 * `staff` is the one that carries weight. Staff are paid once a month, so they have no daily rate,
 * so the muster cannot cost their day -- which is correct, not a limitation. Their salary is a
 * separate kind of labour cost that the product does not model yet (see the parked
 * `labour_charges` note in STATUS.md). Until it does, marking the type at least makes the reason
 * visible instead of leaving a rateless worker looking like an oversight.
 *
 * THE OLD THREE ARE KEPT, not migrated. Laxmi has 12 permanent and 8 seasonal, Medappa 23/10/1,
 * Estate Mock 3 -- 57 rows written in good faith against the list that existed. Rewriting them
 * would mean deciding, on their behalf, that a "permanent" of theirs is a `chkroll_pf` of
 * HoneyFarm's, and nobody has told us that. They stay valid and stay selectable; new estates get
 * the better vocabulary from the start.
 */

export const WORKER_TYPES = [
  { value: "staff", label: "Staff — paid monthly", paidDaily: false },
  { value: "chkroll_pf", label: "Chkroll / PF", paidDaily: true },
  { value: "casuals", label: "Casuals", paidDaily: true },
  { value: "seasonal_assam", label: "Seasonal / Assam", paidDaily: true },
  { value: "proprietor", label: "Proprietor", paidDaily: false },
  // Retained so 57 existing rows stay valid and editable. Not offered first, but not hidden
  // either -- a picker that cannot show a row's current value is how a save writes a placeholder
  // over real data, which is the same trap inventoryUnitOptions exists to avoid.
  { value: "permanent", label: "Permanent (old)", paidDaily: true },
  { value: "seasonal", label: "Seasonal (old)", paidDaily: true },
  { value: "contractor", label: "Contractor (old)", paidDaily: true },
] as const

export type WorkerType = (typeof WORKER_TYPES)[number]["value"]

export const WORKER_TYPE_VALUES = WORKER_TYPES.map((t) => t.value) as readonly WorkerType[]

export const isWorkerType = (value: unknown): value is WorkerType =>
  WORKER_TYPE_VALUES.includes(String(value ?? "") as WorkerType)

export const workerTypeLabel = (value: unknown): string =>
  WORKER_TYPES.find((t) => t.value === value)?.label ?? String(value ?? "")

/**
 * Whether someone of this type earns a daily wage at all.
 *
 * Staff and proprietors do not, so a missing daily_rate on them is the correct state rather than
 * an incomplete one. Anything that nags about unrated workers should read this before counting.
 */
export const isPaidDaily = (value: unknown): boolean =>
  WORKER_TYPES.find((t) => t.value === value)?.paidDaily ?? true
