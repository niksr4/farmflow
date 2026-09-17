import type { TenantPlanId } from "@/lib/modules"

/**
 * Shapes for the in-app training manual.
 *
 * Moved out of components/app-training-manual.tsx verbatim, which was 912 lines of content and
 * content-building ahead of 18 lines of component.
 */

export type ManualItem = {
  name: string
  whatItIs: string
  openItWhen: string
  doneLooksLike: string
}

export type ManualGroup = {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badgeClassName: string
  items: ManualItem[]
}

export type AppTrainingManualProps = {
  enabledModules?: string[]
  isTailored?: boolean
  planId?: TenantPlanId
  userRole?: "admin" | "owner" | "user" | null
}

