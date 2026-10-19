import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * A FAILURE IN ONE TAB MUST NOT REPLACE THE WHOLE WORKSPACE WITH AN ERROR SCREEN.
 *
 * ⚠ THERE WAS NO REACT ERROR BOUNDARY ANYWHERE IN THIS CODEBASE. Twenty-seven tab panels render
 * inside one route segment, so a throw while rendering ANY of them propagated to app/error.tsx and
 * blanked the entire app. On a phone in a field that means a failure in Market News takes out the
 * muster somebody is standing there to fill in, and the only way back is a reload.
 *
 * This does NOT identify the cause of the crashes the owner reports. Until #115 the boundary that
 * caught them reported nothing anywhere, so there was no data to diagnose from. What it does is
 * cut the blast radius from "the app" to "one tab", and tag the tab in Sentry so the next one is
 * diagnosable.
 */

const captureException = vi.fn()
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

import TabPanel from "@/components/tab-panel"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

function Boom(): never {
  throw new Error("picking log blew up")
}

describe("a tab that throws", () => {
  it("shows its own message and leaves the rest of the workspace mounted", () => {
    // React logs the caught error; silence it so the run stays readable.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    render(
      <Tabs defaultValue="picking">
        <TabsList>
          <TabsTrigger value="picking">Picking</TabsTrigger>
          <TabsTrigger value="muster">Muster</TabsTrigger>
        </TabsList>
        <TabPanel value="picking" forceMount>
          <Boom />
        </TabPanel>
        <TabPanel value="muster" forceMount>
          <p>Muster is fine</p>
        </TabPanel>
      </Tabs>,
    )

    // The failing tab degrades in place...
    expect(screen.getByText(/This tab could not be shown/i)).toBeTruthy()
    // ...and the app around it is still there. This is the whole point.
    expect(
      screen.getByText("Muster is fine"),
      "a throw in one tab unmounted the rest of the workspace",
    ).toBeTruthy()
    // The tab strip survives, so the user can navigate away rather than reload.
    expect(screen.getByRole("tab", { name: "Muster" })).toBeTruthy()

    consoleError.mockRestore()
  })

  it("reports the failure to Sentry tagged with the tab that failed", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    captureException.mockClear()

    render(
      <Tabs defaultValue="picking">
        <TabPanel value="picking" forceMount>
          <Boom />
        </TabPanel>
      </Tabs>,
    )

    expect(captureException, "a swallowed render error is a crash nobody can fix").toHaveBeenCalled()
    const [error, options] = captureException.mock.calls[0] as [Error, any]
    expect(error.message).toBe("picking log blew up")
    expect(
      options?.tags?.tab,
      "'which tab' is the first question asked about a crash, and a minified stack does not " +
        "answer it reliably",
    ).toBe("picking")
    expect(options?.tags?.boundary).toBe("workspace-tab")

    consoleError.mockRestore()
  })

  it("renders children untouched when nothing throws", () => {
    render(
      <Tabs defaultValue="ok">
        <TabPanel value="ok" forceMount>
          <p>Normal content</p>
        </TabPanel>
      </Tabs>,
    )
    expect(screen.getByText("Normal content")).toBeTruthy()
    expect(screen.queryByText(/could not be shown/i)).toBeNull()
  })
})

describe("every workspace panel is wrapped", () => {
  /**
   * Derived, so a twenty-eighth tab added later is covered rather than silently unprotected.
   * A bare <TabsContent> in the workspace shell is the regression this guards.
   */
  it("uses TabPanel throughout the shell, with no bare TabsContent left", () => {
    const src = readFileSync("components/inventory-system.tsx", "utf8")
    const panels = (src.match(/<TabPanel\b/g) ?? []).length
    expect(panels, "the shell renders no TabPanel at all -- the scan is broken").toBeGreaterThan(20)
    expect(
      (src.match(/<TabsContent\b/g) ?? []).length,
      "a bare <TabsContent> in the workspace shell has no error boundary, so a throw inside it " +
        "still blanks the whole app. Use TabPanel.",
    ).toBe(0)
  })

  it("has no other component rendering bare TabsContent inside the workspace", () => {
    // Scoped to the shell's own sub-components; ui/tabs.tsx and tab-panel.tsx legitimately use it.
    const files = execFileSync("git", ["ls-files", "components"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => f !== "components/ui/tabs.tsx" && f !== "components/tab-panel.tsx")
    const offenders = files.filter((f) => /<TabsContent\b/.test(readFileSync(f, "utf8")))
    // Reported rather than asserted empty: other surfaces (settings, admin) use tabs too and are
    // outside this boundary's remit. The assertion that matters is the shell one above.
    expect(offenders).not.toContain("components/inventory-system.tsx")
  })
})
