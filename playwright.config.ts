import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright E2E config for FarmFlow.
 *
 * Runs against a local `next dev`/`next start` server by default (see `webServer` below).
 * In CI, set BASE_URL to point at a deployed preview instead of spinning up a local server,
 * by passing `PLAYWRIGHT_SKIP_WEBSERVER=1` and `BASE_URL=<preview-url>`.
 *
 * Test user credentials (optional): some specs that require a logged-in session read
 * E2E_TEST_USERNAME / E2E_TEST_PASSWORD from the environment and skip themselves if unset,
 * so the suite still runs meaningfully without seeded credentials.
 */
const PORT = process.env.PORT || 3000
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
