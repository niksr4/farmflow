#!/usr/bin/env node
/**
 * Does `main` agree with what is actually serving thefarmflow.in — and is anything stuck in a PR?
 *
 *   node scripts/dev/check-release-drift.mjs
 *
 * WHY THIS EXISTS. On 2026-09-11 the answer was no, and nothing anywhere said so:
 *
 *   main was 26 commits behind the branch production was running
 *   4 scanner pull requests were open, the oldest 2 days old, none merged
 *   fixes inside them were not live — ai-analysis was still leaking raw error.message,
 *     having been "fixed" on the 9th
 *
 * Every one of those is a single query. None of them was being asked, so the drift grew quietly
 * while the daily digest reported each day's scan as done. "Filed" is not "shipped", and only one
 * of those is worth reporting as an outcome.
 *
 * The deploy is made from the CLI (see the release process in CLAUDE.md), which means Vercel's
 * GitHub integration fields are empty — the git metadata lands under `meta.gitCommitSha` instead,
 * which is what this reads. Looking for `githubCommitSha` returns null and invites the conclusion
 * that the commit is unknowable. It is not.
 *
 * Read-only. Talks to GitHub and Vercel, writes nothing.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const REPO = "niksr4/farmflow"

const envValue = (name) => {
  if (process.env[name]) return process.env[name]
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
      if (m) return m[1].trim().replace(/^["']|["']$/g, "")
    } catch {}
  }
  return null
}

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim()
const days = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)

let problems = 0
const bad = (line) => {
  problems += 1
  console.log(`  ⚠ ${line}`)
}

// ── What is live ──────────────────────────────────────────────────────────────────────────────
const token = envValue("Vercel_token")
if (!token) {
  console.error("No Vercel_token in .env.local — cannot ask what is deployed.")
  process.exit(1)
}

const res = await fetch("https://api.vercel.com/v6/deployments?limit=1&target=production&state=READY", {
  headers: { Authorization: `Bearer ${token}` },
})
const latest = (await res.json()).deployments?.[0]
if (!latest) {
  console.error("Vercel returned no ready production deployment.")
  process.exit(1)
}

const detail = await (
  await fetch(`https://api.vercel.com/v13/deployments/${latest.uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json()

const liveSha = detail.meta?.gitCommitSha || null
const liveRef = detail.meta?.gitCommitRef || "(unknown)"

console.log("\nPRODUCTION")
console.log(`  deployment  ${latest.uid}`)
console.log(`  branch      ${liveRef}`)
console.log(`  commit      ${liveSha ? liveSha.slice(0, 9) : "(no git metadata recorded)"}`)
console.log(`  source      ${detail.source || "?"}`)

// ── What main says ────────────────────────────────────────────────────────────────────────────
sh("git", ["fetch", "-q", "origin", "main", liveRef !== "(unknown)" ? liveRef : "main"])
const mainSha = sh("git", ["rev-parse", "origin/main"])

console.log("\nMAIN")
console.log(`  commit      ${mainSha.slice(0, 9)}`)

if (!liveSha) {
  bad("The live deployment records no commit, so nothing here can be compared to it.")
} else if (liveSha === mainSha) {
  console.log("  ✓ main is exactly what is serving production")
} else {
  const behind = Number(sh("git", ["rev-list", "--count", `origin/main..${liveSha}`]))
  const ahead = Number(sh("git", ["rev-list", "--count", `${liveSha}..origin/main`]))
  if (behind > 0) bad(`main is ${behind} commit(s) BEHIND production — main is not what customers have`)
  if (ahead > 0) bad(`main is ${ahead} commit(s) AHEAD of production — merged work that never shipped`)
  if (liveRef !== "main") bad(`production is serving "${liveRef}", not main`)
}

// ── What is stuck ─────────────────────────────────────────────────────────────────────────────
console.log("\nOPEN PULL REQUESTS")
const prs = JSON.parse(
  sh("gh", ["pr", "list", "--repo", REPO, "--state", "open", "--json", "number,title,createdAt,headRefName,additions,deletions", "--limit", "50"]),
)

if (!prs.length) {
  console.log("  none")
} else {
  for (const pr of prs) {
    const age = days(pr.createdAt)
    const size = pr.additions + pr.deletions
    const flags = []
    // A scanner PR is a handful of small fixes. Anything this size means it was branched from a
    // feature branch rather than from main, and the review will land on the wrong code.
    if (size > 400) flags.push(`${size} lines — wrong base branch?`)
    if (age >= 2) flags.push(`${age} days old`)
    const line = `#${pr.number} ${pr.title.slice(0, 56)}`
    if (flags.length) bad(`${line}\n      ${flags.join("  |  ")}`)
    else console.log(`  ✓ ${line} (${size} lines, ${age}d)`)
  }
}

// ── The gate ──────────────────────────────────────────────────────────────────────────────────
console.log("\nGATE ON MAIN")
try {
  const rulesets = JSON.parse(sh("gh", ["api", `repos/${REPO}/rulesets`]))
  const active = rulesets.filter((r) => r.enforcement === "active")
  if (!active.length) bad("no active ruleset — anything pushed to main goes straight to four live estates")
  else console.log(`  ✓ ${active.map((r) => `"${r.name}"`).join(", ")}`)
} catch {
  bad("could not read rulesets (token may lack Administration: read)")
}

console.log(
  problems === 0
    ? "\nNo drift.\n"
    : `\n${problems} thing(s) to deal with. See docs/RELEASE-FLOW.md.\n`,
)
process.exit(problems === 0 ? 0 : 1)
