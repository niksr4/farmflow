import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT || 3000)
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`
const shouldStartServer = process.env.E2E_SKIP_WEB_SERVER !== "1"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
  webServer: shouldStartServer
    ? {
        command: `pnpm dev --port ${port} --hostname 127.0.0.1`,
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
})

