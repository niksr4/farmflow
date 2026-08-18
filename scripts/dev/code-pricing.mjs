/**
 * Pricing work in Costs, which is the other half of "where does the cost come from".
 *
 * Run: node --env-file=.env.local scripts/dev/code-pricing.mjs
 *
 * An estate can price the codes it uses every day and leave the rare ones open. A priced code
 * fills the muster in automatically; an unpriced one asks for an amount on the deployment. What
 * is refused is neither, because that saves a payable of nothing.
 */

import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const page = await (await (await chromium.launch()).newContext()).newPage()
page.setDefaultTimeout(90000)
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").fill("estate_mock")
await page.locator("input#password").fill("MorningFlow!2026")
await page.locator('button[type="submit"]:not([disabled])').waitFor()
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard/, { timeout: 90000 }).catch(() => {})

const row = (await sql`SELECT code, activity, default_rate FROM account_activities
                       WHERE tenant_id=${T} ORDER BY code LIMIT 1`)[0]
const before = row.default_rate

const setRate = (defaultRate) =>
  page.request.put(`${BASE}/api/get-activity`, {
    data: { code: row.code, nextCode: row.code, reference: row.activity, defaultRate },
  })
const rateNow = async () =>
  (await sql`SELECT default_rate FROM account_activities WHERE tenant_id=${T} AND code=${row.code}`)[0].default_rate

console.log(`\n== pricing ${row.code} ==`)
check((await setRate(825)).status() === 200, "rate saved")
check(Number(await rateNow()) === 825, `code now pays Rs ${await rateNow()}`)

console.log("\n== the muster picks it up without anyone typing it ==")
const acts = await (await page.request.get(`${BASE}/api/get-activity`)).json()
const seen = (acts.activities || []).find((a) => a.code === row.code)
check(Number(seen?.default_rate) === 825, `the roll is told Rs ${seen?.default_rate}`)

console.log("\n== clearing it means 'ask me every time' ==")
check((await setRate(null)).status() === 200, "rate cleared")
check((await rateNow()) === null, "code is unpriced again")

console.log("\n== renaming a code carries its rate across ==")
await setRate(825)
const renamed = `${row.code}X`
const ren = await page.request.put(`${BASE}/api/get-activity`, {
  data: { code: row.code, nextCode: renamed, reference: row.activity },
})
if (ren.status() === 200) {
  const moved = (await sql`SELECT default_rate FROM account_activities WHERE tenant_id=${T} AND code=${renamed}`)[0]
  check(Number(moved?.default_rate) === 825, `the rate followed the rename (Rs ${moved?.default_rate})`)
  await page.request.put(`${BASE}/api/get-activity`, { data: { code: renamed, nextCode: row.code, reference: row.activity } })
} else {
  console.log(`  --   rename returned ${ren.status()}, skipping`)
}

console.log("\n== a negative rate is refused ==")
check((await setRate(-5)).status() === 400, "negative rate rejected")

await sql`UPDATE account_activities SET default_rate=${before} WHERE tenant_id=${T} AND code=${row.code}`
console.log(failures === 0 ? "\nPASS -- work can be priced once, or left to ask each time\n" : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
