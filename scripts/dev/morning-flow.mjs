import { chromium } from "@playwright/test"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const SERIAL = "AMDB25062800863"
const sql = neon(process.env.DATABASE_URL_DEV)
const T = (await sql`SELECT id FROM tenants WHERE name='Estate Mock'`)[0].id
const today = new Date().toISOString().slice(0, 10)

await sql`DELETE FROM labour_assignments WHERE tenant_id=${T}`
await sql`DELETE FROM attendance_records WHERE tenant_id=${T}`

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.locator("input#username").pressSequentially("estate_mock", { delay: 20 })
await page.locator("input#password").pressSequentially("MorningFlow!2026", { delay: 20 })
await page.click('button[type="submit"]')
await page.waitForLoadState("networkidle", { timeout: 30000 })
console.log("logged in ->", page.url())

const api = async (path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, i || undefined)
      let body = null
      try { body = await r.json() } catch {}
      return { status: r.status, body }
    },
    [path, init],
  )

// ─── 1. the scanner ──────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. workers punch in at the terminal ===")
const attlog = ["1", "2", "3", "4", "5"]
  .map((id) => `${id}\t${today} 07:5${id}:00\t0\t1`)
  .join("\n")
const punch = await fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG`, {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: attlog,
})
console.log("  POST /iclock/cdata ->", punch.status, (await punch.text()).trim().slice(0, 40))

const afterPunch = await sql`
  SELECT w.full_name, a.source, to_char(a.check_in_time AT TIME ZONE 'Asia/Kolkata','HH24:MI') AS t
  FROM attendance_records a JOIN attendance_workers w ON w.id=a.worker_id
  WHERE a.tenant_id=${T} AND a.attendance_date=${today} ORDER BY w.full_name`
console.table(afterPunch)

// ─── 2. the muster, as the supervisor sees it ────────────────────────────────────────────────
console.log("=== 2. supervisor opens the muster ===")
let snap = await api(`/api/attendance?date=${today}`)
const workers = snap.body.workers
console.log(`  roster ${workers.length} · present ${snap.body.presentWorkerIds.length} · allocated ${snap.body.assignments.length}`)
console.log("  gang row present:", workers.filter((w) => w.kind === "gang").map((w) => `${w.name} (${w.headcount})`).join(", ") || "none")

const byName = (n) => workers.find((w) => w.name.startsWith(n)).id
const blocks = (await api("/api/locations?scope=all")).body.locations
const HF = blocks.find((b) => b.name === "HF").id
const MV = blocks.find((b) => b.name === "MV").id
const code = (await api("/api/get-activity")).body.activities[0].code
const code2 = (await api("/api/get-activity")).body.activities[1].code

// ─── 3. allocation, every shape ──────────────────────────────────────────────────────────────
console.log("\n=== 3. allocating work ===")
const assign = async (label, payload) => {
  const r = await api("/api/attendance/assignments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: today, ...payload }),
  })
  console.log(`  ${r.body?.success ? "ok     " : "refused"} ${label}${r.body?.success ? "" : "  <- " + r.body?.error?.slice(0, 70)}`)
  return r
}

await assign("bulk: 3 workers, full day, HF block",
  { workerIds: [byName("Ponnappa"), byName("Sunitha"), byName("Bopanna")], activityCode: code, locationId: HF })
await assign("same worker, second job, half day, MV block",
  { workerIds: [byName("Kaveri")], activityCode: code, locationId: MV, dayFraction: 0.5 })
await assign("  ...and their other half, different work, HF block",
  { workerIds: [byName("Kaveri")], activityCode: code2, locationId: HF, dayFraction: 0.5 })
await assign("overtime: same worker, same job+block, extra half at a higher rate",
  { workerIds: [byName("Somaiah")], activityCode: code, locationId: HF })
await assign("  ...overtime portion at 900",
  { workerIds: [byName("Somaiah")], activityCode: code, locationId: HF, dayFraction: 0.5, rate: 900 })
await assign("gang of 11, priced per head",
  { workerIds: [byName("Rathi")], activityCode: code, locationId: MV })
await assign("contract job as a lump sum",
  { workerIds: [byName("Ramesh")], activityCode: code, locationId: HF, lumpSum: 70000 })

console.log("\n  refusals:")
await assign("book someone for a third day", { workerIds: [byName("Somaiah")], activityCode: code, locationId: HF, dayFraction: 1.5 })
await assign("a code that does not exist", { workerIds: [byName("Leela")], activityCode: "ZZZ9", locationId: HF })
await assign("negative rate", { workerIds: [byName("Leela")], activityCode: code, locationId: HF, rate: -5 })

// ─── 4. what the muster shows now ────────────────────────────────────────────────────────────
console.log("\n=== 4. the muster after allocation ===")
snap = await api(`/api/attendance?date=${today}`)
const rows = snap.body.assignments.map((a) => {
  const w = workers.find((x) => x.id === a.workerId)
  return { worker: w.name, work: a.activityCode, block: a.locationName ?? "—",
           day: a.dayFraction, rate: a.rate, heads: a.headcount, lump: a.lumpSum ?? "-", cost: a.totalCost }
})
console.table(rows)
console.log("  day's labour cost:", "Rs " + rows.reduce((s, r) => s + r.cost, 0).toLocaleString("en-IN"))

const perBlock = await sql`
  SELECT COALESCE(l.name,'(none)') blk, SUM(a.total_cost)::numeric cost
  FROM labour_assignments a LEFT JOIN locations l ON l.id=a.location_id
  WHERE a.tenant_id=${T} AND a.work_date=${today} GROUP BY 1 ORDER BY 2 DESC`
console.log("  by block:"); console.table(perBlock)

await browser.close()
