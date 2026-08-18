/**
 * Recording how big a block is, which is what every per-acre figure divides by.
 *
 * Run: node --env-file=.env.local scripts/dev/block-acreage.mjs
 *
 * There was no way to enter this at all until now. Cost per acre has therefore never once
 * rendered for a real tenant -- the column omits itself rather than showing a wrong number, which
 * is the right behaviour and also why nobody noticed it was missing.
 */

import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const page = await (await (await chromium.launch()).newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
page.setDefaultTimeout(90000)
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").fill("estate_mock")
await page.locator("input#password").fill("MorningFlow!2026")
await page.locator('button[type="submit"]:not([disabled])').waitFor()
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard/, { timeout: 90000 }).catch(() => {})

const block = (await sql`SELECT id, name, code, estate, area_acres FROM locations WHERE tenant_id=${T} ORDER BY name LIMIT 1`)[0]
const before = block.area_acres

console.log("\n== the API carries it both ways ==")
const listed = await (await page.request.get(`${BASE}/api/locations`)).json()
check((listed.locations || []).every((l) => "areaAcres" in l), "every block reports an areaAcres field")

const save = (areaAcres) =>
  page.request.patch(`${BASE}/api/locations`, {
    data: { id: block.id, name: block.name, code: block.code, estate: block.estate, areaAcres },
  })
const stored = async () => (await sql`SELECT area_acres FROM locations WHERE id=${block.id}`)[0].area_acres

check((await save(9.25)).status() === 200, "area saved")
check(Number(await stored()) === 9.25, `${block.name} is ${await stored()} acres`)

console.log("\n== renaming a block does not silently erase it ==")
const renamed = await page.request.patch(`${BASE}/api/locations`, {
  data: { id: block.id, name: block.name, code: block.code, estate: block.estate },
})
check(renamed.status() === 200 && Number(await stored()) === 9.25, `still ${await stored()} acres after a save that did not mention it`)

console.log("\n== clearing it means unknown, not zero ==")
check((await save(null)).status() === 200 && (await stored()) === null, "area cleared to null")

console.log("\n== nonsense is refused ==")
check((await save(-3)).status() === 400, "negative area rejected")
check((await save(0)).status() === 400, "zero acres rejected")

console.log("\n== and it is what makes cost per acre appear ==")
await save(10)
const sum = await (await page.request.get(`${BASE}/api/labour-summary?startDate=2026-04-01&endDate=2027-03-31`)).json()
const withArea = (sum.byBlock || []).filter((b) => b.costPerAcre != null)
check(withArea.length > 0, `${withArea.length} block(s) now report a cost per acre`)
withArea.slice(0, 3).forEach((b) => console.log(`       ${b.label}: Rs ${Math.round(b.cost).toLocaleString("en-IN")} over ${b.areaAcres} ac = Rs ${Math.round(b.costPerAcre).toLocaleString("en-IN")}/acre`))

await sql`UPDATE locations SET area_acres=${before} WHERE id=${block.id}`
console.log(failures === 0 ? "\nPASS -- a block can be sized, and per-acre figures follow\n" : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
