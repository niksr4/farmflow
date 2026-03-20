import fs from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { cleanupSelfServeSignup } from "./self-serve-db"

const previewDir = process.env.AUTH_EMAIL_PREVIEW_DIR || path.join(process.cwd(), ".tmp", "email-previews")

type EmailPreview = {
  email: string
  token: string
  verificationLink: string
  generatedAt: string
}

const readLatestPreview = async (email: string): Promise<EmailPreview | null> => {
  const normalizedEmail = email.trim().toLowerCase()
  const files = await fs.readdir(previewDir).catch(() => [])
  const previews = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const filePath = path.join(previewDir, file)
        const raw = await fs.readFile(filePath, "utf8").catch(() => "")
        if (!raw) {
          return null
        }

        const parsed = JSON.parse(raw) as EmailPreview
        if (String(parsed.email || "").trim().toLowerCase() !== normalizedEmail) {
          return null
        }

        return parsed
      }),
  )

  return previews
    .filter((preview): preview is EmailPreview => Boolean(preview?.token && preview?.verificationLink))
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())[0] || null
}

const waitForPreviewEmail = async (email: string) => {
  const timeoutAt = Date.now() + 20_000
  while (Date.now() < timeoutAt) {
    const preview = await readLatestPreview(email)
    if (preview) {
      return preview
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(`Timed out waiting for preview verification email for ${email}`)
}

test("self-serve signup provisions a basic workspace end to end", async ({ page, request }) => {
  test.setTimeout(120_000)

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

    await expect(page).toHaveURL(new RegExp(`/verify-email\\?email=${encodeURIComponent(email).replace(/\+/g, "\\+")}`))

    const preview = await waitForPreviewEmail(email)

    const verifyResponse = await request.post("/api/auth/verify-email", {
      data: { token: preview.token },
    })
    const verifyPayload = await verifyResponse.json()
    expect(verifyResponse.ok()).toBe(true)
    expect(verifyPayload.success).toBe(true)

    await page.goto(preview.verificationLink)
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible()
    await page.getByRole("link", { name: "Sign In" }).click()

    await page.locator("#username").fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page).toHaveURL(/\/welcome(?:\?|$)/)
    await expect(page.getByRole("heading", { name: "Finish your workspace in five minutes" }).first()).toBeVisible()

    await page.getByRole("button", { name: /Basic/i }).click()
    await page.locator("#welcome-location-name").fill("Main Estate")
    await page.locator("#welcome-location-code").fill("MAIN")
    await page.getByRole("button", { name: "Finish setup" }).click()

    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)

    const modulesResponse = await page.context().request.get("/api/tenant-modules")
    const modulesPayload = await modulesResponse.json()
    expect(modulesResponse.ok()).toBe(true)
    expect(modulesPayload.planId).toBe("basic")
    expect(modulesPayload.modules).toEqual(["inventory", "transactions", "accounts", "balance-sheet"])
  } finally {
    await cleanupSelfServeSignup(email)
  }
})
