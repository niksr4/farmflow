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

import { pickRollbackTarget } from "./release-utils.mjs"

const PROJECT = "farmflowv1"
const DOMAINS = ["www.thefarmflow.in", "thefarmflow.in"]
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
step(2, "Build a production deployment (domain untouched)")
if (!LIVE) {
  console.log("  skipped in report mode")
} else {
  const built = spawnSync("vercel", ["--prod", "--skip-domain", "--yes", "--token", token], { encoding: "utf8" })
  if (built.status !== 0) {
    console.error(`\n⚠ BUILD FAILED. Nothing was deployed, the domain never moved.\n${built.stderr || ""}\n`)
    process.exit(1)
  }
  console.log(built.stdout?.trim())
}

// ── 3. Record what is live, before displacing it ─────────────────────────────────────────────
step(3, "Record the rollback target")
const { deployments } = await api(`/v6/deployments?projectId=${PROJECT}&target=production&limit=20`)
const liveBefore = (await api(`/v4/aliases/${DOMAINS[0]}`)).deploymentId
const rollbackTo = deployments.find((d) => d.uid === liveBefore) || pickRollbackTarget(deployments, null)
console.log(`  currently live: ${liveBefore}`)
console.log(`  rollback target if the smoke fails: ${rollbackTo?.uid || "(none found -- STOPPING)"}`)
if (!rollbackTo) {
  console.error("\n⚠ STOPPED. With no rollback target this would be a one-way move.\n")
  process.exit(1)
}

const newest = deployments.find((d) => d.state === "READY" && d.uid !== liveBefore)
if (!LIVE) {
  console.log(`\n  would alias ${DOMAINS.join(" and ")} to the build from step 2,`)
  console.log("  then smoke the live site and roll back automatically if it fails.\n")
  process.exit(0)
}
if (!newest) {
  console.error("\n⚠ STOPPED. No new READY deployment to alias.\n")
  process.exit(1)
}

// ── 4. Alias ──────────────────────────────────────────────────────────────────────────────────
step(4, "Point the domains at the new build -- THIS IS THE MOMENT IT IS LIVE")
for (const domain of DOMAINS) {
  await api(`/v2/deployments/${newest.uid}/aliases`, { method: "POST", body: JSON.stringify({ alias: domain }) })
  console.log(`  ✓ ${domain} -> ${newest.uid}`)
}

// ── 5. Smoke ──────────────────────────────────────────────────────────────────────────────────
step(5, "Smoke the live site")
const smoke = run("node", ["scripts/dev/smoke-live.mjs"])

// ── 6. Roll back on failure ───────────────────────────────────────────────────────────────────
if (smoke.status !== 0) {
  step(6, "SMOKE FAILED -- rolling back")
  for (const domain of DOMAINS) {
    await api(`/v2/deployments/${rollbackTo.uid}/aliases`, { method: "POST", body: JSON.stringify({ alias: domain }) })
    console.log(`  ✓ ${domain} -> ${rollbackTo.uid}`)
  }
  console.error(`\n⚠ ROLLED BACK to ${rollbackTo.uid}. The failed build is still on Vercel for inspection.\n`)
  process.exit(1)
}

console.log(`\n✓ LIVE -- ${newest.uid} (${branch} @ ${sha}) is serving thefarmflow.in, and the smoke passed.`)
console.log(`  Revert at any time: pnpm rollback -- --to ${rollbackTo.uid} --yes\n`)
