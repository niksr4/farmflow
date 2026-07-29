import { expect, test } from "@playwright/test"

test.describe("public contact form", () => {
  test("submit is disabled until name, email, and a message of at least 10 characters are filled", async ({ page }) => {
    await page.goto("/contact")

    const submitButton = page.getByRole("button", { name: /send message/i })
    await expect(submitButton).toBeDisabled()

    await page.getByPlaceholder("Ravi Kumar").fill("Regression QA")
    await expect(submitButton).toBeDisabled()

    await page.getByPlaceholder("ravi@yourfarm.com").fill("regression.qa@example.com")
    await expect(submitButton).toBeDisabled()

    // Fewer than 10 characters — still disabled.
    await page.getByPlaceholder(/tell us about your estate/i).fill("too short")
    await expect(submitButton).toBeDisabled()

    await page.getByPlaceholder(/tell us about your estate/i).fill("This message is definitely long enough.")
    await expect(submitButton).toBeEnabled()
  })

  test("successful submission shows the confirmation state with the submitted email", async ({ page }) => {
    let payload: any = null
    await page.route("**/api/contact", async (route) => {
      payload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto("/contact")
    await page.getByPlaceholder("Ravi Kumar").fill("Regression QA")
    await page.getByPlaceholder("ravi@yourfarm.com").fill("regression.qa@example.com")
    await page.getByPlaceholder(/tell us about your estate/i).fill("This message is definitely long enough.")
    await page.getByRole("button", { name: /send message/i }).click()

    await expect(page.getByText("Message received")).toBeVisible()
    await expect(page.getByText(/regression\.qa@example\.com/)).toBeVisible()
    expect(payload?.name).toBe("Regression QA")
    expect(payload?.email).toBe("regression.qa@example.com")
    expect(payload?.inquiryType).toBe("general")
  })

  test("a server error surfaces the error message and re-enables the form instead of getting stuck submitting", async ({
    page,
  }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Too many requests. Please try again shortly." }),
      })
    })

    await page.goto("/contact")
    await page.getByPlaceholder("Ravi Kumar").fill("Regression QA")
    await page.getByPlaceholder("ravi@yourfarm.com").fill("regression.qa@example.com")
    await page.getByPlaceholder(/tell us about your estate/i).fill("This message is definitely long enough.")

    const submitButton = page.getByRole("button", { name: /send message/i })
    await submitButton.click()

    await expect(page.getByText("Too many requests. Please try again shortly.")).toBeVisible()
    // Submission was not acknowledged — form stays on the input view, not the confirmation view.
    await expect(page.getByText("Message received")).not.toBeVisible()
    await expect(submitButton).toBeEnabled()
  })
})
