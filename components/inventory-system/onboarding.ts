export type OnboardingStatusKey = "locations" | "inventory" | "labor" | "processing" | "dispatch" | "sales"

export type OnboardingStatusSnapshot = Record<OnboardingStatusKey, boolean>

export const INITIAL_ONBOARDING_STATUS: OnboardingStatusSnapshot = {
  locations: false,
  inventory: false,
  labor: false,
  processing: false,
  dispatch: false,
  sales: false,
}

export type OnboardingAccess = {
  canShowInventory: boolean
  canShowLabor: boolean
  canShowProcessing: boolean
  canShowDispatch: boolean
  canShowSales: boolean
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
): OnboardingStatusRequest[] => {
  const requests: OnboardingStatusRequest[] = []

  if (needsLocationSetup(access)) {
    requests.push({ key: "locations", endpoint: locationsEndpoint })
  }
  if (access.canShowInventory) {
    requests.push({ key: "inventory", endpoint: "/api/inventory-neon" })
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

  if (needsLocationSetup(access)) {
    const actionTab = getSetupActionTab(access)
    steps.push({
      key: "locations",
      title: "Add estate locations",
      description: "Set up the estate locations where coffee pulping or dispatch work happens.",
      done: status.locations,
      actionLabel: getActionLabel(actionTab),
      actionTab,
    })
  }

  if (access.canShowInventory) {
    steps.push({
      key: "inventory",
      title: "Add first inventory item",
      description: "Create your first inventory item and restock quantity.",
      done: status.inventory,
      actionLabel: "Go to Inventory",
      actionTab: "inventory",
    })
  }

  if (access.canShowLabor) {
    steps.push({
      key: "labor",
      title: "Log first labor deployment",
      description: "Track workers deployed for harvesting, pruning, irrigation, or any farm activity.",
      done: status.labor,
      actionLabel: "Go to Accounts",
      actionTab: "accounts",
    })
  }

  // Processing (pulping) is deliberately excluded: it's only possible during
  // harvest season and would permanently block checklist completion for
  // estates in the off-season. Workspace hints surface it when in season.

  if (access.canShowDispatch) {
    steps.push({
      key: "dispatch",
      title: "Create a dispatch record",
      description: "Send bags out and optionally note KGs received.",
      done: status.dispatch,
      actionLabel: "Open Dispatch",
      actionTab: "dispatch",
    })
  }

  if (access.canShowSales) {
    steps.push({
      key: "sales",
      title: "Record your first sale",
      description: "Capture bags sold and pricing for revenue tracking.",
      done: status.sales,
      actionLabel: "Open Sales",
      actionTab: "sales",
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
      title: "Labor tracking",
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
