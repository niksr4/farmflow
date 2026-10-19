import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CANONICAL_SITE_URL,
  PUBLIC_SITEMAP_ENTRIES,
  SITEMAP_EXCLUSIONS,
} from "../lib/site-url"
import sitemap from "../app/sitemap"
import robots from "../app/robots"

/**
 * THE SITEMAP IS A CLAIM ABOUT WHAT THIS COMPANY SELLS, AND IT IS SUBMITTED ONCE.
 *
 * Google Search Console reads /sitemap.xml and then trusts it for months, so two mistakes here are
 * durable in a way most are not:
 *
 *  1. A PREVIEW HOSTNAME. metadataBase resolves to farmflowv1-<hash>.vercel.app on a preview build,
 *     so a sitemap built from it would hand Google a set of URLs that stop existing. The sitemap
 *     uses CANONICAL_SITE_URL for exactly this reason, and this file fails if that changes.
 *  2. A MISSING PAGE. A new marketing page that nobody adds here is invisible to search, silently,
 *     forever. So the ungated page set is DERIVED from the tree and every one of them must be
 *     either listed or explicitly excluded with a reason.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

/** Every page that renders without an auth gate, derived from the tree. */
const ungatedPages = (): string[] =>
  execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /(^|\/)page\.tsx$/.test(f))
    .filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"))
      return !/require(SessionUser|OwnerRole|AdminSession|ModuleAccess|AnyModuleAccess)\s*\(/.test(src)
    })
    .map((f) =>
      "/" +
      f
        .replace(/^app\//, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/^page\.tsx$/, ""),
    )
    .map((p) => (p === "/" ? "/" : p.replace(/\/$/, "")))

describe("the sitemap", () => {
  const entries = sitemap()

  it("is not empty", () => {
    expect(entries.length).toBeGreaterThanOrEqual(10)
  })

  it("uses the canonical host on every URL, never a preview or localhost one", () => {
    for (const entry of entries) {
      expect(
        entry.url.startsWith(CANONICAL_SITE_URL),
        `${entry.url} is not on the canonical host. A sitemap is submitted to Search Console ` +
          "once and trusted for months, so a preview hostname here is a durable mistake.",
      ).toBe(true)
      expect(entry.url).not.toMatch(/localhost|vercel\.app/)
    }
  })

  it("lists the landing page first and highest", () => {
    const landing = entries.find((e) => e.url === `${CANONICAL_SITE_URL}/`)
    expect(landing, "the landing page is missing from the sitemap").toBeTruthy()
    const maxPriority = Math.max(...entries.map((e) => e.priority ?? 0))
    expect(landing?.priority).toBe(maxPriority)
  })

  it("has no duplicate URLs", () => {
    const urls = entries.map((e) => e.url)
    expect(urls.length).toBe(new Set(urls).size)
  })

  it("gives every entry a valid priority and change frequency", () => {
    for (const entry of entries) {
      expect(entry.priority).toBeGreaterThan(0)
      expect(entry.priority).toBeLessThanOrEqual(1)
      expect(["daily", "weekly", "monthly", "yearly"]).toContain(entry.changeFrequency)
    }
  })
})

describe("every public page is either listed or excluded on purpose", () => {
  const pages = ungatedPages()
  const listed = new Set(PUBLIC_SITEMAP_ENTRIES.map((e) => e.path))
  const excluded = new Set(Object.keys(SITEMAP_EXCLUSIONS))

  it("derives the page set, so this cannot pass by scanning nothing", () => {
    expect(
      pages.length,
      "no ungated pages found -- the scan is broken, not the sitemap",
    ).toBeGreaterThanOrEqual(15)
    expect(pages).toContain("/")
  })

  it.each(ungatedPages())("%s is a recorded decision", (page) => {
    // A dynamic segment is listed by its literal path in the exclusions.
    const key = page.replace(/\/\[[^\]]+\]/, "/[lotId]")
    expect(
      listed.has(page) || excluded.has(page) || excluded.has(key),
      `${page} renders without an auth gate and is neither in PUBLIC_SITEMAP_ENTRIES nor in ` +
        "SITEMAP_EXCLUSIONS. If it is marketing, list it -- a page nobody lists is invisible to " +
        "search forever. If it is not, exclude it with a reason.",
    ).toBe(true)
  })

  it("has a reason for every exclusion, and none that is also listed", () => {
    for (const [path, reason] of Object.entries(SITEMAP_EXCLUSIONS)) {
      expect(reason.length, `${path} is excluded with no reason given`).toBeGreaterThan(15)
      expect(listed.has(path), `${path} is both listed and excluded`).toBe(false)
    }
  })

  it("does not list a page that requires a token to mean anything", () => {
    // These would appear in search results as broken forms.
    for (const path of ["/reset-password", "/verify-email", "/verify-email-change"]) {
      expect(listed.has(path), `${path} is meaningless without its emailed token`).toBe(false)
    }
  })
})

describe("robots.txt", () => {
  const result = robots()

  it("points at the sitemap on the canonical host", () => {
    expect(result.sitemap).toBe(`${CANONICAL_SITE_URL}/sitemap.xml`)
  })

  it("keeps crawlers out of the application and the API", () => {
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules
    const disallow = ([] as string[]).concat((rule?.disallow as string[]) ?? [])
    for (const path of ["/api/", "/admin/", "/dashboard", "/settings"]) {
      expect(disallow, `${path} should not be crawled`).toContain(path)
    }
  })

  it("still allows the marketing site", () => {
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules
    expect(rule?.allow).toBe("/")
    const disallow = ([] as string[]).concat((rule?.disallow as string[]) ?? [])
    // A disallow that swallows the whole site would make the sitemap pointless.
    expect(disallow).not.toContain("/")
    for (const entry of PUBLIC_SITEMAP_ENTRIES) {
      expect(
        disallow.some((d) => entry.path === d || (d.endsWith("/") && entry.path.startsWith(d))),
        `${entry.path} is in the sitemap and disallowed in robots.txt -- those contradict`,
      ).toBe(false)
    }
  })
})
