/**
 * Where FarmFlow lives, for the three different questions that asks.
 *
 * These are NOT the same value, and conflating them is how preview hostnames end up in a sitemap
 * submitted to Google Search Console:
 *
 *  - `CANONICAL_SITE_URL` is the address the business has. It never varies by environment, because
 *    a canonical URL that changes is not canonical. Search engines, sitemaps and robots.txt get
 *    this one.
 *  - `resolveMetadataBase()` is what a RUNNING deployment is reachable at, so Open Graph images and
 *    relative metadata resolve correctly on a preview build too. The app shell gets this one.
 *
 * The apex redirects to www (307, verified), so www is canonical and the apex is not.
 */

/**
 * ⚠ HARDCODED ON PURPOSE. Deriving this from VERCEL_URL would put a preview hostname into
 * robots.txt and the sitemap on every preview build -- and a sitemap is a thing you hand to
 * Google once and forget, so a wrong value there is durable in a way a wrong OG image is not.
 */
export const CANONICAL_SITE_URL = "https://www.thefarmflow.in"

/**
 * The base a given deployment is actually reachable at.
 *
 * Extracted from app/layout.tsx so the layout, the sitemap and robots.txt cannot drift onto
 * different ideas of where the site is -- which was possible when this logic lived inline in one
 * file and nothing else could reach it.
 */
export const resolveMetadataBase = (): URL => {
  const explicitUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim()
  if (explicitUrl) {
    try {
      return new URL(explicitUrl)
    } catch {
      // fall through to Vercel/local fallbacks.
    }
  }

  const vercelUrl = String(
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "",
  ).trim()
  if (vercelUrl) {
    const normalized =
      vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")
        ? vercelUrl
        : `https://${vercelUrl}`
    try {
      return new URL(normalized)
    } catch {
      // fall through to localhost.
    }
  }

  return new URL("http://localhost:3000")
}

/**
 * The public, indexable pages, and nothing else.
 *
 * A sitemap is a curated claim, not an inventory: listing every route tells Google to index the
 * password-reset form and the offline fallback. So this is a hand-kept list -- and because this
 * repo has been bitten by hand-kept lists repeatedly, tests/sitemap-covers-the-public-site.test.ts
 * derives the set of ungated pages from the tree and fails when a new marketing page is added
 * without a decision being recorded here.
 *
 * `priority` is relative, not absolute. The landing page and the pricing page are what we want
 * ranking; legal pages exist to be findable, not promoted.
 */
export type SitemapEntry = {
  path: string
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly"
  priority: number
}

export const PUBLIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/plans", changeFrequency: "weekly", priority: 0.9 },
  { path: "/capabilities", changeFrequency: "weekly", priority: 0.9 },
  { path: "/journey", changeFrequency: "monthly", priority: 0.7 },
  { path: "/standards", changeFrequency: "monthly", priority: 0.7 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
  // The signup page is a landing page as much as a form -- somebody searching "coffee estate
  // management software India" and arriving here is the point of all of this.
  { path: "/signup", changeFrequency: "monthly", priority: 0.8 },
  // Findable, deliberately not promoted.
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/dpa", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/billing", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/subprocessors", changeFrequency: "yearly", priority: 0.2 },
]

/**
 * Ungated pages deliberately kept OUT of the sitemap, each with the reason.
 *
 * Being reachable without a session does not make a page worth indexing. Several of these would be
 * actively bad in search results: a reset-password URL is meaningless without its token, and
 * /lot/[lotId] 404s for every possible input because lot traceability has no rows.
 */
export const SITEMAP_EXCLUSIONS: Record<string, string> = {
  "/login": "a sign-in form: nothing to rank, and a cold arrival here converts nobody",
  "/forgot-password": "a recovery form, useful only to someone who already has an account",
  "/reset-password": "meaningless without the token that arrives by email",
  "/verify-email": "meaningless without the token",
  "/verify-email-change": "meaningless without the token",
  "/settings/email": "account surface, reachable only when signed in in practice",
  "/settings/reset-password": "account surface, reachable only once signed in",
  "/dashboard": "the application itself, behind a login",
  "/attendance-report": "tenant operational data, not marketing",
  "/offline": "the service-worker fallback shell, not a page anyone should land on",
  "/trial-expired": "a billing state, not content",
  "/lot/[lotId]": "dynamic, and 404s for every input -- lot traceability has zero rows",
}
