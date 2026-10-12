#!/usr/bin/env node
/**
 * Take the current working tree live, with a gate in front and a net under it.
 *
 *   pnpm go-live                  # report what it would do, change nothing
 *   pnpm go-live -- --yes         # actually do it
 *
 * The sequence, and why it is this one:
 *
 *   1. PREFLIGHT prod's schema. Refuses if prod is missing a migration this branch needs. This is
 *      the step that would have stopped #75/#79 going out ahead of migration 154.
 *   2. BUILD a production deployment with --skip-domain. Real production env vars, real build,
 *      domain untouched. If it fails to build, nothing has happened.
 *   3. RECORD what is live right now, BEFORE moving anything. This is the rollback target, and it
 *      has to be captured first -- after the alias there is no record of what it displaced.
 *   4. ALIAS both domains. This is the moment it is live.
 *   5. SMOKE the live site immediately.
 *   6. ROLL BACK automatically if the smoke fails.
 *
 * ⚠ WHY THE SMOKE IS AFTER THE ALIAS AND NOT BEFORE. It is not a choice. The project sets
 * ssoProtection.deploymentType = "all_except_custom_domains", so the --skip-domain URL answers
 * 302 -> vercel.com/sso-api for every path; there is nothing to smoke until the domain moves. No
 * automation bypass is configured on this plan, and relaxing ssoProtection would put every preview
 * build on the public internet instead. Given that, the honest design is not to pretend there is a
 * pre-live test -- it is to make the live window as short as possible and the revert automatic.
 *
 * ⚠ THIS CHANGES WHAT EVERY CUSTOMER SEES. Nothing moves without --yes, by project convention the
 * human word for that is "ronaldo", and this script is not allowed to say it on your behalf.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { parseDeploymentUrl } from "./release-utils.mjs"
import { DOMAINS, setAliases, verifyAliases } from "./vercel-alias.mjs"
const flag = (n) => process.argv.includes(`--${n}`)
const LIVE = flag("yes")

const token =
  process.env.Vercel_token ||
  (() => {
    try {
      return (readFileSync(".env.local", "utf8").match(/^Vercel_token=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "")
    } catch {
      return null
    }
  })()
if (!token) {
  console.error("No Vercel_token in .env.local -- cannot reach Vercel.")
  process.exit(1)
}

const api = async (p, init) => {
  const res = await fetch(`https://api.vercel.com${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  return body
}

const step = (n, label) => console.log(`\n── ${n}. ${label} ${"─".repeat(Math.max(0, 74 - label.length))}`)
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8", ...opts })

const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim()
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().slice(0, 9)
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()

console.log(`\nGO LIVE   branch ${branch} @ ${sha}${dirty ? "  ⚠ working tree has uncommitted changes" : ""}`)
console.log(LIVE ? "  MODE: live -- the domains will move" : "  MODE: report only -- nothing will change (pass --yes to act)")

// ── 1. Preflight ──────────────────────────────────────────────────────────────────────────────
step(1, "Production schema preflight")
if (run("node", ["scripts/dev/preflight-prod.mjs"]).status !== 0) {
  console.error("\n⚠ STOPPED. Production's schema cannot serve this branch. Nothing was deployed.\n")
  process.exit(1)
}

// ── 2. Build ──────────────────────────────────────────────────────────────────────────────────
// ── 2. Record what is live, BEFORE anything is built or moved ────────────────────────────────
// This is the rollback target and it has to be captured first: once the alias moves there is no
// record of what it displaced.
step(2, "Record the rollback target")
const liveBefore = (await api(`/v4/aliases/${DOMAINS[0]}`)).deploymentId
console.log(`  currently live: ${liveBefore}`)
if (!liveBefore) {
  console.error("\n⚠ STOPPED. Cannot read what is currently live, so a rollback could not be aimed.\n")
  process.exit(1)
}

// ── 3. Build ──────────────────────────────────────────────────────────────────────────────────
step(3, "Build a production deployment (domains untouched)")
let newUid = null
if (!LIVE) {
  console.log("  skipped in report mode")
} else {
  const built = spawnSync("vercel", ["--prod", "--skip-domain", "--yes", "--token", token], { encoding: "utf8" })
  if (built.status !== 0) {
    console.error(`\n⚠ BUILD FAILED. Nothing was deployed, the domains never moved.\n${built.stderr || ""}\n`)
    process.exit(1)
  }
  console.log(built.stdout?.trim())

  /**
   * ⚠ RESOLVE THE UID FROM THE BUILD'S OWN OUTPUT, never from "the newest READY deployment".
   * Merging to main auto-deploys, so another build can appear and go READY while this script is
   * running -- it would be the newest non-live entry and would get aliased in place of ours, while
   * the success message below still named this branch and commit. Shipping the wrong build and
   * reporting the right one is the worst thing this tool could do.
   */
  const url = parseDeploymentUrl(`${built.stdout || ""}\n${built.stderr || ""}`)
  if (!url) {
    console.error("\n⚠ STOPPED. The build succeeded but printed no deployment URL, so there is no")
    console.error("  way to know which deployment to alias. Nothing was moved.\n")
    process.exit(1)
  }
  const resolved = await api(`/v13/deployments/${url.replace(/^https:\/\//, "")}`)
  newUid = resolved.id || resolved.uid
  if (!newUid) {
    console.error(`\n⚠ STOPPED. Could not resolve ${url} to a deployment id. Nothing was moved.\n`)
    process.exit(1)
  }
  console.log(`  built: ${newUid}  (${url})`)
}

if (!LIVE) {
  console.log(`\n  would build, then alias ${DOMAINS.join(" and ")} to THAT build,`)
  console.log(`  smoke the live site, and revert to ${liveBefore} if the smoke fails.\n`)
  process.exit(0)
}

// ── 4. Alias ──────────────────────────────────────────────────────────────────────────────────
step(4, "Point the domains at the new build -- THIS IS THE MOMENT IT IS LIVE")

/** Put everything back on `uid` and say honestly whether it took. */
const revertTo = async (uid, why) => {
  const { moved, failed } = await setAliases(api, uid)
  for (const d of moved) console.log(`  ✓ ${d} -> ${uid}`)
  for (const f of failed) console.error(`  ⚠ ${f.domain} FAILED: ${f.error}`)
  const wrong = await verifyAliases(api, uid)
  if (wrong.length > 0) {
    console.error(`\n⚠⚠ ROLLBACK DID NOT TAKE (${why}). These domains are NOT on ${uid}:`)
    for (const w of wrong) console.error(`     ${w.domain} -> ${w.actual}`)
    console.error(`\n   Fix by hand now: pnpm rollback -- --to ${uid} --yes\n`)
    return false
  }
  console.error(`\n⚠ ROLLED BACK to ${uid} (${why}). Both domains confirmed. The failed build is`)
  console.error("  still on Vercel for inspection.\n")
  return true
}

const { moved, failed } = await setAliases(api, newUid)
for (const d of moved) console.log(`  ✓ ${d} -> ${newUid}`)

/**
 * ⚠ A PARTIAL ALIAS IS ITS OWN OUTAGE. If www moved and the apex did not, half the traffic is on
 * each build -- a state that is neither deployed nor rolled back. The previous version threw out
 * of the loop and exited, leaving it that way with no revert.
 */
if (failed.length > 0) {
  for (const f of failed) console.error(`  ⚠ ${f.domain} FAILED: ${f.error}`)
  step(5, "ALIAS PARTIALLY APPLIED -- reverting")
  await revertTo(liveBefore, "the domains could not all be moved")
  process.exit(1)
}

const wrongAfterAlias = await verifyAliases(api, newUid)
if (wrongAfterAlias.length > 0) {
  for (const w of wrongAfterAlias) console.error(`  ⚠ ${w.domain} reports ${w.actual}, not ${newUid}`)
  step(5, "ALIAS DID NOT TAKE -- reverting")
  await revertTo(liveBefore, "the alias was accepted but is not being served")
  process.exit(1)
}

// ── 5. Smoke ──────────────────────────────────────────────────────────────────────────────────
step(5, "Smoke the live site")
const smoke = run("node", ["scripts/dev/smoke-live.mjs"])

// ── 6. Revert on failure ──────────────────────────────────────────────────────────────────────
if (smoke.status !== 0) {
  step(6, "SMOKE FAILED -- reverting")
  await revertTo(liveBefore, "the smoke failed")
  process.exit(1)
}

console.log(`\n✓ LIVE -- ${newUid} (${branch} @ ${sha}) is serving thefarmflow.in, and the smoke passed.`)
console.log(`  Revert at any time: pnpm rollback -- --to ${liveBefore} --yes\n`)
