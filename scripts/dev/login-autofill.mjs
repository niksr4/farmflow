/**
 * A saved password must still be able to sign in.
 *
 * Run: node --env-file=.env.local scripts/dev/login-autofill.mjs
 *
 * The login inputs are controlled and the submit button is gated on their React state, but a
 * password manager writes straight to the DOM node without firing an input event. onChange never
 * ran, so state stayed empty, the button stayed disabled, and the next render wrote React's empty
 * value back over the credentials -- fields that clear themselves and a Sign in button that does
 * nothing, with no error and nothing wrong with the password.
 */

import { chromium } from "@playwright/test"

const BASE = "http://localhost:3000"
let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`) }

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
page.setDefaultTimeout(60000)

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
// Exactly what a password manager does: set the value, fire no React event.
await page.evaluate(() => {
  const u = document.getElementById("username")
  const p = document.getElementById("password")
  if (u) u.value = "medappa_admin"
  if (p) p.value = "MusterDemo!2026"
})
await page.waitForTimeout(2500)

check((await page.locator("#username").inputValue()) === "medappa_admin", "the username survives hydration")
check((await page.locator("#password").inputValue()).length > 0, "the password survives hydration")
check(!(await page.locator('button[type="submit"]').isDisabled()), "Sign in is enabled without touching a field")

await page.click('button[type="submit"]')
await page.waitForTimeout(8000)
check(/dashboard|admin/.test(page.url()), `signed in and landed on ${page.url().replace(BASE, "")}`)
const session = await (await page.request.get(`${BASE}/api/auth/session`)).json()
check(Boolean(session?.user), `session belongs to ${session?.user?.username ?? session?.user?.name ?? "nobody"}`)

console.log(failures === 0 ? "\nPASS -- a saved password signs in\n" : `\n${failures} FAILURE(S)\n`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
