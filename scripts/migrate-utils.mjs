// Pure helpers for the migration runner, split out so they can be unit-tested.

// Split a SQL file into statements on top-level semicolons, while treating anything inside a
// dollar-quoted block ($$ … $$ or $tag$ … $tag$) as opaque — so DO blocks and function
// bodies that contain their own semicolons are not chopped into invalid fragments.
export const splitSqlStatements = (content) => {
  const statements = []
  let buffer = ""
  let dollarTag = null // e.g. "$$" or "$body$" while inside a dollar-quoted block
  let inLineComment = false

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]
    const rest = content.slice(i)

    if (inLineComment) {
      buffer += ch
      if (ch === "\n") inLineComment = false
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
