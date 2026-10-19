import type { MetadataRoute } from "next"
import { CANONICAL_SITE_URL, PUBLIC_SITEMAP_ENTRIES } from "@/lib/site-url"

/**
 * The sitemap Google Search Console reads, served at /sitemap.xml.
 *
 * ⚠ CANONICAL HOST, NOT metadataBase. A preview build resolves metadataBase to its own
 * farmflowv1-<hash>.vercel.app hostname, and a sitemap is submitted to Search Console once and
 * then trusted for months -- so a preview hostname in here is a durable mistake in a way a wrong
 * Open Graph image is not. See lib/site-url.ts for why these are two different values.
 *
 * `lastModified` is the build time rather than a per-page date. Faking per-page dates is worse than
 * omitting them: a crawler that learns the dates are meaningless stops using them, and we have no
 * real per-page modification history to report.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return PUBLIC_SITEMAP_ENTRIES.map((entry) => ({
    url: new URL(entry.path, CANONICAL_SITE_URL).toString(),
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }))
}
