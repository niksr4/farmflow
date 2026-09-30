// Pure helpers for the migration runner, split out so they can be unit-tested.

// Split a SQL file into statements on top-level semicolons, while treating anything inside a
// dollar-quoted block ($$ … $$ or $tag$ … $tag$) as opaque — so DO blocks and function
// bodies that contain their own semicolons are not chopped into invalid fragments.
export const splitSqlStatements = (content) => {
  const statements = []
  let buffer = ""
  let dollarTag = null // e.g. "$$" or "$body$" while inside a dollar-quoted block
  let inLineComment = false
  let blockCommentDepth = 0 // inside /* … */, which NESTS in Postgres
  let inString = false // inside a '...' literal

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]
    const rest = content.slice(i)

    if (inLineComment) {
      buffer += ch
      if (ch === "\n") inLineComment = false
      continue
    }

    // A /* … */ comment is opaque too, and for a sharper reason than the others: an APOSTROPHE
    // inside one used to open a phantom string literal, after which every ";" for the rest of the
    // file was read as data and the statements were glued together. The symptom was
    // "unterminated /* comment", pointing at a comment several statements further down and saying
    // nothing about the apostrophe that caused it.
    //
    // Nothing tripped it because every migration to date comments with "--". The first file to
    // write a docstring found it instantly, and would have found it just as instantly in a year.
    //
    // Depth-counted, not a boolean: Postgres block comments nest, so /* a /* b */ c */ is one
    // comment and a boolean would end it at the first "*/" and treat " c */" as SQL.
    if (blockCommentDepth > 0) {
      if (rest.startsWith("/*")) {
        blockCommentDepth += 1
        buffer += "/*"
        i += 1
        continue
      }
      if (rest.startsWith("*/")) {
        blockCommentDepth -= 1
        buffer += "*/"
        i += 1
        continue
      }
      buffer += ch
      continue
    }

    if (!dollarTag && !inString && rest.startsWith("/*")) {
      blockCommentDepth = 1
      buffer += "/*"
      i += 1
      continue
    }

    // A single-quoted literal is opaque: a ";" inside one is data, and so is a "--".
    // Without this, a COMMENT whose text contains either was chopped mid-literal and the
    // remainder glued onto the next statement -- which surfaces as the thoroughly unhelpful
    // "cannot insert multiple commands into a prepared statement".
    if (inString) {
      buffer += ch
      // '' is an escaped quote inside a literal, not the end of one.
      if (ch === "'") {
        if (content[i + 1] === "'") {
          buffer += "'"
          i += 1
        } else {
          inString = false
        }
      }
      continue
    }

    if (!dollarTag && ch === "'") {
      inString = true
      buffer += ch
      continue
    }

    if (!dollarTag && ch === "-" && content[i + 1] === "-") {
      inLineComment = true
      buffer += ch
      continue
    }

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        buffer += dollarTag
        i += dollarTag.length - 1
        dollarTag = null
      } else {
        buffer += ch
      }
      continue
    }

    const dollarOpen = rest.match(/^\$[A-Za-z0-9_]*\$/)
    if (dollarOpen) {
      dollarTag = dollarOpen[0]
      buffer += dollarTag
      i += dollarTag.length - 1
      continue
    }

    if (ch === ";") {
      const trimmed = buffer.trim()
      if (trimmed) statements.push(trimmed)
      buffer = ""
      continue
    }

    buffer += ch
  }

  const tail = buffer.trim()
  if (tail) statements.push(tail)
  return statements
}

export const migrationNumberOf = (file) => (file.match(/^(\d+)-/) || [])[1]

// Plain string comparison ("100-..." < "87-...") breaks down once migration numbers cross a
// digit-count boundary, since '1' < '8' lexicographically. Compare the numeric prefixes as
// numbers first, falling back to the full filename only to order same-number duplicates
// (e.g. the grandfathered "88-a.sql" / "88-b.sql" pairs) deterministically.
export const compareMigrationFiles = (a, b) => {
  const numA = Number(migrationNumberOf(a))
  const numB = Number(migrationNumberOf(b))
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB
  return a < b ? -1 : a > b ? 1 : 0
}

// True when `file`'s migration number is <= `cutoffFile`'s — numeric-aware (see above).
export const isAtOrBeforeMigration = (file, cutoffFile) => compareMigrationFiles(file, cutoffFile) <= 0

// Returns "NN & MM" pairs for any duplicate migration number that is NOT grandfathered.
// Historic duplicates predate the guard and are recorded by full filename, so they are allowed.
export const findNewDuplicateMigrationNumbers = (files, grandfathered = new Set()) => {
  const seen = new Map()
  const duplicates = []
  for (const file of files) {
    const num = migrationNumberOf(file)
    if (!num) continue
    if (seen.has(num)) {
      if (!grandfathered.has(num)) duplicates.push(`${seen.get(num)} & ${file}`)
    } else {
      seen.set(num, file)
    }
  }
  return duplicates
}

export const GRANDFATHERED_DUPLICATE_NUMBERS = new Set(["09", "13", "20", "25", "56", "88", "89"])
