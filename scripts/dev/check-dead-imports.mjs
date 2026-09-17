#!/usr/bin/env node
/**
 * Fail on imports that nothing reads.
 *
 * ⚠ WHY THIS EXISTS. Neither eslint nor `pnpm typecheck` catches an unused import in this repo.
 * `eslint-config-next` ships no unused-vars rule and no @typescript-eslint plugin is installed, and
 * `tsc --noEmit` says nothing without `--noUnusedLocals`. On 2026-09-17 that gap was hit twice in
 * one session — a dead `safeGet` import and four unused types survived a full lint+typecheck+build
 * gate and were found by counting references by hand.
 *
 * It is not a tidiness rule. Turning the check on for the first time found 78 dead imports, and
 * among them:
 *
 *   - components/worker-profiles-tab.tsx imported `formatLocationLabel` and never called it, while
 *     tests/attendance-estate-nudge.test.ts asserted `expect(src).toContain("formatLocationLabel")`
 *     and passed on the import line. A guard protecting against a real, costly bug (Laxmi named all
 *     four blocks "Laxmi"; 42 labour records scattered across three of them) had been vacuous.
 *   - components/inventory-system.tsx still imported DailyPulseCard, TodayGapsCard, QuickLogPanel,
 *     WeekBatchEntry, Image and next/dynamic — whole components it no longer renders, kept in the
 *     bundle by the import alone.
 *
 * A dead import is a claim about what a file does. When something greps for that claim, the claim
 * is load-bearing and being wrong is silent.
 *
 * SCOPE: imports only. `--noUnusedLocals` also reports unused locals and types; those need
 * judgement (a const may be kept deliberately, a type may document a shape) so they are counted
 * and printed, not enforced. Widen this when that backlog is cleared.
 *
 * Exit codes: 0 clean, 1 dead imports found.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const run = () => {
  try {
    return execFileSync("npx", ["tsc", "--noEmit", "--noUnusedLocals"], { encoding: "utf8" })
  } catch (error) {
    // tsc exits non-zero when it reports anything; the diagnostics are on stdout.
    return error.stdout || ""
  }
}

const parse = (output) => {
  const findings = []
  for (const line of output.split("\n")) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error (TS6133|TS6192|TS6196): (.*)$/)
    if (!m) continue
    const [, file, ln, , code, message] = m
    findings.push({ file, line: Number(ln), code, message })
  }
  return findings
}

/** Is the reported line part of an import statement? */
const isImportLine = (file, lineNo, cache) => {
  if (!cache.has(file)) {
    try {
      cache.set(file, readFileSync(file, "utf8").split("\n"))
    } catch {
      cache.set(file, null)
    }
  }
  const lines = cache.get(file)
  if (!lines) return false
  const idx = lineNo - 1
  if (/^\s*import\b/.test(lines[idx] || "")) return true
  // A specifier inside a multi-line import: walk back to the `import` keyword.
  for (let i = idx; i >= 0 && idx - i < 80; i--) {
    if (/^\s*import\b/.test(lines[i])) return true
    if (/^\s*(export|const|let|var|function|class|type|interface|return)\b/.test(lines[i])) return false
  }
  return false
}

const output = run()

// A compile error is not this script's business, but it does mean the answer is unreliable.
const hardErrors = output
  .split("\n")
  .filter((l) => /error TS\d+/.test(l) && !/error (TS6133|TS6192|TS6196):/.test(l))
if (hardErrors.length) {
  console.error("✗ dead-import check: the project does not compile, so this check cannot run.\n")
  for (const line of hardErrors.slice(0, 10)) console.error("  " + line)
  process.exit(1)
}

const cache = new Map()
const findings = parse(output)
const deadImports = findings.filter((f) => f.code === "TS6192" || isImportLine(f.file, f.line, cache))
const otherDead = findings.filter((f) => !deadImports.includes(f))

if (deadImports.length) {
  console.error(`\n✗ dead-import check: ${deadImports.length} import${deadImports.length === 1 ? "" : "s"} nothing reads.\n`)
  for (const f of deadImports) console.error(`  ${f.file}:${f.line}  ${f.message}`)
  console.error(
    "\n  Remove them. An import is a claim about what this file does — see the header of\n" +
      "  scripts/dev/check-dead-imports.mjs for the guard that went vacuous because of one.\n",
  )
  process.exit(1)
}

console.log("✓ dead-import check: no unread imports.")
if (otherDead.length) {
  console.log(
    `  (${otherDead.length} unused local${otherDead.length === 1 ? "" : "s"}/type${otherDead.length === 1 ? "" : "s"} ` +
      "not enforced yet — run `npx tsc --noEmit --noUnusedLocals` to see them.)",
  )
}
process.exit(0)
