import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Guards the tenant-isolation contract at the source level.
 *
 * `sql` in lib/server/db.ts resolves to APP_DATABASE_URL — the least-privilege `app_runtime`
 * role, which is NOT BYPASSRLS. The RLS policy created by scripts/98-enable-rls-all-tenant-tables.sql
 * gates every table carrying a tenant_id on two Postgres GUCs, `app.tenant_id` and `app.role`, and
 * runTenantQuery/runTenantQueries/runTenantTransaction are the only things that set them (transaction-
 * locally, via set_config(..., true)).
 *
 * A route that queries a tenant table without going through one of those wrappers therefore reads
 * back ZERO rows — silently. It does not error, and an explicit `WHERE tenant_id = $1` filter does
 * not help: the filter makes the query correct, not visible. The failure looks exactly like "this
 * tenant has no data yet", so it hides behind empty-state UI and never reaches monitoring.
 *
 * Detection works per CALL SITE, via the TypeScript AST. An earlier file-level version asked only
 * "does this file mention a wrapper anywhere", which passed any route that wrapped most of its
 * queries and missed one — exactly how app/api/season-pl (a Promise.all pair outside the wrapped
 * batch) and app/api/ai-validate (six bare `await sql\`` baselines) stayed hidden while the file
 * looked scoped.
 */

// Tables with a tenant_id column, i.e. everything scripts/98-enable-rls-all-tenant-tables.sql
// turns RLS on for. Tables without tenant_id (tenants, agent_runs, api_response_cache,
// schema_migrations, signup_requests…) are deliberately absent — querying those unwrapped
// is correct, and flagging them produced false positives in earlier sweeps.
const TENANT_TABLES = [
  "account_activities", "agent_run_findings", "app_error_events", "attendance_records",
  "attendance_workers", "audit_logs", "billing_invoice_items", "billing_invoices",
  "buyer_price_records", "buyers", "certifications", "compliance_checklist_items",
  "curing_records", "current_inventory", "data_integrity_exceptions", "digest_feedback",
  "dispatch_records", "document_records", "expense_inventory_links", "expense_transactions",
  "import_jobs", "journal_entries", "labor_transactions", "locations", "other_sales_records",
  "pepper_records", "picking_records", "privacy_requests", "processing_records",
  "quality_grading_records", "rainfall_records", "receivables",
  "sales_records", "security_events", "tenant_modules", "tenant_weekly_metrics",
  "transaction_history", "user_locations", "user_modules", "worker_ledger",
]

const TENANT_WRAPPERS = ["runTenantQuery", "runTenantQueries", "runTenantTransaction"]

const TENANT_TABLE_RE = new RegExp(`\\b(?:FROM|INTO|UPDATE|JOIN)\\s+(?:${TENANT_TABLES.join("|")})\\b`, "i")

/**
 * Routes known to query tenant tables with no tenant wrapper anywhere in the file.
 *
 * Every entry is a confirmed or strongly-suspected silent-empty-read bug, not an approved
 * exemption. Three were verified directly against the dev database (the query returns 0 rows as
 * `app_runtime` and the true count when wrapped); the rest match the same shape and are pending
 * confirmation. See .farmflow-scanner/findings_log.md, cycle 1 files 61-75.
 *
 * This list must only ever shrink. If a fix removes a route from it, delete the entry here too.
 */
const KNOWN_UNWRAPPED: string[] = [
  // Emptied 2026-07-28: activity-streak, benchmarks, dashboard/season-pace,
  // dashboard/season-projection and reconciliation were all fixed, along with season-pl and
  // ai-validate, which the file-level detector could not see. benchmarks moved to adminSql
  // because its read is cross-tenant by design; the rest now use the wrappers. lots stays
  // unwrapped on purpose — see PUBLIC_NO_TENANT_CONTEXT_ROUTES below.
].sort()

/**
 * Routes that legitimately query a tenant table with no tenant wrapper, because there is no
 * session/tenant context to set in the first place — not bugs, and not pending confirmation.
 *
 * `app/api/lots/[lotId]/route.ts` is a public, unauthenticated QR-code lot-traceability lookup
 * (see its own header comment: "Public endpoint — no auth required"). It looks up a lot by an
 * opaque `lot_id` across ALL tenants deliberately, so there is no single tenant to scope a
 * `runTenantQuery` call to. Confirmed this run (2026-07-27, cycle 1, files 76-90) by reading the
 * route: it never calls requireSessionUser/requireModuleAccess and joins to `tenants` only to read
 * a display name, not to authorize. This closes out the "pending confirmation" note left on it in
 * the 61-75 batch — it does not belong on KNOWN_UNWRAPPED, which is reserved for actual bugs.
 */
const PUBLIC_NO_TENANT_CONTEXT_ROUTES = ["app/api/lots/[lotId]/route.ts"]

const collectRouteFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

const RUNTIME_CLIENTS = new Set(["sql", "accountsSql", "inventorySql", "processingSql"])

/**
 * Local names in this file that refer to an RLS-enforced client.
 *
 * Import-aware on purpose. `lib/server/` is full of `import { adminSql as sql }` — the owner
 * connection, which is BYPASSRLS and therefore correct to use unwrapped for the deliberately
 * cross-tenant cron/agent reads. Matching on the local identifier alone reports every one of
 * those as a bug (agent-store and data-integrity-agent both look exactly like the real
 * error-events defect until you read the import), so the alias has to be resolved.
 *
 * Falls back to the default set when the file has no import from lib/server/db — that is the
 * shape of the detector's own unit-test snippets, and of helpers that receive a client as a
 * parameter (lib/server/biometric-attendance.ts).
 */
function runtimeClientNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  let sawDbImport = false

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== "@/lib/server/db") continue

    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    sawDbImport = true

    for (const element of bindings.elements) {
      // `propertyName` is the exported name when aliased (`adminSql as sql`), else undefined.
      const exported = (element.propertyName ?? element.name).text
      if (RUNTIME_CLIENTS.has(exported)) names.add(element.name.text)
    }
  }

  return sawDbImport ? names : RUNTIME_CLIENTS
}

/** Unwrap `sql!` / `(sql)` so the underlying identifier is visible. */
function baseIdentifier(node: ts.Node): ts.Node {
  let current = node
  while (ts.isNonNullExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

/**
 * Query call sites on a runtime client that are not enclosed in a tenant wrapper.
 *
 * Uses the AST rather than text matching: a wrapped call is `runTenantQuery(sql, ctx,
 * sql.query(…))`, so the query node has a wrapper CallExpression among its ancestors.
 * An unwrapped one — `await sql.query(…)`, or one buried in `await Promise.all([sql.query(…)])`,
 * the shape that made season-pl look scoped while part of it silently was not — does not.
 */
function unwrappedClientCalls(src: string, fileName: string): string[] {
  const source = ts.createSourceFile(fileName, src, ts.ScriptTarget.ESNext, true)
  const found: string[] = []
  const clients = runtimeClientNames(source)

  const isRuntimeClientQuery = (node: ts.Node): boolean => {
    // sql`…` / accountsSql`…`
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = baseIdentifier(node.tag)
      return ts.isIdentifier(tag) && clients.has(tag.text)
    }
    // sql.query(…)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const obj = baseIdentifier(node.expression.expression)
      return (
        node.expression.name.text === "query" &&
        ts.isIdentifier(obj) &&
        clients.has(obj.text)
      )
    }
    return false
  }

  /**
   * Walk outward from a query node to decide whether it is executed unscoped.
   *
   * - a wrapper CallExpression first  → scoped, fine
   * - an `await` first               → executed directly on the runtime client, unscoped
   * - neither, up to the function     → not an execution site. This is the common shape for
   *   composable `sql\`\`` clause fragments and for helpers that *return* a query for a caller
   *   to wrap; flagging those would be noise.
   */
  const classify = (node: ts.Node): "scoped" | "unscoped" | "not-executed" => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p)) {
        const callee = p.expression
        if (ts.isIdentifier(callee) && TENANT_WRAPPERS.includes(callee.text)) return "scoped"
        // Promise.all([...]) is transparent — the queries inside it are still executed
        // directly, which is exactly how season-pl's unscoped pair hid in plain sight.
        const isPromiseCombinator =
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "Promise"
        if (isPromiseCombinator) continue
        // Any other call means the query is an argument handed to a helper, which may do
        // the wrapping itself (finance-balance-sheet's runOptionalQuery does). Deciding
        // that needs call-graph analysis, so treat it as out of scope for this guard
        // rather than reporting a false positive.
        return "not-executed"
      }
      if (ts.isAwaitExpression(p)) return "unscoped"
      if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) break
    }
    return "not-executed"
  }

  /**
   * Only queries that actually read a tenant-scoped table matter. Tables without a
   * tenant_id column (tenants, agent_runs, signup_tokens…) have no RLS policy, so querying
   * them unwrapped is correct and must not be flagged.
   */
  const touchesTenantTable = (node: ts.Node): boolean => {
    const text = node.getText(source)
    return TENANT_TABLES.some((table) =>
      new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+${table}\\b`, "i").test(text),
    )
  }

  const visit = (node: ts.Node) => {
    if (isRuntimeClientQuery(node) && touchesTenantTable(node) && classify(node) === "unscoped") {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      found.push(`line ${line + 1}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  return [...new Set(found)]
}

/**
 * Server-side modules outside app/api that talk to the database directly.
 *
 * These were not scanned until 2026-08-02, and lib/server/error-events.ts sat here writing
 * app_error_events through the bare runtime client. Its INSERT was rejected by the RLS WITH
 * CHECK predicate on every call, the catch swallowed the rejection, and production recorded
 * ZERO error events for roughly three months against a prior baseline of 10-21/month. Writes
 * fail loudly at the database and still vanish, so route-only coverage was never enough.
 */
const collectServerLibFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectServerLibFiles(full))
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full)
  }
  return out
}

const findUnwrappedRoutes = () => {
  const root = process.cwd()
  const files = [
    ...collectRouteFiles(resolve(root, "app/api")),
    ...collectServerLibFiles(resolve(root, "lib/server")),
  ]
  const unwrapped: string[] = []

  for (const file of files) {
    const src = readFileSync(file, "utf8")
    if (!TENANT_TABLE_RE.test(src)) continue
    if (unwrappedClientCalls(src, file).length > 0) {
      unwrapped.push(relative(root, file).split("\\").join("/"))
    }
  }

  return unwrapped.sort()
}

describe("unwrappedClientCalls detector", () => {
  const detect = (src: string) => unwrappedClientCalls(src, "sample.ts")

  it("flags a directly awaited query", () => {
    expect(detect("async function f(){ await sql`SELECT 1 FROM sales_records` }")).toHaveLength(1)
  })

  it("flags queries hidden inside Promise.all — the season-pl shape", () => {
    const src = `async function f(){
      const [a, b] = await Promise.all([
        sql.query(\`SELECT 1 FROM dispatch_records WHERE tenant_id = $1\`, [t]),
        sql.query(\`SELECT 1 FROM current_inventory WHERE tenant_id = $1\`, [t]),
      ])
    }`
    expect(detect(src)).toHaveLength(2)
  })

  it("accepts a query wrapped in runTenantQuery", () => {
    expect(
      detect("async function f(){ await runTenantQuery(sql, ctx, sql`SELECT 1 FROM sales_records`) }"),
    ).toEqual([])
  })

  it("accepts queries wrapped in runTenantQueries", () => {
    const src = `async function f(){
      await runTenantQueries(sql, ctx, [
        sql.query(\`SELECT 1 FROM dispatch_records\`, [t]),
        sql.query(\`SELECT 1 FROM current_inventory\`, [t]),
      ])
    }`
    expect(detect(src)).toEqual([])
  })

  it("ignores composable sql`` clause fragments — the dispatch shape", () => {
    const src = "async function f(){ const clause = id ? sql` AND location_id = ${id}` : sql``; return clause }"
    expect(detect(src)).toEqual([])
  })

  it("ignores a query handed to a wrapping helper — the finance-balance-sheet shape", () => {
    const src = `async function f(){
      const r = await Promise.all([
        runOptionalQuery(ctx, sql\`SELECT 1 FROM sales_records\`, ["sales_records"]),
      ])
    }`
    expect(detect(src)).toEqual([])
  })

  it("ignores queries against tables that have no RLS policy", () => {
    expect(detect("async function f(){ await sql`SELECT 1 FROM tenants WHERE id = $1` }")).toEqual([])
    expect(detect("async function f(){ await sql`SELECT 1 FROM agent_runs` }")).toEqual([])
  })

  it("ignores a helper that returns a query for its caller to wrap", () => {
    expect(detect("function build(){ return sql.query(`SELECT 1 FROM sales_records`, []) }")).toEqual([])
  })

  it("sees through sql! non-null assertions", () => {
    expect(detect("async function f(){ await sql!.query(`SELECT 1 FROM processing_records`, []) }")).toHaveLength(1)
  })

  it("flags the pre-fix lib/server/error-events.ts shape — an unwrapped WRITE", () => {
    // The exact defect this guard was extended for. Reads fail silently; this one failed loudly
    // at the database and was still invisible, because the caller swallowed the rejection.
    const src = `
      import { sql } from "@/lib/server/db"
      export async function logAppErrorEvent(input) {
        try {
          await sql\`INSERT INTO app_error_events (tenant_id, source) VALUES (\${input.tenantId}::uuid, 'x')\`
        } catch (error) { /* swallowed */ }
      }`
    expect(detect(src)).toHaveLength(1)
  })

  it("does not flag adminSql aliased to sql — the agent/cron shape", () => {
    // lib/server/agents/* deliberately read across tenants on the BYPASSRLS owner connection.
    // Matching the local identifier alone made every one of these look like the defect above.
    const src = `
      import { adminSql as sql } from "@/lib/server/db"
      export async function agentRead() {
        return await sql\`SELECT tenant_id FROM sales_records\`
      }`
    expect(detect(src)).toEqual([])
  })

  it("still flags the runtime client when a file imports both clients", () => {
    const src = `
      import { adminSql, sql } from "@/lib/server/db"
      export async function mixed() {
        await adminSql\`SELECT 1 FROM sales_records\`
        await sql\`SELECT 1 FROM current_inventory\`
      }`
    expect(detect(src)).toHaveLength(1)
  })
})

describe("tenant RLS wrapper guard", () => {
  it("does not add any new route that queries tenant tables without a tenant wrapper", () => {
    const unwrapped = findUnwrappedRoutes()
    const added = unwrapped.filter(
      (route) => !KNOWN_UNWRAPPED.includes(route) && !PUBLIC_NO_TENANT_CONTEXT_ROUTES.includes(route),
    )

    expect(
      added,
      `These routes query a tenant_id table but never call runTenantQuery/runTenantQueries/` +
        `runTenantTransaction, so under RLS they read back zero rows silently. Wrap the queries ` +
        `(use normalizeTenantContext(undefined, "owner") for deliberately cross-tenant reads), or ` +
        `use adminSql if bypassing RLS is genuinely intended.`,
    ).toEqual([])
  })

  it("keeps the known-unwrapped list accurate so fixes are noticed", () => {
    const unwrapped = findUnwrappedRoutes()
    const fixed = KNOWN_UNWRAPPED.filter((route) => !unwrapped.includes(route))

    expect(
      fixed,
      `These routes are listed as known-unwrapped but now look wrapped (or were deleted). ` +
        `Remove them from KNOWN_UNWRAPPED in this file.`,
    ).toEqual([])
  })

  it("recognises the wrapper helpers the codebase actually uses", () => {
    // Regression guard for the detection itself: these three routes were false positives in an
    // earlier grep-based sweep. They wrap correctly, just not at the call site — via a queryList
    // array, a generic helper, and a tryQuery wrapper respectively — so the guard must not flag them.
    const unwrapped = findUnwrappedRoutes()

    expect(unwrapped).not.toContain("app/api/dispatch/route.ts")
    expect(unwrapped).not.toContain("app/api/finance-balance-sheet/route.ts")
    expect(unwrapped).not.toContain("app/api/dashboard/estate-pulse/route.ts")
    expect(unwrapped).not.toContain("app/api/exception-alerts/route.ts")
  })

  it("keeps the public lot lookup unwrapped and OFF adminSql, by deliberate choice", () => {
    // app/api/lots/[lotId] is public and unauthenticated, so there is no session and no
    // app.tenant_id to set — RLS filters every row and it 404s. That is accepted for now:
    // there are zero lot_ids in processing_records in production, so the feature is unadopted,
    // and adminSql would make a public route able to read any tenant's data by guessing an id.
    // This asserts the *code* still uses the runtime client; the route's header comment
    // explains what to decide when lot traceability is actually adopted.
    const src = readFileSync(resolve(process.cwd(), "app/api/lots/[lotId]/route.ts"), "utf8")
    const importsAdminSql = /^import\s*\{[^}]*\badminSql\b[^}]*\}\s*from\s*"@\/lib\/server\/db"/m.test(src)
    expect(importsAdminSql, "lots must not silently gain an RLS bypass").toBe(false)

    expect(findUnwrappedRoutes()).toContain("app/api/lots/[lotId]/route.ts")
    expect(KNOWN_UNWRAPPED).not.toContain("app/api/lots/[lotId]/route.ts")
    expect(PUBLIC_NO_TENANT_CONTEXT_ROUTES).toContain("app/api/lots/[lotId]/route.ts")
  })
})
