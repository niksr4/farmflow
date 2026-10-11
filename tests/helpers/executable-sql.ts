/**
 * Strip SQL comments so a guard asserts what the DATABASE EXECUTES, not what the file says.
 *
 * ⚠ WHY THIS EXISTS AT ALL. CodeRabbit raised it on PR #55: the migration guards checked for
 * `pg_advisory_xact_lock` with a plain substring match, so a COMMENTED-OUT lock satisfied every
 * assertion. The guard protecting the fix for a Major could be defeated by two dashes.
 *
 * ⚠ AND WHY IT IS SHARED. It was then copied into a second guard, where the two agreed only
 * because one was pasted from the other. A fix landing in one copy leaves the other disagreeing
 * about which controls are live -- the contract-in-two-places shape this codebase keeps paying
 * for. One rule, one place.
 *
 * String-aware (so an apostrophe inside a literal does not start a comment), handles nested block
 * comments, and preserves newlines so reported positions and any index-ordering assertions stay
 * meaningful.
 */
export const executableSql = (sql: string): string => {
  let out = ""
  let i = 0
  let inString = false
  let blockDepth = 0
  while (i < sql.length) {
    const two = sql.slice(i, i + 2)
    if (inString) {
      out += sql[i]
      if (sql[i] === "'") {
        // '' is an escaped quote inside a literal, not the end of one.
        if (sql[i + 1] === "'") { out += "'"; i += 2; continue }
        inString = false
      }
      i += 1
      continue
    }
    if (blockDepth > 0) {
      if (two === "/*") { blockDepth += 1; i += 2; continue }
      if (two === "*/") { blockDepth -= 1; i += 2; continue }
      out += sql[i] === "\n" ? "\n" : " "
      i += 1
      continue
    }
    if (two === "/*") { blockDepth = 1; i += 2; continue }
    if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") i += 1
      continue
    }
    if (sql[i] === "'") { inString = true; out += sql[i]; i += 1; continue }
    out += sql[i]
    i += 1
  }
  return out
}
