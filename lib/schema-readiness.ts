import schemaReadinessSpecData from "../config/schema-readiness.json"

export type SchemaReadinessSeverity = "critical" | "warning"
export type SchemaReadinessStatus = "healthy" | SchemaReadinessSeverity

export type SchemaReadinessSpec = {
  id: string
  label: string
  severity: SchemaReadinessSeverity
  requiredTables: string[]
  requiredColumns: Record<string, string[]>
  help: string
}

export type SchemaInventory = {
  tables: Set<string>
  columnsByTable: Map<string, Set<string>>
}

export type SchemaReadinessMissingColumns = {
  table: string
  columns: string[]
}

export type SchemaReadinessCheck = SchemaReadinessSpec & {
  ok: boolean
  missingTables: string[]
  missingColumns: SchemaReadinessMissingColumns[]
}

export type SchemaReadinessSummary = {
  status: SchemaReadinessStatus
  value: string
  detail: string
  total: number
  ready: number
  checks: SchemaReadinessCheck[]
  criticalFailures: SchemaReadinessCheck[]
  warningFailures: SchemaReadinessCheck[]
}

type RawSchemaReadinessSpec = {
  id?: unknown
  label?: unknown
  severity?: unknown
  requiredTables?: unknown
  requiredColumns?: unknown
  help?: unknown
}

const uniqueText = (values: Iterable<string>) =>
  Array.from(new Set(Array.from(values).map((value) => String(value || "").trim()).filter(Boolean)))

const normalizeRequiredColumns = (value: unknown) =>
  Object.fromEntries(
    Object.entries((value && typeof value === "object" ? value : {}) as Record<string, unknown>)
      .map(([table, columns]) => [String(table || "").trim(), uniqueText(Array.isArray(columns) ? columns : [])] as const)
      .filter(([table, columns]) => table && columns.length > 0),
  )

export const PLATFORM_SCHEMA_READINESS_SPECS: SchemaReadinessSpec[] = (
  schemaReadinessSpecData as RawSchemaReadinessSpec[]
).map((spec): SchemaReadinessSpec => ({
  id: String(spec.id || "").trim(),
  label: String(spec.label || "").trim(),
  severity: spec.severity === "warning" ? "warning" : "critical",
  requiredTables: uniqueText(Array.isArray(spec.requiredTables) ? spec.requiredTables : []),
  requiredColumns: normalizeRequiredColumns(spec.requiredColumns),
  help: String(spec.help || "").trim(),
}))

type SchemaInventoryInput = {
  tables?: Iterable<string>
  columns?: Iterable<{ table: string; column: string }>
}

export const buildSchemaInventory = (input: SchemaInventoryInput): SchemaInventory => {
  const tables = new Set(uniqueText(input.tables || []))
  const columnsByTable = new Map<string, Set<string>>()

  for (const entry of input.columns || []) {
    const table = String(entry?.table || "").trim()
    const column = String(entry?.column || "").trim()
    if (!table || !column) continue
    tables.add(table)
    const existing = columnsByTable.get(table) || new Set<string>()
    existing.add(column)
    columnsByTable.set(table, existing)
  }

  return { tables, columnsByTable }
}

export const listPlatformSchemaReadinessTables = () =>
  uniqueText(
    PLATFORM_SCHEMA_READINESS_SPECS.flatMap((spec) => [...spec.requiredTables, ...Object.keys(spec.requiredColumns || {})]),
  )

const formatMissingColumns = (missingColumns: SchemaReadinessMissingColumns[]) =>
  missingColumns
    .flatMap(({ table, columns }) => columns.map((column) => `${table}.${column}`))
    .join(", ")

export const describeSchemaReadinessFailure = (check: SchemaReadinessCheck) => {
  const parts: string[] = []
  if (check.missingTables.length > 0) {
    parts.push(`missing table${check.missingTables.length === 1 ? "" : "s"} ${check.missingTables.join(", ")}`)
  }
  if (check.missingColumns.length > 0) {
    parts.push(
      `missing column${check.missingColumns.reduce((sum, entry) => sum + entry.columns.length, 0) === 1 ? "" : "s"} ${formatMissingColumns(check.missingColumns)}`,
    )
  }
  const detail = parts.length > 0 ? parts.join("; ") : "schema ready"
  return `${check.label}: ${detail}. ${check.help}`.trim()
}

const buildSchemaReadinessDetail = (summary: {
  status: SchemaReadinessStatus
  criticalFailures: SchemaReadinessCheck[]
  warningFailures: SchemaReadinessCheck[]
}) => {
  if (summary.status === "healthy") {
    return "Critical platform migrations are present."
  }

  const failures = summary.status === "critical" ? summary.criticalFailures : summary.warningFailures
  const visibleFailures = failures.slice(0, 2).map((check) => describeSchemaReadinessFailure(check))
  const remainder = failures.length > visibleFailures.length ? ` +${failures.length - visibleFailures.length} more.` : ""
  return `${visibleFailures.join(" ")}${remainder}`.trim()
}

export const summarizePlatformSchemaReadiness = (
  inventory: SchemaInventory,
  specs: SchemaReadinessSpec[] = PLATFORM_SCHEMA_READINESS_SPECS,
): SchemaReadinessSummary => {
  const checks = specs.map((spec) => {
    const requiredTables = uniqueText([...spec.requiredTables, ...Object.keys(spec.requiredColumns || {})])
    const missingTables = requiredTables.filter((table) => !inventory.tables.has(table))
    const missingColumns = Object.entries(spec.requiredColumns || {})
      .map(([table, columns]) => {
        if (missingTables.includes(table)) return null
        const availableColumns = inventory.columnsByTable.get(table) || new Set<string>()
        const missingForTable = columns.filter((column) => !availableColumns.has(column))
        if (!missingForTable.length) return null
        return { table, columns: missingForTable }
      })
      .filter((entry): entry is SchemaReadinessMissingColumns => Boolean(entry))

    return {
      ...spec,
      ok: missingTables.length === 0 && missingColumns.length === 0,
      missingTables,
      missingColumns,
    }
  })

  const ready = checks.filter((check) => check.ok).length
  const criticalFailures = checks.filter((check) => !check.ok && check.severity === "critical")
  const warningFailures = checks.filter((check) => !check.ok && check.severity === "warning")
  const status: SchemaReadinessStatus = criticalFailures.length > 0 ? "critical" : warningFailures.length > 0 ? "warning" : "healthy"
  const value =
    status === "critical"
      ? `${criticalFailures.length} critical gap${criticalFailures.length === 1 ? "" : "s"}`
      : status === "warning"
        ? `${warningFailures.length} warning gap${warningFailures.length === 1 ? "" : "s"}`
        : `${ready}/${checks.length} checks ready`

  return {
    status,
    value,
    detail: buildSchemaReadinessDetail({ status, criticalFailures, warningFailures }),
    total: checks.length,
    ready,
    checks,
    criticalFailures,
    warningFailures,
  }
}

const asRows = (result: unknown): any[] => {
  if (Array.isArray(result)) return result
  if (Array.isArray((result as any)?.rows)) return (result as any).rows
  return []
}

export const inspectPlatformSchemaReadiness = async (db: { query: (...args: any[]) => Promise<unknown> }) => {
  const relevantTables = listPlatformSchemaReadinessTables()
  const tableRows = asRows(
    await db.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
      `,
      [relevantTables],
    ),
  )
  const columnRows = asRows(
    await db.query(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
      `,
      [relevantTables],
    ),
  )

  return summarizePlatformSchemaReadiness(
    buildSchemaInventory({
      tables: tableRows.map((row: any) => String(row.table_name || "").trim()).filter(Boolean),
      columns: columnRows.map((row: any) => ({
        table: String(row.table_name || "").trim(),
        column: String(row.column_name || "").trim(),
      })),
    }),
  )
}
