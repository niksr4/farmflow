const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const rootDir = path.join(__dirname, "..")
const docsDir = path.join(rootDir, "docs", "agents")
const generatedScriptsDir = path.join(rootDir, "scripts", "generated")
const reportPath = path.join(docsDir, "schema-migration-report.md")
const safetyPath = path.join(generatedScriptsDir, "schema-safety-check.sql")
const rollbackPath = path.join(generatedScriptsDir, "schema-rollback-template.sql")

const args = process.argv.slice(2)
const staged = args.includes("--staged")

const run = (command) => execSync(command, { cwd: rootDir, encoding: "utf8" }).trim()

const readStatus = () => {
  const command = staged ? "git diff --name-status --cached" : "git status --porcelain"
  return run(command)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

const parseChangedPaths = (statusLines) => {
  const paths = []
  for (const line of statusLines) {
    if (line.includes("->")) {
      const parts = line.split("->")
      const target = parts[1]?.trim()
      if (target) paths.push(target)
      continue
    }

    const parts = line.split(/\s+/)
    const candidate = parts[parts.length - 1]
    if (candidate) paths.push(candidate.trim())
  }
  return Array.from(new Set(paths))
}

const getSqlFiles = (paths) =>
  paths.filter(
    (filePath) => filePath.startsWith("scripts/") && !filePath.startsWith("scripts/generated/") && filePath.endsWith(".sql"),
  )

const extractTables = (sqlContent) => {
  const tableSet = new Set()
  const tablePatterns = [
    /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_."]+)/gi,
    /\bALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-zA-Z0-9_."]+)/gi,
    /\bDROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-zA-Z0-9_."]+)/gi,
    /\bCREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+[a-zA-Z0-9_"]+\s+ON\s+([a-zA-Z0-9_."]+)/gi,
  ]

  for (const pattern of tablePatterns) {
    let match = pattern.exec(sqlContent)
    while (match) {
      const raw = String(match[1] || "").replace(/"/g, "")
      const tableName = raw.includes(".") ? raw.split(".").pop() : raw
      if (tableName) tableSet.add(tableName)
      match = pattern.exec(sqlContent)
    }
  }
  return Array.from(tableSet)
}

const analyzeSql = (filePath, content) => {
  const warnings = []
  const destructive = []
  const idempotency = []

  if (/\bDROP\s+TABLE\b/i.test(content)) destructive.push("Contains DROP TABLE")
  if (/\bDROP\s+COLUMN\b/i.test(content)) destructive.push("Contains DROP COLUMN")
  if (/\bTRUNCATE\b/i.test(content)) destructive.push("Contains TRUNCATE")
  if (/\bALTER\s+TABLE[\s\S]*\bALTER\s+COLUMN[\s\S]*\bTYPE\b/i.test(content)) {
    warnings.push("Column type change detected; verify cast safety and backfill plan")
  }
  if (/\bDELETE\s+FROM\b/i.test(content) && !/\bDELETE\s+FROM[\s\S]*\bWHERE\b/i.test(content)) {
    warnings.push("DELETE without WHERE detected; verify this is intended")
  }
  if (/\bUPDATE\b/i.test(content) && !/\bUPDATE[\s\S]*\bWHERE\b/i.test(content)) {
    warnings.push("UPDATE without WHERE detected; verify this is intended")
  }

  if (/\bCREATE\s+TABLE\b/i.test(content) && !/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(content)) {
    idempotency.push("CREATE TABLE without IF NOT EXISTS")
  }
  if (/\bCREATE\s+INDEX\b/i.test(content) && !/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/i.test(content)) {
    idempotency.push("CREATE INDEX without IF NOT EXISTS")
  }
  if (/\bALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\b/i.test(content) && !/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/i.test(content)) {
    idempotency.push("ADD COLUMN without IF NOT EXISTS")
  }

  return {
    filePath,
    warnings,
    destructive,
    idempotency,
    tables: extractTables(content),
  }
}

const readSqlAnalyses = (sqlFiles) =>
  sqlFiles.map((relativePath) => {
    const fullPath = path.join(rootDir, relativePath)
    if (!fs.existsSync(fullPath)) {
      return {
        filePath: relativePath,
        missing: true,
        warnings: ["File removed or renamed; validate migration ordering and rollback requirements."],
        destructive: [],
        idempotency: [],
        tables: [],
      }
    }
    const content = fs.readFileSync(fullPath, "utf8")
    return analyzeSql(relativePath, content)
  })

const getRiskLevel = (analyses) => {
  const hasDestructive = analyses.some((item) => item.destructive.length > 0)
  if (hasDestructive) return "HIGH"
  const hasWarnings = analyses.some((item) => item.warnings.length > 0 || item.idempotency.length > 0)
  return hasWarnings ? "MEDIUM" : "LOW"
}

const writeFile = (targetPath, content) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content, "utf8")
}

const generateSafetySql = (tables) => {
  const sorted = Array.from(new Set(tables)).sort()
  const checks = sorted.length
    ? sorted
        .map(
          (table) => `
-- Table: ${table}
SELECT
  '${table}' AS table_name,
  CASE WHEN to_regclass('public.${table}') IS NULL THEN false ELSE true END AS table_exists,
  COALESCE(
    (
      SELECT c.reltuples::bigint
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = '${table}'
        AND c.relkind IN ('r', 'p')
      LIMIT 1
    ),
    0
  ) AS estimated_rows;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = '${table}'
ORDER BY ordinal_position;
`,
        )
        .join("\n")
    : "-- No table references detected from changed SQL files."

  return `-- Generated by agent-schema-migration-assistant.js
-- Human approval required. Do not auto-run in production.
-- Purpose: run BEFORE and AFTER migration to validate schema shape and row counts.

${checks}
`
}

const generateRollbackTemplate = (analyses) => {
  const fileSections = analyses
    .map((item) => {
      const warnings = [...item.destructive, ...item.warnings, ...item.idempotency]
      return `-- Source: ${item.filePath}
-- Review notes:
${warnings.length ? warnings.map((w) => `-- - ${w}`).join("\n") : "-- - No high-risk patterns detected."}

-- TODO: Add explicit rollback SQL for this migration.
-- Example:
-- ALTER TABLE ... DROP COLUMN ...;
-- CREATE INDEX ...;
`
    })
    .join("\n")

  return `-- Generated by agent-schema-migration-assistant.js
-- Human approval required. Do not auto-run in production.
-- Fill this with explicit, tested rollback steps for each migration.

BEGIN;

${fileSections}

-- COMMIT only after review/testing.
ROLLBACK;
`
}

const generateReport = ({ mode, analyses, riskLevel }) => {
  const changedFiles = analyses.map((item) => item.filePath)
  const allTables = Array.from(new Set(analyses.flatMap((item) => item.tables))).sort()
  const destructiveCount = analyses.reduce((sum, item) => sum + item.destructive.length, 0)
  const warningCount = analyses.reduce((sum, item) => sum + item.warnings.length, 0)
  const idempotencyCount = analyses.reduce((sum, item) => sum + item.idempotency.length, 0)

  return `# Schema + Migration Assistant Report

- Mode: ${mode}
- Risk Level: **${riskLevel}**
- Changed SQL files: ${changedFiles.length}
- Destructive flags: ${destructiveCount}
- Warnings: ${warningCount}
- Idempotency flags: ${idempotencyCount}
- Generated at: ${new Date().toISOString()}

## Changed SQL Files
${changedFiles.length ? changedFiles.map((file) => `- \`${file}\``).join("\n") : "- None"}

## Touched Tables
${allTables.length ? allTables.map((table) => `- \`${table}\``).join("\n") : "- None detected"}

## Findings
${analyses
  .map((item) => {
    const lines = []
    if (item.destructive.length) lines.push(...item.destructive.map((msg) => `- [HIGH] ${msg}`))
    if (item.warnings.length) lines.push(...item.warnings.map((msg) => `- [MEDIUM] ${msg}`))
    if (item.idempotency.length) lines.push(...item.idempotency.map((msg) => `- [MEDIUM] ${msg}`))
    if (!lines.length) lines.push("- [OK] No obvious destructive/idempotency risks detected")
    return `### ${item.filePath}\n${lines.join("\n")}`
  })
  .join("\n\n")}

## Human Approval Checklist
- [ ] Confirm migration is additive and idempotent where possible.
- [ ] Run generated safety checks before and after migration.
- [ ] Review and complete rollback template with tested reverse steps.
- [ ] Verify no unintentional data loss or table lock risk.
- [ ] Execute manually in Neon SQL editor after approval (no auto-run).

## Generated Artifacts
- \`${path.relative(rootDir, safetyPath)}\`
- \`${path.relative(rootDir, rollbackPath)}\`
`
}

const main = () => {
  const statusLines = readStatus()
  const changedPaths = parseChangedPaths(statusLines)
  const sqlFiles = getSqlFiles(changedPaths)
  const analyses = readSqlAnalyses(sqlFiles)
  const riskLevel = getRiskLevel(analyses)
  const allTables = analyses.flatMap((item) => item.tables)

  writeFile(safetyPath, generateSafetySql(allTables))
  writeFile(rollbackPath, generateRollbackTemplate(analyses))
  writeFile(reportPath, generateReport({ mode: staged ? "staged" : "working-tree", analyses, riskLevel }))

  console.log("Schema Migration Assistant complete.")
  console.log(`- Report: ${path.relative(rootDir, reportPath)}`)
  console.log(`- Safety SQL: ${path.relative(rootDir, safetyPath)}`)
  console.log(`- Rollback template: ${path.relative(rootDir, rollbackPath)}`)
  console.log(`- Risk level: ${riskLevel}`)
  console.log("No migration was executed. Human approval remains required.")
}

main()
