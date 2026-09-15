#!/usr/bin/env node
/**
 * Regenerates the seam map in docs/TAB-SEAMS.md.
 *
 * Joins three things: which components make up each tab, which /api routes those components fetch,
 * and which tables those routes query. Table names are validated against the live dev schema, so a
 * SQL keyword or CTE alias cannot masquerade as a table -- without that check the first version of
 * this reported "one", "ever" and "an" as shared tables.
 *
 * The output narrows where to look. It is NOT evidence: a tab appears beside a table because some
 * route it calls mentions that table, which is not the same as the tab surfacing a number derived
 * from it. Confirm the read path before writing a finding.
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { neon } from "@neondatabase/serverless"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "")
}

const sql = neon(process.env.DATABASE_URL_DEV)
const real = new Set(
  (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`).map(
    (r) => r.table_name,
  ),
)

/** Everything touches these; listing them says nothing. */
const UBIQUITOUS = ["tenants", "locations", "users", "audit_log", "tenant_modules"]

const ls = (pattern) =>
  execSync(`git ls-files '${pattern}'`, { encoding: "utf8" }).split("\n").filter(Boolean)

const routeTables = new Map()
for (const file of ls("app/api/**/route.ts")) {
  const src = readFileSync(file, "utf8")
  const tables = new Set()
  for (const m of src.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
    const t = m[1].toLowerCase()
    if (real.has(t)) tables.add(t)
  }
  routeTables.set("/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, ""), tables)
}

const TABS = {
  Muster: ["attendance-tab", "attendance-workspace", "attendance-report-tab", "attendance-monthly-grid", "attendance-yearly-summary", "attendance-scanner-tab", "attendance-device-settings"],
  Payroll: ["payroll-summary-tab", "worker-profiles-tab", "workers/pay-rule-form", "workers/worker-money-panel"],
  Costs: ["labor-deployment-tab", "other-expenses-tab", "accounts-page", "accounts/labour-cost-summary"],
  Picking: ["picking-log-tab"],
  Processing: ["processing-tab", "pepper-tab"],
  Dispatch: ["dispatch-tab"],
  Sales: ["sales-tab", "other-sales-tab"],
  Inventory: ["inventory-system", "inventory-dialogs", "inventory-system/transaction-history-panel"],
  "Balance Sheet": ["balance-sheet-tab"],
  Season: ["season-dashboard"],
  Rainfall: ["rainfall-tab"],
  AI: ["ai-analysis-tab", "morning-brief-card", "floating-ai-assistant"],
}

const byTable = new Map()
for (const [tab, stems] of Object.entries(TABS)) {
  for (const stem of stems) {
    let src
    try {
      src = readFileSync(`components/${stem}.tsx`, "utf8")
    } catch {
      continue
    }
    for (const m of src.matchAll(/["'`](\/api\/[a-z0-9\-_/[\]$.{}]+)/gi)) {
      const base = m[1].split("?")[0].replace(/\/\$\{.*$/, "")
      for (const [route, tables] of routeTables) {
        if (base !== route && !base.startsWith(route + "/")) continue
        for (const t of tables) {
          if (!byTable.has(t)) byTable.set(t, new Set())
          byTable.get(t).add(tab)
        }
      }
    }
  }
}

const shared = [...byTable.entries()]
  .filter(([t, tabs]) => tabs.size > 1 && !UBIQUITOUS.includes(t))
  .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))

console.log("| Table | Tabs | Which |")
console.log("|---|---|---|")
for (const [t, tabs] of shared) {
  console.log(`| \`${t}\` | ${tabs.size} | ${[...tabs].sort().join(", ")} |`)
}
console.log(`\n${shared.length} shared business tables across ${byTable.size} touched; ${real.size} tables in the schema.`)
