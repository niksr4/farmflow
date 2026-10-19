import JourneyPage from "@/components/journey-page"
import type { Metadata } from "next"
import { seoFor } from "@/lib/site-url"

export const metadata: Metadata = seoFor("/journey")


export default function JourneyRoute() {
  return <JourneyPage />
}
