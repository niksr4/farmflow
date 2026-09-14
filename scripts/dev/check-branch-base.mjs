#!/usr/bin/env node
/**
 * Is this branch based on current `main`?
 *
 * ⚠ WHY THIS IS A SCRIPT AND NOT A DOCUMENT. docs/SCANNER-BASE-BRANCH.md has said "always branch
 * from freshly-fetched origin/main" since 2026-09-11. It is a paste-block for the scanner's task
 * file, and rule 1 of it was never applied — proven on 2026-09-14, when PR #17 arrived based on
 * `refactor/inventory-shell-pass-2@64e6dfeb`, **16 commits behind main**, with the digest
 * reporting "verified fast-forward — same as last run, main hasn't moved." Main had moved: five
 * PRs (#12–#16) had landed since.
 *
 * That is the second occurrence. The first (2026-09-11) turned forty-line fixes into 8,617-line
 * pull requests and made Greptile score PR #8 0/5 for being "substantially broader than its
 * title" — a correct verdict about somebody else's feature branch. The response was to write the
 * document above. A document that has to be pasted by hand is a fix that has not happened.
 *
 * WHAT GOES WRONG when the base is stale, in order of how much it costs:
 *
 *   1. CI GREEN MEANS NOTHING. The branch is tested against the code that existed at the old
 *      base, not against what it will merge into. PR #17 was green against a tree from before
 *      five merged PRs.
 *   2. The review lands on the wrong code — the diff carries someone else's work.
 *   3. The diff-size heuristic in the scanner's own policy misfires, because the size it measures
 *      is mostly other people's commits.
 *
 * Exit codes: 0 clean, 1 stale base. Prints the fix.
 */

import { execFileSync } from "node:child_process"

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()

const BASE = process.env.BASE_BRANCH || "main"
const remoteBase = `origin/${BASE}`

/**
 * How far behind is acceptable.
 *
 * Zero for `scanner/**`, because the whole point is that an unattended agent branches from fresh
 * `origin/main` every run — there is no reason for it ever to be behind, and "a little stale" is
 * how sixteen commits happen. Human branches get a wider allowance: being a few commits behind
 * while you work is normal and failing CI for it would be noise nobody thanks you for.
 */
const SCANNER_ALLOWANCE = 0
const HUMAN_ALLOWANCE = Number(process.env.BASE_DRIFT_ALLOWANCE ?? 40)

function currentBranch() {
  // In GitHub Actions the checkout is detached, so read the ref the workflow was triggered for.
  const fromCi = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME
  if (fromCi) return fromCi
  return git("rev-parse", "--abbrev-ref", "HEAD")
}

function main() {
  const branch = currentBranch()

  if (branch === BASE || branch === "HEAD") {
    console.log(`base check: on ${BASE} itself — nothing to compare.`)
    return 0
  }

  try {
    git("fetch", "origin", BASE, "--quiet")
  } catch {
    console.log(`base check: could not fetch ${remoteBase}; skipping rather than failing on a network problem.`)
    return 0
  }

  const mergeBase = git("merge-base", "HEAD", remoteBase)
  const baseHead = git("rev-parse", remoteBase)

  if (mergeBase === baseHead) {
    console.log(`✓ base check: ${branch} contains ${remoteBase} (${baseHead.slice(0, 8)}).`)
    return 0
  }

  const behind = Number(git("rev-list", "--count", `HEAD..${remoteBase}`))
  const isScanner = branch.startsWith("scanner/")
  const allowance = isScanner ? SCANNER_ALLOWANCE : HUMAN_ALLOWANCE

  const detail = [
    `branch        ${branch}`,
    `merge-base    ${mergeBase.slice(0, 8)}`,
    `${remoteBase.padEnd(13)} ${baseHead.slice(0, 8)}`,
    `behind by     ${behind} commit${behind === 1 ? "" : "s"}`,
  ].join("\n  ")

  if (behind <= allowance) {
    console.log(`base check: ${branch} is ${behind} behind ${remoteBase}, within the allowance of ${allowance}.`)
    console.log(`  ${detail}`)
    return 0
  }

  console.error(`\n✗ base check: ${branch} is not based on current ${remoteBase}.\n`)
  console.error(`  ${detail}\n`)
  if (isScanner) {
    console.error(
      "  A scanner branch must be cut from freshly-fetched origin/main every run, so that CI green\n" +
        "  means green against what it will merge into. See docs/SCANNER-BASE-BRANCH.md.\n\n" +
        "      git fetch origin main\n" +
        `      git switch -c scanner/$(date +%Y-%m-%d) origin/${BASE}\n`,
    )
  }
  console.error(`  To fix this branch in place, without rewriting its history:\n\n      git merge origin/${BASE}\n`)
  return 1
}

process.exit(main())
