import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

/**
 * SOMEBODY WHOSE PASSWORD WAS SILENTLY DISCARDED HAS TO BE TOLD, ON THE SCREEN.
 *
 * A second person signing up for an email that already has a pending request does NOT get their
 * password stored -- the credential on a pending signup is not a later caller's to replace, or
 * anyone knowing an address could set the password on somebody else's estate. That refusal is
 * correct. What it cannot do is happen silently: the API answers `success: true`, the link is
 * re-sent, they verify, they type the password they just chose, and they are locked out of their
 * own estate with nothing anywhere having reported a problem. The cost is a support conversation
 * that begins "it says my password is wrong".
 *
 * ── WHY A RENDER TEST AND NOT A SOURCE SCAN ───────────────────────────────────────────────────
 *
 * The copy existing in components/verify-email-page.tsx proves nothing: it sits inside a
 * `{credentialRetained ? … : null}` gate, four hops from where the decision is made --
 * lib/server/onboarding/signup.ts sets the flag, app/api/auth/signup/route.ts forwards it,
 * app/signup/page.tsx turns it into `?existing=1`, app/verify-email/page.tsx parses it back into
 * a prop. Any one of those links breaking leaves the sentence in the file and off the screen, and
 * a grep for the words passes in every one of those broken states.
 *
 * The existing guard in tests/signup-credential-cannot-be-overwritten.test.ts covers the SERVER
 * half -- that the stored hash is not rewritten. This covers the half the person actually sees.
 */

vi.mock("@/components/locale-provider", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en", setLocale: vi.fn() }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("posthog-js/react", () => ({ usePostHog: () => ({ capture: vi.fn(), captureException: vi.fn() }) }))

import VerifyEmailPage from "@/components/verify-email-page"

describe("the verify screen says when an earlier password was kept", () => {
  it("shows the notice when the credential was retained", () => {
    render(<VerifyEmailPage initialEmail="writer@estate.in" credentialRetained />)

    // Keyed on what the reader needs to learn, not on exact phrasing: that the password they just
    // typed is not the one their estate will use.
    expect(screen.getByText(/already had a signup waiting/i)).toBeTruthy()
    expect(screen.getByText(/not the one you just typed/i)).toBeTruthy()
  })

  it("tells them the way out, which is Forgot password after verifying", () => {
    render(<VerifyEmailPage initialEmail="writer@estate.in" credentialRetained />)
    // Naming the problem without the remedy still ends in a support message.
    expect(screen.getByText(/forgot password/i)).toBeTruthy()
  })

  it("says NOTHING on an ordinary first-time signup", () => {
    /**
     * The other direction matters just as much. Showing "your password was not saved" to somebody
     * whose password WAS saved would send them to a reset they do not need, on the one screen in
     * the product where a new customer is already least sure anything worked.
     */
    render(<VerifyEmailPage initialEmail="writer@estate.in" />)
    expect(screen.queryByText(/already had a signup waiting/i)).toBeNull()
    expect(screen.queryByText(/not the one you just typed/i)).toBeNull()
  })

})

describe("the route turns ?existing=1 into the prop that renders it", () => {
  /**
   * ⚠ THE RENDER TEST ABOVE CANNOT SEE THIS, and a tamper run proved it: breaking
   * app/verify-email/page.tsx so it never reads `?existing=1` left all three tests green, because
   * they mount the component with the prop already set.
   *
   * That is hop 4 of a five-hop chain -- signup.ts sets the flag, the API route forwards it, the
   * signup page encodes it as a query parameter, THIS route decodes it, the component renders it.
   * A notice that is correct at both ends and severed in the middle is still a locked-out customer.
   */
  it("passes credentialRetained=true when the query parameter is set", async () => {
    const { default: VerifyEmailRoute } = await import("@/app/verify-email/page")
    const element: any = await VerifyEmailRoute({
      searchParams: Promise.resolve({ email: "writer@estate.in", existing: "1" }),
    })
    expect(element.props.credentialRetained).toBe(true)
  })

  it("passes false when it is absent, so an ordinary signup sees nothing", async () => {
    const { default: VerifyEmailRoute } = await import("@/app/verify-email/page")
    const element: any = await VerifyEmailRoute({
      searchParams: Promise.resolve({ email: "writer@estate.in" }),
    })
    expect(element.props.credentialRetained).toBe(false)
  })

  it("does not treat any other value as true", async () => {
    const { default: VerifyEmailRoute } = await import("@/app/verify-email/page")
    for (const existing of ["0", "true", "yes", ""]) {
      const element: any = await VerifyEmailRoute({
        searchParams: Promise.resolve({ email: "writer@estate.in", existing }),
      })
      expect(element.props.credentialRetained, `?existing=${existing} should not trigger the notice`).toBe(false)
    }
  })
})
