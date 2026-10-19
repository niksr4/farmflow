import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CANONICAL_SITE_URL, PUBLIC_SITEMAP_ENTRIES, seoFor } from "../lib/site-url"

/**
 * WHAT GOOGLE SEES, AND WHAT A PLANTER SEES WHEN SOMEBODY FORWARDS THE LINK.
 *
 * ⚠ NINE OF THE FOURTEEN PUBLIC PAGES DECLARED NO METADATA AT ALL. They inherited a bare
 * "FarmFlow" title and one generic description from the root layout, so /plans, /capabilities,
 * /journey, /standards, /trust, /contact, /signup and every legal page were identical in a search
 * result: nothing for a query to match, nothing to tell two results apart.
 *
 * Three more live defects found in the same pass:
 *  - og:url pointed at the APEX, which 307s to www, while the sitemap said www. Two contradictory
 *    canonical signals on one site.
 *  - twitter.card was "summary_large_image" with NO image anywhere, so the card rendered broken
 *    rather than small. Forwarding on WhatsApp is how this product spreads in Kodagu.
 *  - <meta name="generator" content="v0.dev"> shipped on every page.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

describe("every page in the sitemap has its own metadata", () => {
  it("covers every entry, so this cannot scan nothing", () => {
    expect(PUBLIC_SITEMAP_ENTRIES.length).toBeGreaterThanOrEqual(14)
  })

  it.each(PUBLIC_SITEMAP_ENTRIES.map((e) => e.path))("%s resolves metadata", (path) => {
    const meta = seoFor(path) as any
    expect(meta.title).toBeTruthy()
    expect(meta.description).toBeTruthy()
    expect(meta.alternates.canonical).toBe(path)
    // The canonical host, never the apex that redirects.
    expect(meta.openGraph.url.startsWith(CANONICAL_SITE_URL)).toBe(true)
  })

  it("has a unique title and description on every page", () => {
    const titles = PUBLIC_SITEMAP_ENTRIES.map((e) => e.title)
    const descriptions = PUBLIC_SITEMAP_ENTRIES.map((e) => e.description)
    expect(titles.length, "two pages share a title, which is the bug this fixes").toBe(
      new Set(titles).size,
    )
    expect(descriptions.length).toBe(new Set(descriptions).size)
  })

  it("keeps titles and descriptions inside what Google renders", () => {
    for (const entry of PUBLIC_SITEMAP_ENTRIES) {
      // The " | FarmFlow" suffix the root template appends costs 11 characters.
      expect(
        entry.title.length + 11,
        `"${entry.title}" is too long once the brand is appended; Google truncates it`,
      ).toBeLessThanOrEqual(65)
      expect(entry.description.length, `${entry.path} description is too short to be useful`).toBeGreaterThanOrEqual(90)
      expect(entry.description.length, `${entry.path} description will be truncated`).toBeLessThanOrEqual(170)
    }
  })

  it("has no em dash anywhere in the public metadata", () => {
    // A standing instruction on this project, and it was being broken in the live <title> and
    // og:description, which is the copy Google and WhatsApp actually show.
    for (const entry of PUBLIC_SITEMAP_ENTRIES) {
      expect(entry.title, `${entry.path} title contains an em dash`).not.toMatch(/—/)
      expect(entry.description, `${entry.path} description contains an em dash`).not.toMatch(/—/)
    }
  })

  it("leads the landing page with the phrase people actually search", () => {
    const home = PUBLIC_SITEMAP_ENTRIES.find((e) => e.path === "/")!
    expect(home.title.toLowerCase()).toContain("coffee estate")
    expect(home.title.toLowerCase()).toContain("software")
  })
})

describe("the page files themselves", () => {
  const pageFor = (path: string) =>
    path === "/" ? "app/page.tsx" : `app${path}/page.tsx`

  it.each(PUBLIC_SITEMAP_ENTRIES.map((e) => e.path))("%s exports metadata from the shared list", (path) => {
    const file = pageFor(path)
    expect(existsSync(file), `${file} does not exist`).toBe(true)
    const src = stripComments(readFileSync(file, "utf8"))
    expect(
      /export const metadata/.test(src),
      `${file} declares no metadata, so it ships the root layout's generic title and competes ` +
        "with every other page for every query",
    ).toBe(true)
    expect(
      /seoFor\s*\(/.test(src),
      `${file} should take its metadata from seoFor() so the sitemap and the title cannot drift`,
    ).toBe(true)
  })

  /**
   * ⚠ A CLIENT COMPONENT CANNOT EXPORT `metadata`, AND NOTHING TYPE-CHECKS IT.
   *
   * Next silently ignores the export, so the page ships with the root layout's title and `tsc`
   * says nothing -- it is a framework constraint, not a type error. I made exactly this mistake on
   * four pages in this change (standards, trust, contact, signup) and caught it only by listing
   * which files carry "use client". This is that check, automated.
   */
  it.each(PUBLIC_SITEMAP_ENTRIES.map((e) => e.path))("%s is a server component", (path) => {
    const src = readFileSync(pageFor(path), "utf8")
    expect(
      /^\s*["']use client["']/m.test(src),
      `${pageFor(path)} is a client component AND exports metadata. Next ignores the export, so ` +
        "the page gets the generic title and nothing fails. Move the body to page-client.tsx.",
    ).toBe(false)
  })
})

describe("social sharing and structured data", () => {
  it("has an Open Graph image, so a forwarded link is not a grey rectangle", () => {
    const has =
      existsSync("app/opengraph-image.tsx") ||
      existsSync("app/opengraph-image.png") ||
      existsSync("app/opengraph-image.jpg")
    expect(
      has,
      "twitter.card is summary_large_image, which asks for a big image and renders broken " +
        "without one",
    ).toBe(true)
  })

  it("declares structured data on the landing page", () => {
    const home = stripComments(readFileSync("app/page.tsx", "utf8"))
    expect(/StructuredData\s*\/?>/.test(home)).toBe(true)
    const sd = readFileSync("components/structured-data.tsx", "utf8")
    expect(sd).toContain("application/ld+json")
    expect(sd).toContain("SoftwareApplication")
    expect(sd).toContain("Organization")
  })

  it("claims no rating or review, because there are none", () => {
    // Inventing aggregateRating is both a lie and a structured-data violation that earns a manual
    // action. Five estates use this and none has left a public review.
    const sd = readFileSync("components/structured-data.tsx", "utf8")
    const code = stripComments(sd)
    expect(code).not.toMatch(/aggregateRating/)
    expect(code).not.toMatch(/"@type":\s*"Review"/)
  })

  it("does not advertise the scaffolding it was generated from", () => {
    const layout = stripComments(readFileSync("app/layout.tsx", "utf8"))
    expect(layout).not.toMatch(/generator:/)
  })

  it("gives the root a title template so pages can extend it", () => {
    const layout = readFileSync("app/layout.tsx", "utf8")
    expect(layout).toMatch(/template:\s*"%s \| FarmFlow"/)
  })
})

describe("robots and the crawlable set agree with the metadata", () => {
  it("does not disallow a page that carries SEO metadata", () => {
    const robots = readFileSync("app/robots.ts", "utf8")
    for (const entry of PUBLIC_SITEMAP_ENTRIES) {
      if (entry.path === "/") continue
      expect(
        new RegExp(`"${entry.path}"`).test(robots),
        `${entry.path} has metadata and a sitemap entry but is disallowed in robots.txt`,
      ).toBe(false)
    }
  })

  it("every page file that exists for a sitemap entry is tracked by git", () => {
    const tracked = new Set(
      execFileSync("git", ["ls-files", "app"], { encoding: "utf8" }).split("\n"),
    )
    for (const entry of PUBLIC_SITEMAP_ENTRIES) {
      const file = entry.path === "/" ? "app/page.tsx" : `app${entry.path}/page.tsx`
      expect(tracked.has(file), `${file} is untracked, so CI would not see it`).toBe(true)
    }
  })
})
