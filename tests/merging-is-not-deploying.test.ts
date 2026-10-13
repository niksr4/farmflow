import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * MERGING TO `main` MUST NOT DEPLOY.
 *
 * For most of this project's life it did: a merge was live for every tenant in about three
 * minutes, with no preflight, no smoke and no way back except noticing. The release gate
 * (scripts/dev/go-live.mjs) exists to put a schema check in front and an automatic revert behind
 * that moment -- and it is worth nothing while a merge can bypass it entirely.
 *
 * ⚠ THE SETTING LIVES IN vercel.json, NOT IN THE PROJECT API. A `PATCH /v9/projects/:id` with
 * `{"link":{"deploymentEnabled":{"main":false}}}` returns 200 and changes NOTHING -- it was tried
 * on 2026-10-13, reported success, and `link.deploymentEnabled` read back `undefined`. An hour of
 * believing the door was shut while it was open. The documented route is this file.
 *
 * Preview deployments are deliberately untouched: only `main` is listed, so pull requests still
 * build and the Vercel check keeps working. Deploying is now `pnpm go-live -- --yes`, which is the
 * only path that runs the preflight and can revert itself.
 */

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"))

describe("a merge to main cannot reach production on its own", () => {
  it("disables git-triggered deployments for main", () => {
    expect(
      vercelConfig?.git?.deploymentEnabled?.main,
      "vercel.json no longer stops main from auto-deploying -- merging is deploying again, and the release gate is bypassable",
    ).toBe(false)
  })

  it("leaves every other branch deploying, so previews and the Vercel PR check still work", () => {
    const enabled = vercelConfig?.git?.deploymentEnabled
    // An object keyed by branch: anything unlisted defaults to true. A bare `false` here would
    // kill preview builds too, which is how the PR check would silently stop meaning anything.
    expect(typeof enabled).toBe("object")
    expect(Object.keys(enabled)).toEqual(["main"])
  })

  it("keeps the cron schedule, which lives in the same file", () => {
    // This file is small and easy to rewrite wholesale; the nightly orchestrator is the thing that
    // would quietly stop running if someone did.
    expect(vercelConfig?.crons).toEqual([{ path: "/api/cron/orchestrator", schedule: "0 2 * * *" }])
  })
})
