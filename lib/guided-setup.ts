export type GuidedSetupGateInput = {
  role?: string | null
  requiresGuidedSetup?: unknown
  setupCompleted?: unknown
}

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase()

export const shouldForceGuidedSetup = (input: GuidedSetupGateInput) =>
  normalizeRole(input.role) === "admin" && Boolean(input.requiresGuidedSetup) && !Boolean(input.setupCompleted)

