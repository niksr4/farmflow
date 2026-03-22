import fs from "fs"
import path from "path"
import { neon } from "@neondatabase/serverless"

const loadSpecs = () => {
  const specPath = path.join(process.cwd(), "config", "schema-readiness.json")
  return JSON.parse(fs.readFileSync(specPath, "utf8"))
}

const normalizeEnvValue = (value) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

const parseEnvFile = (content) => {
  const values = {}

  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key) {
      values[key] = value
    }
  }

  return values
}

const loadRepoEnv = () => {
  const merged = {}

  for (const filename of [".env", ".env.local"]) {
    const envPath = path.join(process.cwd(), filename)
    if (!fs.existsSync(envPath)) continue
    Object.assign(merged, parseEnvFile(fs.readFileSync(envPath, "utf8")))
  }

  return merged
}

const resolveDatabaseUrl = (env = process.env) => {
  const mergedEnv = { ...loadRepoEnv(), ...env }
  const databaseUrl = normalizeEnvValue(mergedEnv.DATABASE_URL)
  const databaseUrlDev = normalizeEnvValue(mergedEnv.DATABASE_URL_DEV)

  if (mergedEnv.NODE_ENV === "production") {
    return { url: databaseUrl, source: databaseUrl ? "DATABASE_URL" : null }
  }

  if (databaseUrlDev) {
    return { url: databaseUrlDev, source: "DATABASE_URL_DEV" }
  }

  return { url: databaseUrl, source: databaseUrl ? "DATABASE_URL" : null }
}

const uniqueText = (values) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))

const describeFailure = (check) => {
  const parts = []
  if (check.missingTables.length) {
    parts.push(`missing table${check.missingTables.length === 1 ? "" : "s"} ${check.missingTables.join(", ")}`)
  }
  if (check.missingColumns.length) {
    const columns = check.missingColumns.flatMap(({ table, columns }) => columns.map((column) => `${table}.${column}`))
    parts.push(`missing column${columns.length === 1 ? "" : "s"} ${columns.join(", ")}`)
  }
  return `${check.label}: ${parts.join("; ")}. ${check.help}`.trim()
}

const summarizeChecks = (specs, tables, columnRows) => {
  const tableSet = new Set(uniqueText(tables))
  const columnsByTable = new Map()

  for (const row of columnRows) {
    const table = String(row.table_name || "").trim()
    const column = String(row.column_name || "").trim()
    if (!table || !column) continue
    const existing = columnsByTable.get(table) || new Set()
    existing.add(column)
    columnsByTable.set(table, existing)
  }

  return specs.map((spec) => {
    const requiredTables = uniqueText([...(spec.requiredTables || []), ...Object.keys(spec.requiredColumns || {})])
    const missingTables = requiredTables.filter((table) => !tableSet.has(table))
    const missingColumns = Object.entries(spec.requiredColumns || {})
      .map(([table, columns]) => {
        if (missingTables.includes(table)) return null
        const availableColumns = columnsByTable.get(table) || new Set()
        const missingForTable = columns.filter((column) => !availableColumns.has(column))
        if (!missingForTable.length) return null
        return { table, columns: missingForTable }
      })
      .filter(Boolean)

    return {
      ...spec,
      ok: missingTables.length === 0 && missingColumns.length === 0,
      missingTables,
      missingColumns,
    }
  })
}

const main = async () => {
  const { url, source } = resolveDatabaseUrl()
  if (!url) {
    console.error("Schema readiness check requires DATABASE_URL_DEV or DATABASE_URL.")
    process.exit(1)
  }

  const specs = loadSpecs()
  const relevantTables = uniqueText(specs.flatMap((spec) => [...(spec.requiredTables || []), ...Object.keys(spec.requiredColumns || {})]))
  const db = neon(url)

  const tableRows = await db.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [relevantTables],
  )
  const columnRows = await db.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [relevantTables],
  )

  const checks = summarizeChecks(specs, tableRows.map((row) => row.table_name), columnRows)
  const criticalFailures = checks.filter((check) => !check.ok && check.severity === "critical")
  const warningFailures = checks.filter((check) => !check.ok && check.severity === "warning")
  const readyChecks = checks.filter((check) => check.ok).length

  console.log(`Schema readiness inspected via ${source}. ${readyChecks}/${checks.length} checks ready.`)

  if (criticalFailures.length) {
    console.error("Critical schema gaps:")
    for (const failure of criticalFailures) {
      console.error(`- ${describeFailure(failure)}`)
    }
  }

  if (warningFailures.length) {
    console.warn("Warning-only schema gaps:")
    for (const failure of warningFailures) {
      console.warn(`- ${describeFailure(failure)}`)
    }
  }

  if (criticalFailures.length) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("Schema readiness check failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
