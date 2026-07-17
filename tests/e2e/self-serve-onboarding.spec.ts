import { expect, test } from "@playwright/test"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import { MODULE_BUNDLES } from "../../lib/modules"
import { cleanupSelfServeSignup } from "./self-serve-db"

const previewEmailDir = path.resolve(process.cwd(), process.env.AUTH_EMAIL_PREVIEW_DIR || ".tmp/email-previews")

const toPreviewEmailFragment = (email: string) =>
  String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "preview"

const waitForVerificationLink = async (email: string) => {
  const fragment = toPreviewEmailFragment(email)
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    const files = await readdir(previewEmailDir).catch(() => [])
    const matchingFiles = files.filter((file) => file.includes(fragment) && file.endsWith(".json")).sort()
    if (matchingFiles.length > 0) {
      const latestFile = matchingFiles[matchingFiles.length - 1]
      const payload = JSON.parse(await readFile(path.join(previewEmailDir, latestFile), "utf8"))
      const verificationLink = String(payload?.verificationLink || "").trim()
      if (verificationLink) {
        return verificationLink
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for a verification email preview for ${email}`)
}

test("self-serve signup provisions a basic workspace end to end", async ({ page }) => {
  test.setTimeout(120_000)

  const basicBundle = MODULE_BUNDLES.find((bundle) => bundle.id === "basic")
  const stamp = Date.now()
  const email = `self-serve-${stamp}@example.com`
  const password = "SelfServePass123!"
  const estateName = `Self Serve Estate ${stamp}`

  await cleanupSelfServeSignup(email)

  try {
    await page.goto("/signup")
    await page.locator("#name").fill("Self Serve QA")
    await page.locator("#email").fill(email)
    await page.locator("#password").fill(password)
    await page.locator("#estateName").fill(estateName)
    await page.locator("#country").fill("India")
    await page.getByRole("button", { name: "Create Account" }).click()

    await expect(page).toHaveURL(/\/verify-email(?:\?|$)/)
    await expect(page.getByText("Verify Your Email", { exact: true })).toBeVisible()

    const verificationLink = await waitForVerificationLink(email)
    await page.goto(verificationLink)
    await expect(page.getByText("Estate Ready", { exact: true })).toBeVisible()
    await page.getByRole("link", { name: "Sign In" }).click()

    await expect(page).toHaveURL(/\/login(?:\?|$)/)

    await page.locator("#username").fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page).toHaveURL(/\/welcome(?:\?|$)/)
    await expect(page.getByRole("heading", { name: "Finish setting up your estate in five minutes" }).first()).toBeVisible()

    await page.getByRole("button", { name: /Basic/i }).click()
    const selectedPlanSummary = page.locator(
      "div.flex.flex-col.gap-3.sm\\:flex-row.sm\\:items-center > p.text-xs.text-muted-foreground",
    )
    await expect(selectedPlanSummary).toHaveText(
      "Basic: Digital books for estates that don't need the full operational workflow yet. Inventory, accounts, and a live balance sheet.",
    )
    await page.locator("#welcome-location-name").fill("Main Estate")
    await page.locator("#welcome-location-code").fill("MAIN")
    const setupRequestPromise = page.waitForRequest(
      (request) => request.url().endsWith("/api/onboarding/setup") && request.method() === "POST",
    )
    const setupResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/onboarding/setup") && response.request().method() === "POST",
    )
    await page.getByRole("button", { name: "Finish setup" }).click()
    const setupRequest = await setupRequestPromise
    const setupRequestBody = setupRequest.postDataJSON() as Record<string, unknown>
    expect(setupRequestBody.moduleBundleId).toBe("basic")
    const setupResponse = await setupResponsePromise
    expect(setupResponse.ok()).toBe(true)
    await setupResponse.json()

    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)

    const modulesPayload = await page.evaluate(async () => {
      const response = await fetch("/api/tenant-modules")
      return response.json()
    })
    expect(modulesPayload.planId).toBe("basic")
    expect(modulesPayload.modules).toEqual(basicBundle?.modules || [])
  } finally {
    await cleanupSelfServeSignup(email)
  }
})
