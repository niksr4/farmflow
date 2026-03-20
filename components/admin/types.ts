import type { TenantFeatureFlags, TenantUiVariant } from "@/lib/tenant-experience"

export interface Tenant {
  id: string
  name: string
  created_at: string
  subscriptionPlan?: string
}

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
  before_data: any
  after_data: any
  created_at: string
}

export interface WeeklySummary {
  inventoryCount: number
  transactionCount: number
  processingCount: number
  dispatchCount: number
  salesCount: number
  salesRevenue: number
  laborSpend: number
  expenseSpend: number
  receivablesOutstanding: number
}

export interface WeeklySummaryRange {
  startDate: string
  endDate: string
  totalDays: number
}

export interface WeeklySummaryResponse {
  summary: WeeklySummary
  compareSummary: WeeklySummary | null
  range: WeeklySummaryRange | null
  compareRange: WeeklySummaryRange | null
}

export interface TenantProfile {
  uiVariant: TenantUiVariant
  featureFlags: TenantFeatureFlags
}

export type HealthStatus = "healthy" | "warning" | "critical" | "unknown"

export interface SystemHealthCheck {
  id: string
  label: string
  status: HealthStatus
  value: string
  detail: string
  actionPath?: string
}

export interface SystemHealthResponse {
  generatedAt: string
  checks: SystemHealthCheck[]
}

export type SystemHealthCounts = Record<HealthStatus, number>

export type WeeklyDeltaMeta = {
  text: string
  className: string
}

export type WeeklyDeltas = {
  transaction: WeeklyDeltaMeta
  processing: WeeklyDeltaMeta
  dispatch: WeeklyDeltaMeta
  salesCount: WeeklyDeltaMeta
  salesRevenue: WeeklyDeltaMeta
  laborSpend: WeeklyDeltaMeta
  expenseSpend: WeeklyDeltaMeta
}

export type SectionLink = {
  id: string
  label: string
}

export type WeeklyCompareMode = "none" | "previous"

export type UserModuleSource = "user" | "tenant" | "default" | ""

export type AuditEntityTypeOption = {
  id: string
  label: string
}
