import type { Metadata } from "next"

import LandingPage from "@/components/landing-page"
import StructuredData from "@/components/structured-data"
import { seoFor } from "@/lib/site-url"

/**
 * Title and description come from lib/site-url.ts, which also drives the sitemap, so a page cannot
 * be advertised to Google with no metadata of its own. Nine public pages were in exactly that
 * state: no metadata, inheriting a bare "FarmFlow" from the root layout, competing with each other
 * for every query.
 *
 * Somebody looking for this does not search the brand. They search the work they are trying to
 * stop doing by hand, which is why the title leads with "Coffee estate management software" and
 * the brand goes last.
 */
export const metadata: Metadata = seoFor("/")

export default function HomePage() {
  return (
    <>
      <StructuredData />
      <LandingPage />
    </>
  )
}
