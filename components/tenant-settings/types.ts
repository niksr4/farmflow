export interface User {
  id: string
  username: string
  role: string
  tenant_id: string
  created_at: string
}

export interface ModulePermission {
  id: string
  label: string
  enabled: boolean
  lockedByPlan?: boolean
}

export interface AuditLog {
  id: string
  tenant_id: string
  user_id: string | null
  username: string
  role: string
  action: string
  entity_type: string
  entity_id: string | null
  before_data: unknown
  after_data: unknown
  created_at: string
}

export interface LocationRow {
  id: string
  name: string
  code: string
  estate?: string | null
  /** Planted acres. Null until recorded; every per-acre figure divides by it. */
  areaAcres?: number | null
  /** Settings lists blocks and storehouses together, so a row here may be either. */
  kind?: "block" | "store"
}

export interface PrivacyStatus {
  noticeVersion: string
  acceptedAt: string | null
  consentMarketing: boolean
  consentMarketingUpdatedAt: string | null
  deletionRequestedAt: string | null
  anonymizedAt: string | null
}

export interface UiPreferencesDraft {
  hideEmptyMetrics: boolean
}

export type SectionLink = {
  id: string
  label: string
}

export type RoleOption = "admin" | "user"

export type UserModuleSource = "user" | "tenant" | "default" | ""

export interface LocationPermission {
  id: string
  name: string
  code: string
  estate: string | null
  enabled: boolean
}

// No "tenant" tier here (unlike UserModuleSource) -- there's no tenant-level location default to
// fall back to, only "does this user have an explicit assignment or not."
export type UserLocationSource = "user" | "default" | ""
