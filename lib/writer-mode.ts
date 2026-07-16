/**
 * Writer mode — the pared-down app for `role=user`.
 *
 * FarmFlow serves two very different people: the owner/manager who wants
 * analysis, and the estate writer who records labour, expenses, and rain on
 * a phone. Module access already gates *what* a user may see; writer mode
 * gates *complexity* — a writer gets the few screens they use daily and
 * nothing else. Managers and admins keep the full workspace.
 */

// Grounded in real writer usage (audit log): writers record labour, expenses,
// rain, stock usage, pepper/processing, and dispatch. Analysis tabs
// (balance sheet, P&L, season, AI, sales) stay manager-only.
export const WRITER_TABS = ["home", "accounts", "rainfall", "inventory", "processing", "dispatch"] as const

/** Entry-oriented accounts sub-tabs; analysis/management ones are hidden */
export const WRITER_ACCOUNTS_TABS = ["labour", "expenses", "attendance", "picking"] as const

export const isWriterRole = (role: string | null | undefined): boolean =>
  String(role || "").toLowerCase() === "user"

export const filterTabsForWriter = (tabs: string[], role: string | null | undefined): string[] =>
  isWriterRole(role) ? tabs.filter((tab) => (WRITER_TABS as readonly string[]).includes(tab)) : tabs
