import type { MetadataRoute } from "next"
import { CANONICAL_SITE_URL } from "@/lib/site-url"

/**
 * robots.txt, served at /robots.txt.
 *
 * Allows the marketing site and refuses everything that is either an application surface or
 * meaningless to a crawler. This is a crawl-budget and hygiene measure, NOT a security control:
 * robots.txt is advisory, and anything that actually needs protecting is gated server-side.
 *
 * `/api/` is disallowed because every route there answers 401 or 400 to an anonymous caller, so
 * crawling it produces nothing but noise in the error logs -- which is the one place we are now
 * watching for real client failures.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard",
          "/settings",
          "/manuals",
          "/welcome",
          "/attendance-report",
          "/lot/",
          "/offline",
          "/trial-expired",
          "/reset-password",
          "/verify-email",
          "/verify-email-change",
          "/forgot-password",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", CANONICAL_SITE_URL).toString(),
    host: CANONICAL_SITE_URL,
  }
}
