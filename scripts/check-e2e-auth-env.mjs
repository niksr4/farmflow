const missing = []

if (!process.env.E2E_USERNAME) {
  missing.push("E2E_USERNAME")
}
if (!process.env.E2E_PASSWORD) {
  missing.push("E2E_PASSWORD")
}

if (missing.length > 0) {
  console.error("Missing required env vars for authenticated e2e suites:")
  for (const key of missing) {
    console.error(`- ${key}`)
  }
  process.exit(1)
}

console.log("Authenticated e2e env vars are configured.")

