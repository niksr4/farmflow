#!/usr/bin/env node
/**
 * Put thefarmflow.in back on the last deployment that worked.
 *
 *   pnpm rollback                 # report only: what is live, what it would go back to
 *   pnpm rollback -- --yes        # actually move the domains
 *   pnpm rollback -- --list       # recent production deployments
 *   pnpm rollback -- --to dpl_x --yes
 *
 * WHY A SCRIPT AND NOT A NOTE. The rollback command lived in CLAUDE.md as prose, which means it
 * had to be found, read and adapted while the site was down -- and the version written there moves
 * `www.thefarmflow.in` only. BOTH domains are aliased to the deployment (checked 2026-10-12: www
 * and the apex both pointed at dpl_AFP8Ni2piRs45BzibFuLTj6e8PFD). Moving one leaves real visitors
 * on the broken build at the other, which is a rollback that looks done and is not.
 *
 * ⚠ DEFAULTS TO REPORTING. Nothing moves without --yes. This changes what every customer sees.
 */
import { readFileSync } from "node:fs"

import { pickRollbackTarget } from "./release-utils.mjs"

const PROJECT = "farmflowv1"
const DOMAINS = ["www.thefarmflow.in", "thefarmflow.in"]

const flag = (n) => process.argv.includes(`--${n}`)
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 ? process.argv[i + 1] : null
}

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

const short = (d) =>
  `${new Date(d.created).toISOString().slice(0, 16).replace("T", " ")}  ${String(d.state).padEnd(8)}  ${d.uid}  ${(d.meta?.githubCommitSha || d.meta?.gitCommitSha || "").slice(0, 8)}`

const { deployments } = await api(`/v6/deployments?projectId=${PROJECT}&target=production&limit=20`)

if (flag("list")) {
  console.log("\nRECENT PRODUCTION DEPLOYMENTS\n")
  deployments.forEach((d) => console.log("  " + short(d)))
  console.log()
  process.exit(0)
}

// What is live right now, read from the alias rather than assumed to be the newest build -- after
// a previous rollback the newest deployment is NOT the one serving traffic, and a script that
// assumes otherwise rolls forward into the thing you just escaped.
const live = await api(`/v4/aliases/${DOMAINS[0]}`)
const liveUid = live.deploymentId
const liveDeployment = deployments.find((d) => d.uid === liveUid)

console.log("\nLIVE NOW")
console.log("  " + (liveDeployment ? short(liveDeployment) : `${liveUid}  (older than the last 20 production builds)`))

const target = arg("to") ? deployments.find((d) => d.uid === arg("to")) : pickRollbackTarget(deployments, liveUid)

if (!target) {
  console.error(
    arg("to")
      ? `\n⚠ ${arg("to")} is not in the last 20 production deployments. Check 'pnpm rollback -- --list'.\n`
      : "\n⚠ No READY production deployment to roll back to. Refusing to guess.\n",
  )
  process.exit(1)
}
if (target.state !== "READY") {
  console.error(`\n⚠ ${target.uid} is ${target.state}, not READY. Aliasing the domain to it would serve nothing.\n`)
  process.exit(1)
}

console.log("\nWOULD ROLL BACK TO")
console.log("  " + short(target))
console.log(`\nDomains to move: ${DOMAINS.join(", ")}`)

if (!flag("yes")) {
  console.log("\nReport only. Re-run with --yes to move the domains.\n")
  process.exit(0)
}

for (const domain of DOMAINS) {
  await api(`/v2/deployments/${target.uid}/aliases`, { method: "POST", body: JSON.stringify({ alias: domain }) })
  console.log(`  ✓ ${domain} -> ${target.uid}`)
}

// Confirm from Vercel rather than from the absence of an error. A 200 on the alias POST means the
// request was accepted; this is what actually serves.
for (const domain of DOMAINS) {
  const now = await api(`/v4/aliases/${domain}`)
  if (now.deploymentId !== target.uid) {
    console.error(`\n⚠ ${domain} still points at ${now.deploymentId}. The rollback did NOT take.\n`)
    process.exit(1)
  }
}

console.log(`\n✓ ROLLED BACK -- both domains now serve ${target.uid}`)
console.log("  Verify: pnpm smoke\n")
