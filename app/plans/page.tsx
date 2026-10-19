import PlansPage from "@/components/plans-page"
import type { Metadata } from "next"
import { seoFor } from "@/lib/site-url"

export const metadata: Metadata = seoFor("/plans")


export default function PlansRoute() {
  return <PlansPage />
}
