const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..", "app", "api")
const pattern = /tenant_id\s+IS\s+NULL/i

const hits = []

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf8")
      if (pattern.test(content)) {
        hits.push(fullPath)
      }
    }
  }
}

walk(root)

if (hits.length) {
  console.error("Tenant isolation audit failed. Remove tenant_id IS NULL from these files:")
  hits.forEach((hit) => console.error(`- ${path.relative(process.cwd(), hit)}`))
  process.exit(1)
}

console.log("Tenant isolation audit passed.")
