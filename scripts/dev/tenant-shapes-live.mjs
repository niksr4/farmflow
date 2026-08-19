/**
 * Each tenant shape, exercised against the live API rather than reasoned about.
 *
 * Run: node --env-file=.env.local scripts/dev/tenant-shapes-live.mjs
 *
 * Estate Mock is reshaped through all four arrangements in turn -- one estate one store, several
 * estates sharing a store, several estates with a store each, and a mix -- and after each the API
 * is asked what it would offer. Restored at the end.
 *
 * The point is that no shape is special-cased anywhere: a place naming an estate belongs to it, a
 * place naming none belongs to all, and that one rule has to hold for blocks and stores alike.
 */
import { neon } from "@neondatabase/serverless"
import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
let fail = 0
const check = (ok, m) => { if (!ok) fail++; console.log(`    ${ok ? "ok  " : "FAIL"} ${m}`) }

const before = await sql`SELECT id, name, estate, kind FROM locations WHERE tenant_id=${T} ORDER BY name`
const restore = async () => {
  for (const l of before) {
    await sql`UPDATE locations SET estate=${l.estate}, kind=${l.kind} WHERE id=${l.id}`
  }
  await sql`DELETE FROM locations WHERE tenant_id=${T} AND code LIKE 'SHAPE-%'`
}

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await p.locator("input#username").pressSequentially("estate_mock", { delay: 15 })
await p.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 15 })
await p.click('button[type="submit"]')
for (let i = 0; i < 40 && !/\/dashboard/.test(p.url()); i++) await p.waitForTimeout(500)

const ask = async (qs) => (await (await p.request.get(`${BASE}/api/locations${qs}`)).json()).locations || []
const blocks = before.filter((l) => l.kind !== "store")
const store = before.find((l) => l.kind === "store")

try {
  console.log("\n== shape 1: one estate, one store (Laxmi) ==")
  for (const l of blocks) await sql`UPDATE locations SET estate=NULL WHERE id=${l.id}`
  await sql`UPDATE locations SET estate=NULL WHERE id=${store.id}`
  check((await ask("")).every((l) => l.kind === "block"), "default offers blocks only")
  check((await ask("?kind=store")).length === 1, "one store, reachable")

  console.log("\n== shape 2: three estates sharing one store (HoneyFarm) ==")
  const names = ["Alpha", "Beta", "Gamma"]
  for (const [i, l] of blocks.entries()) await sql`UPDATE locations SET estate=${names[i % 3]} WHERE id=${l.id}`
  await sql`UPDATE locations SET estate=NULL WHERE id=${store.id}`
  for (const e of names) {
    const s = (await ask("?kind=store")).filter((x) => !x.estate || x.estate === e)
    check(s.length === 1, `${e} reaches the shared store`)
  }

  console.log("\n== shape 3: two estates, a store each (Medappa) ==")
  await sql`UPDATE locations SET estate='Alpha' WHERE id=${store.id}`
  await sql`INSERT INTO locations (tenant_id, name, code, estate, kind)
            VALUES (${T}, 'Beta store', 'SHAPE-BETA', 'Beta', 'store')`
  const all3 = await ask("?kind=store")
  check(all3.length === 2, `both stores exist (${all3.length})`)
  for (const [e, want] of [["Alpha", "Main store"], ["Beta", "Beta store"]]) {
    const s = all3.filter((x) => !x.estate || x.estate === e)
    check(s.length === 1 && s[0].name === want, `${e} reaches only ${want}`)
  }
  check(all3.filter((x) => !x.estate || x.estate === "Gamma").length === 0,
    "Gamma has no store of its own and no shared one, so reaches none — correctly empty, not a crash")

  console.log("\n== shape 4: mixed — one shared, one owned ==")
  await sql`UPDATE locations SET estate=NULL WHERE id=${store.id}`
  const all4 = await ask("?kind=store")
  // Beta is the estate with its own shed AND access to the shared one, so Beta is the one that
  // should see two. The first draft asserted this of Alpha, which owns nothing in this shape --
  // the harness was wrong, not the rule.
  check(all4.filter((x) => !x.estate || x.estate === "Beta").length === 2, "Beta reaches the shared store and its own")
  check(all4.filter((x) => !x.estate || x.estate === "Gamma").length === 1, "Gamma owns none, so reaches the shared one only")
  check(all4.filter((x) => !x.estate || x.estate === "Alpha").length === 1, "Alpha likewise")

  console.log("\n== and blocks obey the identical rule throughout ==")
  const blk = await ask("")
  check(blk.every((l) => l.kind === "block"), "no store ever appears in the block list")
  check((await ask("?scope=all&kind=all")).length === blk.length + all4.length, "kind=all is exactly both")
} finally {
  await restore()
  await b.close()
}

console.log(fail === 0 ? "\nPASS — one rule, four shapes, no special cases\n" : `\n${fail} FAILURE(S)\n`)
process.exit(fail === 0 ? 0 : 1)
