import type { Metadata } from "next"

import LandingPage from "@/components/landing-page"

/**
 * The root layout titles every page "FarmFlow", which is fine for signed-in surfaces and wasted
 * on the one page search engines actually index. Someone looking for this does not search the
 * brand -- they search what they are trying to stop doing by hand. So the title names the crop
 * and the work, and stays scoped to this route rather than changing the title of the whole app.
 */
export const metadata: Metadata = {
  title: "FarmFlow — coffee estate management for Arabica and Robusta planters",
  description:
    "Track cherry intake, pulping, outturn, the daily muster, and cost per kilo of parchment. Built for coffee estates in Karnataka. Free for 30 days.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "FarmFlow",
    title: "Cherry to parchment to sale. One book.",
    description:
      "Coffee estate management built around outturn, the muster, and cost per kilo — not a crop-agnostic farm template.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cherry to parchment to sale. One book.",
    description: "Coffee estate management for Arabica and Robusta planters. Free for 30 days.",
  },
}

export default function HomePage() {
  return <LandingPage />
}
