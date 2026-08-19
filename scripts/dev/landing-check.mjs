/**
 * Render the public landing page and check what a prospect actually sees.
 *
 * Run: node scripts/dev/landing-check.mjs   (needs a dev server on :3000)
 *
 * The landing page is the one surface with no logged-in user to complain when it breaks, and the
 * only one where a stale sentence is a marketing problem rather than a bug. This checks the two
 * things that fail silently: horizontal bleed on a phone (the audience is on a phone in a field),
 * and copy that was supposed to be removed still being in the DOM somewhere it wasn't grepped for.
 *
 * Read-only: it loads a public page and screenshots it.
 */
import { chromium } from "@playwright/test"

const OUT = process.env.SCRATCH || "/tmp"
const RETIRED = ["Tea", "Cocoa", "Horticulture", "Tree nuts", "Grains", "expanding further"]
const COFFEE = ["Arabica", "Robusta", "Outturn", "muster", "curing works", "Pepper", "arecanut", "Coorg"]

const browser = await chromium.launch()
let bad = 0

for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)))

  // Every section sits behind a scroll-reveal that starts at opacity 0. A fullPage screenshot
  // re-lays-out the page, which re-hides anything the scroll pass had revealed, so the shot comes
  // back as a hero on top of six screens of black. Pin them open before loading.
  await page.addStyleTag({ content: "*{opacity:1!important;transform:none!important;visibility:visible!important}" }).catch(() => {})
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(5000)
  // Scroll the whole page: every section is behind a scroll-reveal, so an un-scrolled
  // screenshot is mostly empty and an un-scrolled innerText misses half the copy.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0)
  })
  await page.addStyleTag({ content: "*{opacity:1!important;transform:none!important}" })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/landing-${name}.png`, fullPage: true })

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const text = await page.evaluate(() => document.body.innerText)
  const stale = RETIRED.filter((w) => new RegExp(`\\b${w}\\b`).test(text))

  if (overflow > 1 || stale.length || errors.length) bad++
  console.log(`\n== ${name} (${viewport.width}px) ==`)
  console.log(`   h-overflow  ${overflow}px${overflow > 1 ? "   <- BLEEDS" : ""}`)
  console.log(`   js errors   ${errors.length ? errors.slice(0, 3).join(" | ") : "none"}`)
  console.log(`   retired     ${stale.length ? stale.join(", ") + "   <- STILL RENDERED" : "none"}`)
  console.log(`   coffee      ${COFFEE.filter((k) => text.includes(k)).join(", ") || "NONE  <- lost the crop"}`)
  if (name === "desktop") {
    console.log(`   headings    ${(await page.locator("h1, h2").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n               ")}`)
  }
  await page.close()
}

await browser.close()
console.log(`\n${bad ? "ISSUES in " + bad + " viewport(s)" : "clean in both viewports"}  ->  ${OUT}/landing-*.png`)
