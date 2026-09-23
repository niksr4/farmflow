/**
 * Which Accounts view opens for a given requested tab.
 *
 * Moved out of components/accounts-page.tsx unchanged on 2026-09-21. normalizeAccountsTab is a
 * pure function of its three arguments, which is the point of moving it: it can now be tested
 * directly instead of by mounting the page and inferring the answer from what renders.
 */

import type { AccountsTabValue, AccountsView } from "./types"

// Picking is now its own top-level tab (see components/inventory-system/tab-items.ts), so it is
// no longer offered as an Accounts sub-tab -- one home, not two. The flag stays as a kill switch
// for the sub-tab path only; the crash it was added for was a date-serialisation bug in
// app/api/picking-records/route.ts, fixed and covered by tests/date-column-serialisation.test.ts.
export const PICKING_TAB_DISABLED = true

export const normalizeAccountsTab = (
  initialTab: AccountsTabValue | undefined,
  showLaborManagement: boolean,
  showPickingLog: boolean,
): AccountsView => {
  if (!initialTab) {
    return "dashboard"
  }
  if (PICKING_TAB_DISABLED && initialTab === "picking") {
    return "dashboard"
  }
  if (!showPickingLog && !showLaborManagement && initialTab === "picking") {
    return "dashboard"
  }
  return initialTab
}
