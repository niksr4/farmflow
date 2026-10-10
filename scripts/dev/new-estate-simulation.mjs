/**
 * Can a brand-new estate actually USE FarmFlow the day it signs up?
 *
 * Run: AUTH_EMAIL_PREVIEW_DIR=.tmp/email-previews pnpm dev     (in one shell)
 *      node --env-file=.env.local scripts/dev/new-estate-simulation.mjs
 *
 * Add `keep` as an argument to skip the teardown and poke at the tenant by hand.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS WHEN tests/e2e/self-serve-onboarding.spec.ts ALREADY PASSES.
 *
 * That spec proves provisioning COMPLETES: signup, verify, login, guided setup, dashboard, with the
 * right plan and modules. It proves nothing about whether the estate can then do any work, and that
 * is the gap that matters.
 *
 * Production says so. greenvalley (keziah@lynkk.pro) signed up on 2026-07-24, verified in eleven
 * seconds, provisioned, logged in, clicked through guided setup, and left inside the hour. The e2e
 * spec would have gone green on every step they completed. They never created a worker, never
 * marked a muster, never entered stock. The only row they ever wrote was `update guided_setup`.
 *
 * So this simulation starts where that spec stops. It signs an estate up for real, then tries to be
 * that estate: hire somebody, mark them present, set their work, buy a sack of fertiliser, pulp a
 * day's cherry, send bags out, sell them. Every step goes through the same HTTP route the browser
 * uses, because a route is where the wiring bugs live and calling the database directly would only
 * test this script's SQL.
 *
 * A step that fails here is a step a real estate cannot complete on day one.
 */
import { chromium } from "@playwright/test"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

const BASE = "http://localhost:3000"
const PREVIEW_DIR = path.resolve(process.cwd(), process.env.AUTH_EMAIL_PREVIEW_DIR || ".tmp/email-previews")
const KEEP = process.argv.includes("keep")

const dbUrl = String(process.env.DATABASE_URL_DEV || "").trim()
if (!dbUrl) throw new Error("DATABASE_URL_DEV is required — this never touches production")
const sql = neon(dbUrl)

const stamp = Date.now()
const EMAIL = `sim-estate-${stamp}@example.com`
const PASSWORD = "SimEstatePass123!"
const ESTATE = `Sim Estate ${stamp}`

/**
 * "Today" is asked of Postgres in IST, never built in this script from `new Date()`. A UTC date
 * would put the simulation on the wrong estate day between 18:30 and midnight IST, and the cutover
 * assertion below would fail for the wrong reason.
 */

let pass = 0
let fail = 0
const failures = []

const check = (label, ok, detail = "") => {
  if (ok) {
    pass++
    console.log(`  ok    ${label}${detail ? `  (${detail})` : ""}`)
  } else {
    fail++
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`)
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ""}`)
  }
}

const section = (title) => console.log(`\n── ${title} ${"─".repeat(Math.max(0, 74 - title.length))}`)

const waitForVerificationLink = async (email) => {
  const fragment = email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const files = (await readdir(PREVIEW_DIR).catch(() => [])).filter(
      (f) => f.includes(fragment) && f.endsWith(".json"),
    ).sort()
    if (files.length) {
      const payload = JSON.parse(await readFile(path.join(PREVIEW_DIR, files.at(-1)), "utf8"))
      const link = String(payload?.verificationLink || "").trim()
      if (link) return link
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(
    `No verification email preview for ${email}. Is the dev server running with ` +
      `AUTH_EMAIL_PREVIEW_DIR=${process.env.AUTH_EMAIL_PREVIEW_DIR || ".tmp/email-previews"}?`,
  )
}

const cleanup = async (email) => {
  const rows = await sql`SELECT id, tenant_id, user_id FROM signup_requests WHERE normalized_email = ${email}`
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))]
  const signupIds = rows.map((r) => r.id)
  if (signupIds.length) {
    await sql`DELETE FROM signup_tokens WHERE signup_request_id = ANY(${signupIds})`
    await sql`DELETE FROM signup_requests WHERE id = ANY(${signupIds})`
  }
  /**
   * Tenant delete cascades most tenant_id tables, but NOT everything that points at `users`.
   * transaction_history carries fk_transaction_history_user_uuid with no cascade, so deleting the
   * user raised a 23503 and left a simulated tenant behind on the first run. Anything referencing
   * users has to go first, and by tenant rather than by user id, since the muster writes rows
   * attributed to the tenant's own accounts.
   */
  for (const tid of tenantIds) {
    for (const table of ["transaction_history", "transaction_history_archive", "audit_logs", "security_events"]) {
      await sql.query(`DELETE FROM "${table}" WHERE tenant_id = $1`, [tid]).catch(() => {})
    }
    await sql`DELETE FROM users WHERE tenant_id = ${tid}`
    await sql`DELETE FROM tenants WHERE id = ${tid}`
  }
  await sql`DELETE FROM users WHERE normalized_email = ${email}`
  return tenantIds.length
}

console.log(`\n=== new estate simulation — DEV ===`)
console.log(`estate: ${ESTATE}`)
console.log(`email:  ${EMAIL}\n`)

const browser = await chromium.launch()
const context = await browser.newContext({ baseURL: BASE })
const page = await context.newPage()

let tenantId = null
let exitCode = 0

try {
  await cleanup(EMAIL.toLowerCase())

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     1. SIGN UP AND VERIFY. The part the existing e2e already covers, kept short, because the
        steps after it are meaningless if the estate does not exist. */
  section("signing up")
  await page.goto("/signup", { waitUntil: "domcontentloaded" })
  await page.locator("#name").fill("Simulated Planter")
  await page.locator("#email").fill(EMAIL)
  await page.locator("#password").fill(PASSWORD)
  await page.locator("#estateName").fill(ESTATE)
  await page.locator("#country").fill("India")
  /**
   * Structural, not by label. The submit button's text comes from i18n
   * (`t("public.signup.submit")`), so a selector naming it rots the moment the copy is edited --
   * which is exactly what happened to tests/e2e/self-serve-onboarding.spec.ts: it looks for a
   * button called "Create Account", the button says "Create estate", that string exists nowhere in
   * the codebase, and CI does not run that spec, so it rotted in silence.
   */
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/verify-email/, { timeout: 30_000 })
  check("signup accepted and lands on verify-email", true)

  const link = await waitForVerificationLink(EMAIL)
  /**
   * The emailed link is built from NEXT_PUBLIC_APP_URL, which in this dev setup resolves to the
   * machine's LAN address. Only the token matters, so it is replayed against the local base rather
   * than depending on whatever host the link happens to carry.
   */
  const token = new URL(link).searchParams.get("token")
  check("the verification email carries a token", Boolean(token))
  await page.goto(`${BASE}/verify-email?token=${encodeURIComponent(token || "")}`, {
    waitUntil: "domcontentloaded",
  })
  await page.waitForLoadState("networkidle").catch(() => {})
  /**
   * Asserted on the database rather than on a phrase on the page. The confirmation copy is i18n and
   * will move; whether a tenant row exists will not. The "Estate Ready" string is what the existing
   * e2e keys on, and keying on copy is how that spec rotted.
   */
  const verifiedRow = await sql`
    SELECT status, provisioned_at IS NOT NULL AS done
    FROM signup_requests WHERE normalized_email = ${EMAIL.toLowerCase()}`
  check("email verification provisions the estate",
    verifiedRow[0]?.done === true && verifiedRow[0]?.status === "provisioned",
    `status=${verifiedRow[0]?.status}`)

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     2. WHAT PROVISIONING LEFT BEHIND. Asserted against the database rather than the screen,
        because the screen says "Estate Ready" either way. */
  section("what provisioning created")
  const [tenant] = await sql`
    SELECT t.id, t.name, t.subscription_plan, t.bag_weight_kg
    FROM tenants t
    JOIN signup_requests s ON s.tenant_id = t.id
    WHERE s.normalized_email = ${EMAIL.toLowerCase()}`
  check("a tenant row exists", Boolean(tenant), tenant?.id)
  if (!tenant) throw new Error("no tenant was created — nothing downstream can be checked")
  tenantId = tenant.id

  const modules = await sql`SELECT COUNT(*)::int n FROM tenant_modules WHERE tenant_id = ${tenantId}`
  check("tenant_modules seeded", modules[0].n > 0, `${modules[0].n} rows`)

  const codes = await sql`SELECT COUNT(*)::int n FROM account_activities WHERE tenant_id = ${tenantId}`
  check("activity codes pre-seeded", codes[0].n >= 80, `${codes[0].n} codes`)

  const locs = await sql`SELECT name, code, kind, area_acres FROM locations WHERE tenant_id = ${tenantId}`
  check("a starter location exists", locs.length > 0, locs.map((l) => l.name).join(", "))

  const trial = await sql`SELECT COUNT(*)::int n FROM tenant_commercial_access WHERE tenant_id = ${tenantId}`
    .catch(() => [{ n: -1 }])
  check(
    "a trial record exists",
    trial[0].n > 0,
    trial[0].n === -1 ? "table absent on this database (migration 74)" : `${trial[0].n} rows`,
  )

  /**
   * THE ONE THIS SIMULATION WAS WRITTEN FOR. Without a tenant_labour_entry_mode row, the muster
   * refuses every allocation and a new estate cannot record a day's labour at all. Nothing but a
   * hand-run dev script ever wrote it before 2026-10-07.
   */
  const cutover = await sql`SELECT assignments_from::text d, set_by FROM tenant_labour_entry_mode WHERE tenant_id = ${tenantId}`
  check("a labour cutover was set, so the muster will accept work", cutover.length > 0,
    cutover.length ? `${cutover[0].d} by ${cutover[0].set_by}` : "NO ROW — muster writes will be refused")

  const [istNow] = await sql`SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date::text AS d`
  if (cutover.length) {
    check("the cutover is dated the estate's today in IST, not the server's",
      cutover[0].d === istNow.d, `cutover ${cutover[0].d} vs IST today ${istNow.d}`)
  }

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     3. SIGN IN AND FINISH GUIDED SETUP, as a real planter would. */
  section("signing in")
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await page.locator("#username").fill(EMAIL)
  await page.locator("#password").fill(PASSWORD)
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/(welcome|dashboard)/, { timeout: 40_000 })
  check("the new account can sign in", true, page.url().replace(BASE, ""))

  const api = async (method, route, body) => {
    const res = await page.request.fetch(`${BASE}${route}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { data: body }),
    })
    let json = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    return { status: res.status(), ok: res.ok(), json }
  }

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     3b. GUIDED SETUP IS A HARD GATE, NOT A SUGGESTION.
     Every write route answers 403 "Guided setup required" until this completes, which is worth
     knowing on its own: a new estate can sign in, see the whole dashboard, and silently fail to
     save anything until it finishes this form. Found by this simulation on the first run. */
  section("finishing guided setup, which every write is gated on")

  const setupRes0 = await page.request.fetch(`${BASE}/api/onboarding/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    data: {
      estateName: ESTATE,
      bagWeightKg: 50,
      preferredLocale: "en",
      primaryLocationName: `${ESTATE} Main`,
      primaryLocationCode: "MAIN",
      moduleBundleId: "core",
    },
  })
  check("guided setup can be completed", setupRes0.ok(), `${setupRes0.status()}`)

  const setupDone = await sql`
    SELECT setup_completed_at IS NOT NULL AS done, requires_guided_setup
    FROM users WHERE normalized_email = ${EMAIL.toLowerCase()}`
  check("the account is no longer gated on setup",
    setupDone[0]?.done === true && setupDone[0]?.requires_guided_setup !== true,
    `completed=${setupDone[0]?.done} requiresGuided=${setupDone[0]?.requires_guided_setup}`)

  /**
   * ⚠ THE GATE READS THE TOKEN, NOT THE DATABASE. proxy.ts checks the JWT's `requiresGuidedSetup`
   * and `setupCompleted` claims, which are minted at sign-in. Completing setup updates the users
   * row but leaves the token stale, so every route keeps answering 403 "Guided setup required"
   * until the token is refreshed.
   *
   * The browser does refresh it: welcome-onboarding-page.tsx calls NextAuth's `update()` right
   * after the POST, which is why the real flow works and this is not a product bug. Signing in
   * again is the equivalent, and it also proves the database state is genuinely correct rather
   * than just the client's in-memory copy of it.
   */
  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await page.locator("#username").fill(EMAIL)
  await page.locator("#password").fill(PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/dashboard/, { timeout: 40_000 })
  check("after setup, signing in again lands on the dashboard rather than back on welcome",
    /\/dashboard/.test(page.url()), page.url().replace(BASE, ""))

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     4. CAN IT ACTUALLY DO THE WORK? Every call below is the one the browser makes. */
  section("hiring somebody and marking a muster")

  /**
   * ⚠ THE PAYLOAD CASE IS NOT CONSISTENT ACROSS ROUTES, and every wrong guess below cost a run.
   * Workers take `name` + camelCase. Inventory is all snake_case. Processing mixes the two in one
   * body (`locationId` and `coffeeType`, but `process_date` and `crop_today`). Dispatch and sales
   * are snake_case. Nothing is wrong with any single route; the inconsistency is the hazard, and it
   * is the kind of thing only something that calls all of them notices.
   */
  const workerRes = await api("POST", "/api/attendance/workers", {
    name: "Sim Worker One",
    kind: "individual",
    dailyRate: 600,
  })
  check("a worker can be added with a daily rate", workerRes.ok,
    workerRes.ok ? "" : `${workerRes.status} ${JSON.stringify(workerRes.json)?.slice(0, 160)}`)

  const workers = await sql`SELECT id, full_name, daily_rate FROM attendance_workers WHERE tenant_id = ${tenantId}`
  check("the worker reads back from the roster", workers.length > 0,
    workers.map((w) => `${w.full_name} @ ${w.daily_rate}`).join(", "))

  const today = istNow.d
  const workerId = workers[0]?.id

  if (workerId) {
    /**
     * PUT, not POST: /api/attendance exposes GET and PUT only, and a POST is a bare 405 with no
     * body at all. The field is `presentWorkerIds`, not `workerIds`.
     *
     * ⚠ AND THE STATUS CODE IS NOT THE ANSWER HERE. Sending `workerIds` returned 200 while marking
     * nobody present, because an empty present list is a legitimate request: it is how an estate
     * says everyone was absent. So `res.ok` was a false pass, and only the next step failing
     * revealed it. The row count is asserted below for that reason.
     */
    const markRes = await api("PUT", "/api/attendance", { date: today, presentWorkerIds: [workerId] })
    const marked = await sql`
      SELECT COUNT(*)::int n FROM attendance_records
      WHERE tenant_id = ${tenantId} AND attendance_date = ${today}::date`
    check("attendance can be marked for today", markRes.ok && marked[0].n > 0,
      `${markRes.status}, ${marked[0].n} present`)

    /**
     * The step greenvalley never reached, and the one that was refused outright before the cutover
     * fix. "Set work" is how labour becomes a cost; without it the muster is an attendance register
     * and the estate's wage bill is zero.
     */
    // Flat, and one activity code per call: { date, workerIds[], activityCode, dayFraction }.
    // Not an array of per-worker assignment objects.
    const allocRes = await api("POST", "/api/attendance/assignments", {
      date: today,
      workerIds: [workerId],
      activityCode: "151",
      dayFraction: 1,
    })
    check("work can be allocated on the muster, so labour becomes a cost", allocRes.ok,
      allocRes.ok ? "" : `${allocRes.status} ${JSON.stringify(allocRes.json)?.slice(0, 200)}`)

    const cost = await sql`
      SELECT COALESCE(SUM(total_cost), 0)::numeric v FROM labour_cost
      WHERE tenant_id = ${tenantId} AND work_date = ${today}::date`
    check("that day's labour reaches labour_cost, the view every total reads",
      Number(cost[0].v) > 0, `Rs ${Number(cost[0].v)}`)
  }

  section("buying something and using it")
  const itemRes = await api("POST", "/api/inventory-neon", {
    item_type: "Sim Urea",
    quantity: 100,
    unit: "kg",
    price: 25,
    notes: "simulation opening stock",
  })
  check("stock can be bought in at a price", itemRes.ok,
    itemRes.ok ? "" : `${itemRes.status} ${JSON.stringify(itemRes.json)?.slice(0, 200)}`)

  // `item_type` holds the item's NAME here ("DAP", "Urea"); there is no item_name column.
  const inv = await sql`
    SELECT item_type, quantity, avg_price FROM current_inventory
    WHERE tenant_id = ${tenantId}`
  check("the store shows it, valued", inv.length > 0 && Number(inv[0]?.avg_price) > 0,
    inv.map((i) => `${i.item_type} ${i.quantity} @ ${i.avg_price}`).join(", ") || "store is empty")

  section("a day at the pulper, and getting paid for it")
  const locationId = (await sql`SELECT id FROM locations WHERE tenant_id = ${tenantId} LIMIT 1`)[0]?.id

  if (locationId) {
    const procRes = await api("POST", "/api/processing-records", {
      locationId,
      coffeeType: "Robusta",
      process_date: today,
      crop_today: 1000,
      ripe_today: 700,
      green_today: 200,
      float_today: 100,
      wet_parchment: 310,
      dry_parch: 170,
      dry_cherry: 125,
      notes: "simulation",
    })
    check("a day's pulping can be recorded", procRes.ok,
      procRes.ok ? "" : `${procRes.status} ${JSON.stringify(procRes.json)?.slice(0, 200)}`)

    /**
     * The ratios, checked against the arithmetic rather than trusted. cherryInput for a dual-route
     * estate is crop - ripe = 300, so 125 kg of cherry is 41.67%.
     */
    const proc = await sql`
      SELECT fr_wp_percent, wp_dp_percent, dry_cherry_percent, dry_p_bags, dry_cherry_bags
      FROM processing_records WHERE tenant_id = ${tenantId} AND process_date = ${today}::date`
    if (proc.length) {
      const r = proc[0]
      check("fresh-to-wet ratio is wet parchment over ripe pulped",
        Math.abs(Number(r.fr_wp_percent) - 44.29) < 0.02, `${r.fr_wp_percent}% (expected 44.29)`)
      check("wet-to-dry ratio is dry over wet",
        Math.abs(Number(r.wp_dp_percent) - 54.84) < 0.02, `${r.wp_dp_percent}% (expected 54.84)`)
      check("dry cherry ratio uses the fruit that was not pulped",
        Math.abs(Number(r.dry_cherry_percent) - 41.67) < 0.02, `${r.dry_cherry_percent}% (expected 41.67)`)
      check("bags are kilos over the tenant's bag weight",
        Math.abs(Number(r.dry_p_bags) - 3.4) < 0.02, `${r.dry_p_bags} bags (expected 3.4)`)
    }

    section("sending it out and selling it")
    const dispRes = await api("POST", "/api/dispatch", {
      dispatch_date: today,
      locationId,
      coffee_type: "Robusta",
      bag_type: "Dry Parchment",
      bags_dispatched: 3,
      // What the CURING WORKS weighed, not what the estate thinks it sent.
      //
      // ⚠ WORTH KNOWING, AND THIS SIMULATION FOUND IT THE HARD WAY. Sales availability is
      // COALESCE(SUM(NULLIF(kgs_received, 0)), 0) over dispatch_records and nothing else, so a
      // dispatch with no received weight makes zero stock sellable. That is correct: an estate
      // sells what the curer confirms arrived, which is the entire point of keeping sent and
      // received apart. But the refusal reads "Insufficient stock ... Available 0.00 KGs" right
      // after a dispatch of three bags succeeded, which names the symptom and not the cause. A
      // writer would reasonably conclude the dispatch failed.
      kgs_received: 148,
      price_per_bag: 9000,
      buyer_name: "Simulated Curing Works",
      notes: "simulation",
    })
    check("bags can be dispatched", dispRes.ok,
      dispRes.ok ? "" : `${dispRes.status} ${JSON.stringify(dispRes.json)?.slice(0, 200)}`)

    const disp = await sql`
      SELECT bags_dispatched, kgs_received FROM dispatch_records WHERE tenant_id = ${tenantId}`
    check("the dispatch keeps sent and received as separate figures",
      disp.length > 0 && Number(disp[0].kgs_received) === 148,
      disp.length ? `${disp[0].bags_dispatched} bags sent, ${disp[0].kgs_received} kg received` : "no row")

    const saleRes = await api("POST", "/api/sales", {
      sale_date: today,
      batch_no: `SIM-${stamp}`,
      locationId,
      coffee_type: "Robusta",
      bag_type: "Dry Parchment",
      // Two bags of the three, so there is deliberately stock left over to check the arithmetic.
      bags_sold: 2,
      kgs_sold: 98,
      price_per_bag: 9000,
      bank_account: "Simulated Bank",
      notes: "simulation",
    })
    check("a sale can be booked", saleRes.ok,
      saleRes.ok ? "" : `${saleRes.status} ${JSON.stringify(saleRes.json)?.slice(0, 200)}`)

    const rev = await sql`
      SELECT COALESCE(SUM(revenue), 0)::numeric v FROM sales_records
      WHERE tenant_id = ${tenantId}`
    check("the revenue lands in sales_records", Number(rev[0].v) > 0, `Rs ${Number(rev[0].v)}`)
  }

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     5. WHAT THE DASHBOARD NOW SAYS. A new estate that can write but cannot read its own numbers
        back is no better off. */
  section("reading its own numbers back")
  // The Indian fiscal year containing the estate's today, asked of Postgres rather than built here.
  const [fy] = await sql`
    SELECT
      (CASE WHEN EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata')) >= 4
            THEN date_trunc('year', (NOW() AT TIME ZONE 'Asia/Kolkata')) + INTERVAL '3 months'
            ELSE date_trunc('year', (NOW() AT TIME ZONE 'Asia/Kolkata')) - INTERVAL '9 months'
       END)::date::text AS start`
  const fyStart = fy.start
  const fyEnd = `${Number(fyStart.slice(0, 4)) + 1}-03-31`
  for (const route of [
    "/api/dashboard/bootstrap",
    "/api/accounts-totals",
    // Not /api/balance-sheet — the route is finance-balance-sheet, and season-summary needs an
    // explicit fiscal window or it answers 400.
    "/api/finance-balance-sheet",
    `/api/season-summary?fiscalYearStart=${fyStart}&fiscalYearEnd=${fyEnd}`,
    `/api/season-pl?start=${fyStart}&end=${fyEnd}`,
    "/api/inventory-neon",
    "/api/processing-records?limit=5&offset=0",
    "/api/dispatch?limit=5&offset=0",
    "/api/sales?limit=5&offset=0",
  ]) {
    const res = await api("GET", route)
    check(`GET ${route}`, res.ok, res.ok ? "" : `${res.status}`)
  }

  /* ─────────────────────────────────────────────────────────────────────────────────────────────
     6. THE ONBOARDING CHECKLIST, as the dashboard computes it. */
  section("where the checklist thinks the estate is")
  const locPayload = await api("GET", "/api/locations?scope=all&kind=all")
  const blocks = (locPayload.json?.locations || []).filter((l) => (l.kind || "block") === "block")
  console.log(`  blocks: ${blocks.length}, of which with acreage: ${blocks.filter((b) => Number(b.areaAcres) > 0).length}`)
  const settings = await api("GET", "/api/tenant-settings")
  const profile = settings.json?.settings?.estateProfile || {}
  console.log(`  processingRoute: ${profile.processingRoute === null || profile.processingRoute === undefined ? "(unanswered — step stays open, correct)" : profile.processingRoute}`)
  check("the processing route starts unanswered rather than defaulted",
    profile.processingRoute === null || profile.processingRoute === undefined,
    "a defaulted route would make the checklist step green without anybody answering")
} catch (error) {
  fail++
  failures.push(`threw: ${error?.message || error}`)
  console.log(`\n  THREW  ${error?.message || error}`)
  exitCode = 1
} finally {
  await browser.close()
  if (KEEP) {
    console.log(`\n(keeping tenant ${tenantId} — rerun without 'keep' to clean up, or delete by hand)`)
  } else {
    const removed = await cleanup(EMAIL.toLowerCase())
    console.log(`\ncleaned up ${removed} simulated tenant(s)`)
  }
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
if (failures.length) {
  console.log("\nfailures:")
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(fail > 0 ? 1 : exitCode)
