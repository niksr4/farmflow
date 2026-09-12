#!/usr/bin/env node
/**
 * Put a gate in front of `main`, which on this repo means in front of production.
 *
 *   node scripts/dev/setup-main-ruleset.mjs          # show what it would do
 *   node scripts/dev/setup-main-ruleset.mjs --apply  # write it
 *   node scripts/dev/setup-main-ruleset.mjs --remove # take it off again
 *
 * WHY THIS IS POSSIBLE, WHEN CLAUDE.md SAYS IT IS NOT. That entry is about Vercel's
 * `deploymentPolicy`, which is Pro-only and genuinely unavailable here — and about the
 * domain-`gitBranch` workaround, which caused a real outage and must not be retried. Both are
 * true. But neither is the only place a gate can live.
 *
 * Every push to `main` auto-deploys to production, so "cannot reach main" and "cannot reach
 * production" are the same statement. THIS REPOSITORY IS PUBLIC, which makes GitHub rulesets free.
 * The gate goes at GitHub instead of at Vercel, and it does the same job.
 *
 * WHAT IT DOES NOT DO: it does not stop a merge from deploying. Merging IS the release, and that
 * is fine once nothing can reach `main` except a reviewed, CI-green pull request. The human word
 * before a release ("ronaldo") is a separate agreement and this does not replace it.
 *
 * See docs/RELEASE-FLOW.md for what was broken and why this exists.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const REPO = "niksr4/farmflow"
const NAME = "main is production"

/**
 * ⚠ THE LOCAL `gh` IS THE WRONG ACCOUNT, and this is the thing that wastes an afternoon.
 *
 * `git push` works because origin is SSH (git@github.com:niksr4/...) and uses niksr4's key. `gh`
 * authenticates over HTTPS as **NikKaoss**, which has pull-only access to this repo:
 *
 *   gh api repos/niksr4/farmflow --jq .permissions
 *   {"admin":false,"maintain":false,"pull":true,"push":false,"triage":false}
 *
 * So every `gh` write — rulesets, pull requests — 403s while pushes succeed, which reads as a
 * puzzling intermittent permission problem rather than two different identities. The same split
 * the Vercel CLI has (see the token note in CLAUDE.md).
 *
 * Supply a token for the repo owner instead, either way:
 *   GITHUB_ADMIN_TOKEN=... node scripts/dev/setup-main-ruleset.mjs --apply
 *   node scripts/dev/setup-main-ruleset.mjs --apply --token=<pat>
 *
 * It needs `Administration: write` on this repo. Without one, the script falls back to `gh` and
 * says plainly which account it is using.
 */
const tokenArg = process.argv.find((a) => a.startsWith("--token="))?.slice("--token=".length)
const envToken = () => {
  if (process.env.GITHUB_ADMIN_TOKEN) return process.env.GITHUB_ADMIN_TOKEN
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(/^GITHUB_ADMIN_TOKEN=(.*)$/m)
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch {}
  }
  return null
}
const TOKEN = tokenArg || envToken()

const APPLY = process.argv.includes("--apply")
const REMOVE = process.argv.includes("--remove")

/**
 * required_approving_review_count is 0 ON PURPOSE and it is not a weakened gate.
 *
 * There is one maintainer, and GitHub does not count a self-approval — so requiring one would make
 * `main` permanently unmergeable, and the reliable consequence of an unmergeable branch is that
 * somebody turns the rule off and force-pushes. The gate that matters is "a PR must exist and CI
 * must be green": the PR is what Greptile reviews, what CI runs against, and what leaves a record.
 */
const ruleset = {
  name: NAME,
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  rules: [
    // main is production history. Rewriting it rewrites what shipped.
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
        allowed_merge_methods: ["merge", "squash"],
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        // Not strict: requiring the branch to be up to date with main before every merge means
        // re-running CI on every unrelated merge, which on a solo repo is friction with no reader.
        strict_required_status_checks_policy: false,
        // The job id in .github/workflows/ci.yml — lint, typecheck, unit tests, build, public e2e.
        required_status_checks: [{ context: "quality" }],
      },
    },
  ],
}

/** GitHub API call: a supplied token when there is one, otherwise whatever `gh` is logged in as. */
const api = (path, { method = "GET", body } = {}) => {
  if (TOKEN) {
    const args = ["-sS", "-X", method, `https://api.github.com${path}`,
      "-H", `Authorization: Bearer ${TOKEN}`,
      "-H", "Accept: application/vnd.github+json",
      "-H", "X-GitHub-Api-Version: 2022-11-28"]
    if (body) args.push("-H", "Content-Type: application/json", "-d", "@-")
    return execFileSync("curl", args, { input: body, encoding: "utf8" })
  }
  const args = ["api", path.replace(/^\//, "")]
  if (method !== "GET") args.push("-X", method)
  if (body) args.push("--input", "-")
  return execFileSync("gh", args, { input: body, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
}

const whoami = () => {
  try {
    return TOKEN ? JSON.parse(api("/user")).login : execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8" }).trim()
  } catch {
    return "(unknown)"
  }
}

const existing = () => {
  try {
    return JSON.parse(api(`/repos/${REPO}/rulesets`)).filter((r) => r.name === NAME)
  } catch (error) {
    console.error("Could not list rulesets.")
    console.error(String(error.stderr || error.message).trim())
    process.exit(1)
  }
}

const found = existing()

if (REMOVE) {
  if (!found.length) {
    console.log(`No ruleset named "${NAME}" on ${REPO}. Nothing to remove.`)
    process.exit(0)
  }
  for (const r of found) {
    api(`/repos/${REPO}/rulesets/${r.id}`, { method: "DELETE" })
    console.log(`Removed ruleset ${r.id} (${r.name}).`)
  }
  console.log("\nmain is unprotected again. Direct pushes reach production.")
  process.exit(0)
}

console.log(`Repo:    ${REPO}`)
console.log(`Acting as: ${whoami()}${TOKEN ? " (supplied token)" : " (gh login)"}`)
console.log(`Ruleset: "${NAME}" — ${found.length ? `already present (id ${found[0].id})` : "not present"}`)
console.log(`
On refs/heads/main this requires:
  - a pull request to merge          (0 approvals — solo maintainer, see the note in this file)
  - the "quality" CI check green     (lint, typecheck, unit tests, build, public e2e)
  - no force-push, no deletion

Every push to main auto-deploys, so this is the gate in front of production.
Merging is still a deliberate act and still needs the human word.
`)

if (!APPLY) {
  console.log(found.length ? "Already applied. Re-run with --apply to update it." : "Dry run. Re-run with --apply to write it.")
  process.exit(0)
}

try {
  if (found.length) {
    api(`/repos/${REPO}/rulesets/${found[0].id}`, { method: "PUT", body: JSON.stringify(ruleset) })
    console.log(`Updated ruleset ${found[0].id}.`)
  } else {
    const created = JSON.parse(api(`/repos/${REPO}/rulesets`, { method: "POST", body: JSON.stringify(ruleset) }))
    console.log(`Created ruleset ${created.id}.`)
  }
  console.log("\nmain is gated. Undo any time with: node scripts/dev/setup-main-ruleset.mjs --remove")
} catch (error) {
  console.error("Failed to write the ruleset.")
  console.error(String(error.stderr || error.message).trim())
  console.error("\nNeeds a token with Administration: write on this repo.")
  console.error("The local gh login is NikKaoss, which has pull-only access — see the note at the")
  console.error("top of this file. Pass one with --token=<pat> or set GITHUB_ADMIN_TOKEN.")
  process.exit(1)
}
