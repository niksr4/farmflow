const missing = []
const expectOwner = process.env.E2E_EXPECT_OWNER !== "0"
const expectAdmin = process.env.E2E_EXPECT_ADMIN === "1"
const hasStandardCredentials = Boolean(process.env.E2E_USERNAME && process.env.E2E_PASSWORD)
const hasOwnerCredentials = Boolean(process.env.E2E_OWNER_USERNAME && process.env.E2E_OWNER_PASSWORD)
const hasAdminCredentials = Boolean(process.env.E2E_ADMIN_USERNAME && process.env.E2E_ADMIN_PASSWORD)

if (expectOwner) {
  if (!hasOwnerCredentials) {
    missing.push("E2E_OWNER_USERNAME")
    missing.push("E2E_OWNER_PASSWORD")
  }
} else if (!hasStandardCredentials) {
  missing.push("E2E_USERNAME")
  missing.push("E2E_PASSWORD")
}

if (expectAdmin && !hasAdminCredentials) {
  missing.push("E2E_ADMIN_USERNAME")
  missing.push("E2E_ADMIN_PASSWORD")
}

if (missing.length > 0) {
  console.error("Missing required env vars for authenticated e2e suites:")
  for (const key of missing) {
    console.error(`- ${key}`)
  }
  process.exit(1)
}

const configuredSuites = [
  expectOwner ? "owner" : "authenticated",
  expectAdmin ? "tenant-admin" : null,
]
  .filter(Boolean)
  .join(" + ")

console.log(`${configuredSuites} e2e env vars are configured.`)
