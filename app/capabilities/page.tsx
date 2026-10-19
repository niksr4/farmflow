import CapabilitiesPage from "@/components/capabilities-page"
import type { Metadata } from "next"
import { seoFor } from "@/lib/site-url"

export const metadata: Metadata = seoFor("/capabilities")


export default function CapabilitiesRoute() {
  return <CapabilitiesPage />
}
