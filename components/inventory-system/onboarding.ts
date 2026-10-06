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
 *   - Every goal an estate has is a ratio. Yield per acre, cost per kilo, spend per acre. So it is
 *     not enough to "add locations": every block has to carry an area, because a block with no
 *     acreage is a denominator of zero and silently removes itself from every comparison. That step
 *     is still all-or-nothing, it is just no longer FIRST -- see the order note below.
 *   - Stock is worth nothing to a report until it is *valued*. 91% of all consumption across every
 *     tenant is valued at zero because opening stock went in without a price.
 *   - A worker with no daily rate makes the muster more work, not less: Medappa has 10 of 33 rated
 *     and their writer types a rate on every allocation, which is exactly what the muster was
 *     meant to stop.
 *
 * COMPLETION IS "ALL", NOT "ANY", wherever the number is a denominator. That is deliberate and it
 * is the whole difference from the old list. A step that goes green on the first row teaches the
 * estate that one row was enough.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ THE ORDER WAS WRONG, AND THE DATA SAID SO. Checked against production on 2026-10-06: of six
 * tenants, exactly one had acreage on every block, and NOT ONE had a complete checklist. Five of
 * six were stalled on step one.
 *
 * Acreage was first because every useful ratio needs a denominator, which is sound reasoning about
 * reports and wrong reasoning about onboarding. It put the hardest all-or-nothing gate at the front:
 * Medappa has 21 blocks and would have had to measure all 21 before the list moved at all. They
 * have 29 workers all carrying rates and have been marking a muster for months, with a checklist
 * that still reads 0 done.
 *
 * So the list is now ordered by what it UNLOCKS, soonest first:
 *
 *   1. things you need to record anything at all     workers, blocks by name, the store
 *   2. things that make a recorded thing cost money  stock prices
 *   3. things that make the numbers mean one thing   the processing route
 *   4. things that let two numbers be compared       block acreage
 *   5. things that help but block nothing            weather, a second login
 *
 * Naming a block and measuring it are now SEPARATE steps. They were one, and conflating "I can
 * allocate work to this block" with "I can compare this block to another" is what built the wall.
 */

import { parseProcessingRoute } from "@/lib/crop-config"

export type OnboardingStatusKey =
  // The current flow, in order. Workers first: it is the only step that unblocks the thing an
  // estate does every single morning.
  | "workers"
  | "blocks"
  | "storehouse"
  | "inventory"
  | "processing_route"
  | "blocks_acreage"
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
  workers: false,
  blocks: false,
  storehouse: false,
  inventory: false,
  processing_route: false,
  blocks_acreage: false,
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

/**
 * Land only. A storehouse has a footprint but no planted area, and an estate-general location is
 * not a place at all -- it holds spend that belongs to no block. Asking either for an area would
 * leave HoneyFarm permanently stuck on step one, since two of their six locations are general.
 */
export const selectBlocks = (payload: any) =>
  asArray(payload?.locations).filter((l: any) => (l?.kind || "block") === "block")

/**
 * A block exists and has a name. Nothing more.
 *
 * Split out from the acreage check because they unlock different things and asking for both at once
 * is what stalled five of six tenants on step one. You can allocate a day's work to a block the
 * moment it has a name; you only need its area to compare it with another block.
 */
export const isBlocksNamedDone = (payload: any) => {
  const blocks = selectBlocks(payload)
  return blocks.length > 0 && blocks.every((b: any) => String(b?.name || "").trim().length > 0)
}

/**
 * Every block, not the first one. One block with an area and nine without produces a per-acre
 * figure that looks precise and is wrong by an order of magnitude.
 */
export const isBlocksAndAcreageDone = (payload: any) => {
  const blocks = selectBlocks(payload)
  return blocks.length > 0 && blocks.every((b: any) => Number(b?.areaAcres) > 0)
}

/**
 * Somebody has said how this estate processes.
 *
 * ⚠ READS FOR AN EXPLICIT ANSWER, NOT A USABLE ONE. `resolveProcessingRoute` would return "both"
 * for an estate that has never been asked, which is correct for deciding what to render and useless
 * here: the step would be green on day one and the question would never reach anybody. Null is the
 * unanswered state and the only thing that leaves this step open.
 *
 * This is why bag weight is NOT a step. It defaults to 50 kg, which is right for every tenant, so a
 * confirmation flag would be the only way to tell "checked it" from "never looked" -- a checkbox
 * whose only purpose is to be ticked. The bag weight sits on the same settings screen as the route
 * instead, where somebody answering this step will see it.
 */
export const isProcessingRouteDone = (payload: any) => {
  const profile = payload?.settings?.estateProfile ?? payload?.estateProfile
  return parseProcessingRoute(profile?.processingRoute) !== null
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

  // Requested in the order the steps are shown, so a reader can follow one list rather than two.
  if (access.canShowLabor) {
    requests.push({ key: "workers", endpoint: `/api/attendance?date=${todayIso || ""}&scope=all` })
  }
  // Blocks, acreage and storehouses all come from one endpoint; asking three times keeps each
  // step's rule in its own place rather than hiding unrelated conditions behind a shared index.
  requests.push({ key: "blocks", endpoint: locationsEndpoint })
  if (access.canShowInventory) {
    requests.push({ key: "storehouse", endpoint: locationsEndpoint })
    requests.push({ key: "inventory", endpoint: "/api/inventory-neon" })
  }
  if (access.canShowProcessing) {
    requests.push({ key: "processing_route", endpoint: "/api/tenant-settings" })
  }
  requests.push({ key: "blocks_acreage", endpoint: locationsEndpoint })
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

  // FIRST, and deliberately so. This is the one step that unblocks the thing an estate does every
  // morning. Acreage used to be here; see the header for what the production data said about that.
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
    key: "blocks",
    title: "Name your estates and blocks",
    description:
      "Every division of the land you would say out loud when telling somebody where a gang is working. Names are enough for now, and they are what lets a day's work be charged to a place.",
    done: status.blocks,
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
        "Every item in the store, with the quantity and the price paid. The price is what makes usage cost something later, and stock entered without one is consumed for free.",
      done: status.inventory,
      actionLabel: "Go to Inventory",
      actionTab: "inventory",
    })
  }

  if (access.canShowProcessing) {
    steps.push({
      key: "processing_route",
      title: "Say how you process your crop",
      description:
        "Whether you pulp your cherry into parchment, dry it whole as cherry, or run both lines. This decides which fields the pulping screen asks for and what every yield figure is measured against. Check your bag weight on the same screen while you are there.",
      done: status.processing_route,
      actionLabel: "Go to Settings",
      actionTab: "settings",
    })
  }

  // After the daily-use steps, not before them. Acreage unlocks comparison between blocks, which
  // matters a great deal and blocks nothing in the meantime.
  steps.push({
    key: "blocks_acreage",
    title: "Put an acreage on every block",
    description:
      "How many acres each block is. This is what turns a cost into a cost per acre, so until every block carries one, no two blocks can be compared. Worth doing properly once.",
    done: status.blocks_acreage,
    actionLabel: "Go to Settings",
    actionTab: "settings",
  })

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

/**
 * "Open X" for the launch guide, matching its sibling phases -- getActionLabel says "Go to X" and
 * belongs to the checklist steps. Taking the tab as its only argument is the point: a label and a
 * destination that are computed separately are a label and a destination that can disagree.
 */
const phaseActionLabel = (tab: string) => {
  switch (tab) {
    case "processing":
      return "Open Pulping"
    case "dispatch":
      return "Open Dispatch"
    case "accounts":
      return "Open Accounts"
    case "sales":
      return "Open Sales"
    default:
      return "Open Inventory"
  }
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
    // Derived from the tab it actually opens, never stated separately. The old nested ternary
    // fell through to a hardcoded "Open Inventory" whenever locations were already set -- but
    // foundationActionTab is processing or dispatch there for a tenant with Inventory disabled,
    // so the button named one tab and opened another.
    actionLabel: phaseActionLabel(foundationActionTab),
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
