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

/**
 * The commit to actually test — which on a pull request is NOT `HEAD`.
 *
 * ⚠ THIS BUG DEFEATED THE ENTIRE CHECK, and defeated it silently, in the affirmative direction.
 * On a `pull_request` event `actions/checkout` checks out `refs/pull/N/merge`: a SYNTHETIC MERGE
 * of the branch into the current base. That commit contains `origin/main` by construction, so
 * `merge-base HEAD origin/main` equals `origin/main` **no matter how stale the source branch is**,
 * and the guard printed a green tick.
 *
 * Demonstrated against the branch this whole check exists for. Merging `origin/main` into the real
 * stale scanner tip `de238a5` and running the old code on the result:
 *
 *     ✓ base check: scanner/2026-09-14 contains origin/main (8ebacd18).   exit=0
 *
 * while `de238a5` itself was sixteen commits behind. A guard that passes on the one input it was
 * written to reject is worse than no guard, because it also reports that it ran. Raised by
 * Greptile on PR #20.
 *
 * `github.event.pull_request.head.sha` is the real tip, passed in as PR_HEAD_SHA by the workflow.
 * It is always present in the object store: it is the first parent of the synthetic merge, and the
 * workflow clones with `fetch-depth: 0`. Fetched explicitly anyway if it somehow is not, because
 * failing to find it must not silently fall back to the commit that hides the problem.
 */
function commitUnderTest() {
  const prHead = (process.env.PR_HEAD_SHA || "").trim()
  if (!prHead) return { rev: "HEAD", label: "HEAD" }

  try {
    git("cat-file", "-e", `${prHead}^{commit}`)
  } catch {
    try {
      git("fetch", "origin", prHead, "--quiet", "--depth=100")
    } catch {
      console.error(
        `✗ base check: PR head ${prHead.slice(0, 8)} is not in this clone and could not be fetched.\n` +
          "  Refusing to fall back to HEAD — on a pull request HEAD is a synthetic merge that\n" +
          "  already contains the base, so checking it would pass unconditionally.",
      )
      process.exit(1)
    }
  }
  return { rev: prHead, label: `${prHead.slice(0, 8)} (pull request head)` }
}

function main() {
  const branch = currentBranch()

  if (branch === BASE || branch === "HEAD") {
    console.log(`base check: on ${BASE} itself — nothing to compare.`)
    return 0
  }

  /**
   * ⚠ FAILS CLOSED. The first version returned 0 here "rather than failing on a network problem",
   * which handed a green required check to any branch on the one occasion the gate could not do
   * its job. Raised by Greptile on PR #20.
   *
   * The reasoning behind the original was borrowed from the digest dormancy gate, which genuinely
   * does fail open (lib/server/agents/tenant-dormancy.ts) — and that is a policy copied without
   * its justification. There, failing open sends an email nobody needed. **Here, failing open ships
   * an unverified branch**, and the whole subject of this check is whether a piece of information
   * is current. You cannot detect staleness using possibly-stale data: a local `origin/main` left
   * over from an earlier run is exactly the input that makes a behind-branch look up to date, so
   * "carry on with whatever ref we already have" is not a safer middle path, it is the bug.
   *
   * A red run from a transient fetch failure is re-runnable in one click. A false green is not
   * detectable at all.
   */
  try {
    git("fetch", "origin", BASE, "--quiet")
  } catch (error) {
    console.error(`\n✗ base check: could not fetch ${remoteBase}.\n`)
    console.error(
      "  Refusing to pass. This check exists to decide whether a branch is current, so it cannot\n" +
        "  answer using a base ref it was unable to refresh. Re-run the job; if it keeps failing,\n" +
        "  the clone or the network is the problem and that is worth knowing.\n",
    )
    console.error(`  ${String(error instanceof Error ? error.message : error).slice(0, 300)}\n`)
    return 1
  }

  const { rev: head, label: headLabel } = commitUnderTest()
  const mergeBase = git("merge-base", head, remoteBase)
  const baseHead = git("rev-parse", remoteBase)

  if (mergeBase === baseHead) {
    console.log(`✓ base check: ${branch} contains ${remoteBase} (${baseHead.slice(0, 8)}).`)
    console.log(`  checked ${headLabel}`)
    return 0
  }

  const behind = Number(git("rev-list", "--count", `${head}..${remoteBase}`))
  const isScanner = branch.startsWith("scanner/")
  const allowance = isScanner ? SCANNER_ALLOWANCE : HUMAN_ALLOWANCE

  const detail = [
    `branch        ${branch}`,
    `checked       ${headLabel}`,
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
