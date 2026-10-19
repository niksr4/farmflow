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
  /**
   * The <title>, without the " | FarmFlow" suffix the root template appends.
   *
   * ⚠ NINE OF THESE PAGES HAD NO METADATA AT ALL and inherited a bare "FarmFlow" from the root
   * layout, so Google saw the same title and the same description on /plans, /capabilities,
   * /journey, /standards, /trust, /contact, /signup and every legal page. Duplicate titles across
   * a site are a direct ranking problem: there is nothing for a query to match against, and
   * nothing to tell two results apart in a list.
   *
   * Keep these under about 60 characters. Google truncates past that, and a truncated title is a
   * sentence somebody else finished for you.
   */
  title: string
  /**
   * The meta description. Not a ranking factor directly, but it is the sentence under the blue
   * link, so it decides whether anybody clicks. Aim for 140 to 160 characters.
   */
  description: string
}

export const PUBLIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  {
    path: "/",
    changeFrequency: "weekly",
    priority: 1.0,
    // Leads with the phrase a planter actually types. The brand goes last because "FarmFlow"
    // is not what anybody searches for yet.
    title: "Coffee estate management software",
    description:
      "Track cherry intake, pulping, outturn, the daily muster and cost per kilo of parchment. Built for Arabica and Robusta estates in Karnataka. Free for 30 days.",
  },
  {
    path: "/plans",
    changeFrequency: "weekly",
    priority: 0.9,
    title: "Pricing for coffee estates",
    description:
      "What FarmFlow costs, what each plan includes, and which one suits a single estate or a group. Priced in rupees, billed annually, free for the first 30 days.",
  },
  {
    path: "/capabilities",
    changeFrequency: "weekly",
    priority: 0.9,
    title: "Labour, the store, and what a kilo really cost",
    description:
      "The muster roll, worker payroll, the fertiliser store, pulping and outturn, and cost per kilo by block. Everything an estate writes down in a day, in one place.",
  },
  {
    path: "/journey",
    changeFrequency: "monthly",
    priority: 0.7,
    title: "From cherry intake to the curing works",
    description:
      "How a crop moves through FarmFlow: weighed at the store, pulped and dried, costed by block, then dispatched to the curer with the paperwork already done.",
  },
  {
    path: "/standards",
    changeFrequency: "monthly",
    priority: 0.7,
    title: "Record keeping that holds up",
    description:
      "How FarmFlow keeps numbers you can defend: a wrong figure is worse than no figure, so every total traces back to the day and the worker it came from.",
  },
  {
    path: "/trust",
    changeFrequency: "monthly",
    priority: 0.7,
    title: "Security and how your data is handled",
    description:
      "Where your estate's data lives, who can see it, how tenants are kept apart at the database level, and what happens when you ask for it back or ask us to delete it.",
  },
  {
    path: "/contact",
    changeFrequency: "monthly",
    priority: 0.8,
    title: "Talk to us about your estate",
    description:
      "A real person reads these. Tell us about your estate, your blocks and how you record labour today, and we will tell you whether FarmFlow fits.",
  },
  {
    path: "/signup",
    changeFrequency: "monthly",
    priority: 0.8,
    title: "Start a 30 day free trial",
    description:
      "Set up your estate in a few minutes. No card required. Eighty seven activity codes and your blocks are ready before you enter your first day of labour.",
  },
  {
    path: "/privacy",
    changeFrequency: "yearly",
    priority: 0.3,
    title: "Privacy notice",
    description:
      "What personal data FarmFlow holds about estate workers and users, why we hold it, how long for, and how to ask for a copy or ask us to erase it.",
  },
  {
    path: "/legal/terms",
    changeFrequency: "yearly",
    priority: 0.3,
    title: "Terms of service",
    description:
      "The terms under which an estate uses FarmFlow: what we provide, what you are responsible for, how billing works and how either side can end the arrangement.",
  },
  {
    path: "/legal/privacy",
    changeFrequency: "yearly",
    priority: 0.3,
    title: "Privacy policy",
    description:
      "The full privacy policy for FarmFlow, covering what we collect, the legal basis for it, who processes it on our behalf, and your rights under the DPDP Act.",
  },
  {
    path: "/legal/dpa",
    changeFrequency: "yearly",
    priority: 0.2,
    title: "Data processing agreement",
    description:
      "The data processing terms between your estate as controller and FarmFlow as processor, including security measures, subprocessors and breach notification.",
  },
  {
    path: "/legal/billing",
    changeFrequency: "yearly",
    priority: 0.2,
    title: "Billing terms",
    description:
      "How FarmFlow charges: billing cycles, what happens at renewal, how to change plan, refunds, and what access looks like if an invoice goes unpaid.",
  },
  {
    path: "/legal/subprocessors",
    changeFrequency: "yearly",
    priority: 0.2,
    title: "Subprocessors",
    description:
      "The third parties FarmFlow relies on to run the service, what each one does, where it processes data, and why it is needed.",
  },
]

/**
 * Build a page's Metadata from the single list above.
 *
 * One source of truth for the sitemap, the <title>, the description and the canonical, so a page
 * cannot end up advertised in the sitemap with no metadata of its own, which is the state nine of
 * these were in.
 *
 * The Open Graph URL is the CANONICAL host. It used to be the apex, which 307s to www, while the
 * sitemap said www -- two contradictory canonical signals on the same site.
 */
export const seoFor = (path: string) => {
  const entry = PUBLIC_SITEMAP_ENTRIES.find((e) => e.path === path)
  if (!entry) {
    throw new Error(
      `No SEO entry for ${path}. Add it to PUBLIC_SITEMAP_ENTRIES in lib/site-url.ts, or the page ` +
        "ships with the root layout's generic title and competes with every other page.",
    )
  }
  const url = new URL(entry.path, CANONICAL_SITE_URL).toString()
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: entry.path },
    openGraph: {
      type: "website" as const,
      url,
      siteName: "FarmFlow",
      title: entry.title,
      description: entry.description,
    },
    twitter: {
      card: "summary_large_image" as const,
      title: entry.title,
      description: entry.description,
    },
  }
}

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
