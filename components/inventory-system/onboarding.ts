/**
 * What an estate has to tell FarmFlow before FarmFlow can tell it anything.
 *
 * The old checklist asked for a manager, some locations, activity codes, one inventory item and
 * one labour row -- five steps that could all be satisfied without the app being able to answer a
 * single useful question. "Add first inventory item" is done after one item, so an estate finished
 * onboarding with one of forty items priced. Every real tenant then sat in that state for months.
 *
 * These steps are shaped around what the answers are *for*:
 *
 *   - Every goal an estate has is a ratio. Yield per acre, cost per kilo, spend per acre. So the
 *     first step is not "add locations", it is every block carrying an area, because a block with
 *     no acreage is a denominator of zero and silently removes itself from every comparison.
 *   - Stock is worth nothing to a report until it is *valued*. 91% of all consumption across every
 *     tenant is valued at zero because opening stock went in without a price.
 *   - A worker with no daily rate makes the muster more work, not less: Medappa has 10 of 33 rated
 *     and their writer types a rate on every allocation, which is exactly what the muster was
 *     meant to stop.
 *
 * COMPLETION IS "ALL", NOT "ANY", wherever the number is a denominator. That is deliberate and it
 * is the whole difference from the old list. A step that goes green on the first row teaches the
 * estate that one row was enough.
 */

export type OnboardingStatusKey =
  // The current flow, in order.
  | "blocks_acreage"
  | "storehouse"
  | "inventory"
  | "workers"
  | "weather"
  | "team_member"
  // Still read by buildLaunchGuidePhases and the seasonal hints below.
  | "locations"
  | "account_codes"
  | "labor"
  | "processing"
  | "dispatch"
  | "sales"

export type OnboardingStatusSnapshot = Record<OnboardingStatusKey, boolean>

export const INITIAL_ONBOARDING_STATUS: OnboardingStatusSnapshot = {
  blocks_acreage: false,
  storehouse: false,
  inventory: false,
  workers: false,
  weather: false,
  team_member: false,
  locations: false,
  account_codes: false,
  labor: false,
  processing: false,
  dispatch: false,
  sales: false,
}

export type OnboardingAccess = {
  canShowInventory: boolean
  canShowAccountCodes: boolean
  canShowLabor: boolean
  canShowProcessing: boolean
  canShowDispatch: boolean
  canShowSales: boolean
  canManageUsers: boolean
}

export type OnboardingStatusRequest = {
  key: OnboardingStatusKey
  endpoint: string
}

export type OnboardingStepConfig = {
  key: OnboardingStatusKey
  title: string
  description: string
  actionLabel: string
  actionTab: string
  done: boolean
}

export type LaunchGuidePhaseConfig = {
  id: string
  label: string
  title: string
  detail: string
  actionLabel: string
  actionTab: string
  done: boolean
}

/* ── completion checks ────────────────────────────────────────────────────────────────────────
   Pure and exported so they can be tested against real payload shapes. A check that reads the
   wrong field name does not throw -- the step simply never goes green, which is invisible until
   an estate complains that the checklist is stuck. */

const asArray = (value: unknown) => (Array.isArray(value) ? value : [])

/** Blocks only, since a storehouse has a footprint but no planted area. */
export const selectBlocks = (payload: any) =>
  asArray(payload?.locations).filter((l: any) => (l?.kind || "block") !== "store")

/**
 * Every block, not the first one. One block with an area and nine without produces a per-acre
 * figure that looks precise and is wrong by an order of magnitude.
 */
export const isBlocksAndAcreageDone = (payload: any) => {
  const blocks = selectBlocks(payload)
  return blocks.length > 0 && blocks.every((b: any) => Number(b?.areaAcres) > 0)
}

export const countBlocksMissingAcreage = (payload: any) =>
  selectBlocks(payload).filter((b: any) => !(Number(b?.areaAcres) > 0)).length

export const isStorehouseDone = (payload: any) =>
  asArray(payload?.locations).some((l: any) => l?.kind === "store")

/**
 * Stock has to be valued, not merely present. An item at Rs 0 makes every depletion of it free,
 * which is how Rs 17 lakh of consumption came to be recorded as costing nothing.
 */
export const isInventoryDone = (payload: any) => {
  const items = asArray(payload?.inventory).length ? asArray(payload?.inventory) : asArray(payload?.items)
  if (items.length === 0) return false
  return items.every((i: any) => Number(i?.avg_price ?? i?.avgPrice ?? i?.price) > 0)
}

export const countItemsMissingPrice = (payload: any) => {
  const items = asArray(payload?.inventory).length ? asArray(payload?.inventory) : asArray(payload?.items)
  return items.filter((i: any) => !(Number(i?.avg_price ?? i?.avgPrice ?? i?.price) > 0)).length
}

/** A rate on every worker, or the muster still asks for one on every line. */
export const isWorkersDone = (payload: any) => {
  const workers = asArray(payload?.workers)
  return workers.length > 0 && workers.every((w: any) => Number(w?.dailyRate) > 0)
}

export const countWorkersMissingRate = (payload: any) =>
  asArray(payload?.workers).filter((w: any) => !(Number(w?.dailyRate) > 0)).length

/**
 * Both coordinates or neither -- a latitude with no longitude is not a location, and the forecast
 * silently falls back to a regional default that can be a hundred kilometres away.
 */
export const isWeatherDone = (payload: any) => {
  const profile = payload?.settings?.estateProfile ?? payload?.estateProfile
  // Null must be rejected before Number() sees it: Number(null) is 0 and Number.isFinite(0) is
  // true, so a latitude with a missing longitude would have read as a complete pin.
  const isCoord = (v: unknown) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))
  return isCoord(profile?.weatherLatitude) && isCoord(profile?.weatherLongitude)
}

/** Done when someone other than the admin themselves can sign in and record. */
export const isTeamMemberDone = (payload: any) => asArray(payload?.users).length > 1

const needsLocationSetup = (access: OnboardingAccess) =>
  access.canShowProcessing || access.canShowDispatch || access.canShowSales

const getSetupActionTab = (access: OnboardingAccess) => {
  if (access.canShowProcessing) return "processing"
  if (access.canShowDispatch) return "dispatch"
  return "inventory"
}

const getActionLabel = (tab: string) => {
  switch (tab) {
    case "processing":
      return "Go to Pulping"
    case "dispatch":
      return "Go to Dispatch"
    default:
      return "Go to Inventory"
  }
}

export const getOnboardingStatusRequests = (
  locationsEndpoint: string,
  access: OnboardingAccess,
  tenantId?: string | null,
  todayIso?: string,
): OnboardingStatusRequest[] => {
  const requests: OnboardingStatusRequest[] = []

  // Blocks and storehouses come from one endpoint; asking twice keeps each step's rule in its own
  // place rather than hiding two unrelated conditions behind a shared payload index.
  requests.push({ key: "blocks_acreage", endpoint: locationsEndpoint })
  if (access.canShowInventory) {
    requests.push({ key: "storehouse", endpoint: locationsEndpoint })
    requests.push({ key: "inventory", endpoint: "/api/inventory-neon" })
  }
  if (access.canShowLabor) {
    requests.push({ key: "workers", endpoint: `/api/attendance?date=${todayIso || ""}&scope=all` })
  }
  requests.push({ key: "weather", endpoint: "/api/tenant-settings" })
  if (access.canManageUsers && tenantId) {
    requests.push({ key: "team_member", endpoint: `/api/admin/users?tenantId=${encodeURIComponent(tenantId)}` })
  }

  // Still needed by the launch guide, which reports the season rhythm rather than setup.
  if (needsLocationSetup(access)) {
    requests.push({ key: "locations", endpoint: locationsEndpoint })
  }
  if (access.canShowAccountCodes) {
    requests.push({ key: "account_codes", endpoint: "/api/get-activity" })
  }
  if (access.canShowLabor) {
    requests.push({ key: "labor", endpoint: "/api/labor-neon?limit=1&offset=0" })
  }
  if (access.canShowProcessing) {
    requests.push({ key: "processing", endpoint: "/api/processing-records?limit=1&offset=0" })
  }
  if (access.canShowDispatch) {
    requests.push({ key: "dispatch", endpoint: "/api/dispatch?limit=1&offset=0" })
  }
  if (access.canShowSales) {
    requests.push({ key: "sales", endpoint: "/api/sales?limit=1&offset=0" })
  }

  return requests
}

export const buildOnboardingSteps = (
  status: OnboardingStatusSnapshot,
  access: OnboardingAccess,
): OnboardingStepConfig[] => {
  const steps: OnboardingStepConfig[] = []

  // First, and deliberately so. Everything the app can tell an estate is per-acre or per-block.
  steps.push({
    key: "blocks_acreage",
    title: "Map your estate",
    description:
      "Name each estate, the blocks inside it, and how many acres each block is. Acreage is what turns cost into cost per acre — without it, no two blocks can be compared.",
    done: status.blocks_acreage,
    actionLabel: "Go to Settings",
    actionTab: "settings",
  })

  if (access.canShowInventory) {
    steps.push({
      key: "storehouse",
      title: "Name your storehouse",
      description:
        "Stock sits in a store, not on a block. One store can serve every estate, or each estate can keep its own.",
      done: status.storehouse,
      actionLabel: "Go to Settings",
      actionTab: "settings",
    })

    steps.push({
      key: "inventory",
      title: "Enter opening stock and what it cost",
      description:
        "Every item in the store, with the quantity and the price paid. The price is what makes usage cost something later — stock entered without one is consumed for free.",
      done: status.inventory,
      actionLabel: "Go to Inventory",
      actionTab: "inventory",
    })
  }

  if (access.canShowLabor) {
    steps.push({
      key: "workers",
      title: "Add your workers and their daily rates",
      description:
        "Everyone who turns up, with what they are paid a day. Contract crews go on as one line with a headcount. Without rates, the muster asks for a wage on every single line.",
      done: status.workers,
      actionLabel: "Go to Muster",
      actionTab: "attendance",
    })
  }

  steps.push({
    key: "weather",
    title: "Pin your weather location",
    description:
      "Latitude and longitude for the estate itself. Without them the forecast falls back to a regional average that can be a hundred kilometres away.",
    done: status.weather,
    actionLabel: "Go to Settings",
    actionTab: "settings",
  })

  if (access.canManageUsers) {
    steps.push({
      key: "team_member",
      title: "Give your writer a login",
      description:
        "The person marking the muster each morning is rarely the person who signed up. Give them their own account so the daily record has a name on it.",
      done: status.team_member,
      actionLabel: "Go to Settings",
      actionTab: "settings",
    })
  }

  return steps
}

export const buildLaunchGuidePhases = (
  status: OnboardingStatusSnapshot,
  access: OnboardingAccess,
): LaunchGuidePhaseConfig[] => {
  const phases: LaunchGuidePhaseConfig[] = []
  const requiresLocations = needsLocationSetup(access)
  const setupActionTab = getSetupActionTab(access)
  const hasInventoryBaseline = access.canShowInventory ? status.inventory : true
  const foundationDone = requiresLocations ? status.locations && hasInventoryBaseline : hasInventoryBaseline
  const foundationActionTab =
    requiresLocations && !status.locations ? setupActionTab : access.canShowInventory ? "inventory" : setupActionTab

  phases.push({
    id: "phase-1",
    label: "Week 1",
    title: requiresLocations ? "Foundation setup" : "Inventory baseline",
    detail: requiresLocations
      ? "Configure locations and inventory masters before daily records begin."
      : "Create inventory items and record opening movements to establish your stock baseline.",
    done: foundationDone,
    actionLabel:
      requiresLocations && !status.locations
        ? foundationActionTab === "inventory"
          ? "Open Inventory"
          : getActionLabel(foundationActionTab)
        : "Open Inventory",
    actionTab: foundationActionTab,
  })

  if (access.canShowLabor) {
    phases.push({
      id: "phase-labor",
      label: "Week 2",
      title: "Labour tracking",
      detail: "Log daily worker deployments by activity code so costs stay accurate from week one.",
      done: status.labor,
      actionLabel: "Open Accounts",
      actionTab: "accounts",
    })
  }

  if (access.canShowProcessing) {
    phases.push({
      id: "phase-2",
      label: access.canShowLabor ? "Week 3" : "Week 2",
      title: "Daily pulping rhythm",
      detail: "Capture Arabica and Robusta pulping output every day with consistent operating notes.",
      done: status.processing,
      actionLabel: "Open Pulping",
      actionTab: "processing",
    })
  }

  if (access.canShowDispatch) {
    phases.push({
      id: "phase-3",
      label: "Week 3",
      title: "Dispatch discipline",
      detail: "Record bags dispatched and KGs received so sales stock is reliable.",
      done: status.dispatch,
      actionLabel: "Open Dispatch",
      actionTab: "dispatch",
    })
  }

  if (access.canShowSales) {
    phases.push({
      id: "phase-4",
      label: "Week 4",
      title: "Sales close",
      detail: "Capture the first sale so inventory movement and revenue stay aligned.",
      done: status.sales,
      actionLabel: "Open Sales",
      actionTab: "sales",
    })
  }

  return phases
}
