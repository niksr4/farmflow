# The release flow, and why it was broken

> Written 2026-09-11, after Greptile found six real defects in payroll code that the daily scanner
> and the author's own tests had both passed over. That was not luck on Greptile's part. It was the
> only independent reader in the pipeline, and it was pointed at the wrong thing by accident.

## What was actually wrong

Four separate problems, one shape: **`main` was dead, and everything downstream of it was
pretending otherwise.**

| | Observed 2026-09-11 |
|---|---|
| `main` behind `feature/biometric-attendance` | **26 commits** (main 0 ahead) |
| What production actually runs | the feature branch, via `vercel alias` |
| Open scanner PRs, none merged | **4** (#5, #6, #7, #8) |
| Diff size Greptile was asked to judge on #8 | **+8,617 / −1,071** |
| Title of that PR | "sanitize raw error.message leaks across 9 routes" |

### The scanner's work was going nowhere

The scanner branches from whatever is checked out, which was the feature branch — so its PRs
against `main` carry the entire feature branch in their diff. Worse, none of them were ever merged
anywhere, so **four days of fixes were stranded**. Verified concretely: `app/api/ai-analysis` and
`app/api/ai-proactive-insights` still leaked raw `error.message` in production on 2026-09-11,
having been fixed by the scanner in PR #5 on 2026-09-09.

A scanner that finds real bugs and files them somewhere nothing reads is a scanner that costs money
and delivers nothing.

### Greptile was reviewing the wrong thing

Its verdict on #8 — "not safe to merge", confidence 0/5 — was a judgement on 8,617 lines of
unrelated feature work, reached because the scanner's branch happened to be based on it. The
review that came out of it was genuinely useful, which obscures the fact that it was an accident.
A small diff would have got a sharper review and an actionable verdict.

### And nothing independent was reading new code

This is the part worth internalising, because no amount of process fixes it directly:

- **The scanner is a linear sweep for known bug classes.** It was at file 137 of 935. Code written
  yesterday will not be reached for months, and when it is, it will be checked for *its* bug
  classes — not "is this arithmetic right".
- **Tests written by the author share the author's assumptions.** The clearest case is in
  `tests/payroll-month-report.test.ts`, which asserted the advance over-recovery as CORRECT and
  explained it in a comment: *"8,000 less 3,000 repaid less four instalments, floored at zero"*.
  That is ₹11,000 collected against ₹8,000 lent, written down as the expected answer. A test
  written from what the code does cannot catch what the code does wrong.

So the AI reviewer is not a nice-to-have here. On new code it is **the only adversarial reader**,
and the whole flow should be arranged so that it sees small, coherent diffs.

> **The reviewer is CodeRabbit, as of 2026-09-23.** It replaced Greptile, whose trial credits ran
> out: every "review" it posted on PRs #32, #33 and #34 was the same 50-credit-limit notice, one
> per push, so it had become noise on every PR rather than a reader. The `greptile.json` config was
> ported to `.coderabbit.yaml` in the same commit — **thirteen rules, each a production incident
> with a cost attached.** That file is accumulated evidence, not configuration; add to it when
> something new bites.
>
> CodeRabbit is free on public repositories, which is one more thing tied to this repo staying
> public — see the note in STATUS.md before changing visibility.
>
> ⚠ **Some findings are NOT in the inline comment list.** CodeRabbit posts findings GitHub cannot
> render inline as *outside diff range* comments, which are invisible to `gh pr view`,
> `gh pr checks` **and** the GraphQL `reviewThreads` query. PR #33 was merged on the belief that its
> review held three Minor items; the email carried two **Major** defects that none of those commands
> showed.
>
> ⚠ **This used to say "never through the API", and that was wrong — it cost six missed findings.**
> Outside-diff comments live in the pull request review's own `body` field, which the REST reviews
> endpoint does expose. Corrected after CodeRabbit pointed it out on PR #36, and *then* a full audit
> of all 41 PRs found what the wrong version had been hiding: **six** outside-diff findings across
> PRs #32, #33, #34 and #40, three of them Major — including a CWE-863 authorization bypass in
> `lib/location-access.ts` that had been live for three days. Believing the doc meant not running
> the one command that would have shown them.
>
> Read **all three** surfaces before merging:
>
> ```bash
> gh api repos/niksr4/farmflow/pulls/N/reviews  --jq '.[] | select(.user.login|test("coderabbit";"i")) | .body'
> gh api repos/niksr4/farmflow/pulls/N/comments --paginate --jq '.[] | "\(.path):\(.line)\n\(.body)"'
> gh api repos/niksr4/farmflow/issues/N/comments --paginate --jq '.[] | select(.user.login=="coderabbitai[bot]") | .body'
> ```
>
> The first is the one that was missing. Grep its output for `Outside diff range comments` and for
> `Actionable comments posted: N`, then check N against the number you actually read.
>
> ⚠ **And CodeRabbit reviews in more than one pass.** On PR #40 it posted three findings at 10:16 and
> two more **Majors at 10:31:17**; the merge went in at 10:32 and both shipped. A single check is not
> a check. Confirm the walkthrough no longer says `review in progress` before merging.

## The flow

```
feature branch ──PR──▶ main ──auto-deploy──▶ production
      ▲                  │
      │                  └── scanner branches FROM HERE, never from a feature branch
      └── short-lived; merged, not accumulated
```

Rules, in priority order:

1. **`main` is production.** If they disagree, that is the bug. Vercel auto-deploys every push to
   `main`, so merging a PR *is* the release — which is fine, because nothing reaches `main` except
   through a reviewed, CI-green PR (see the gate below).
2. **Nothing is pushed to `main` directly.** Enforced by the ruleset, not by discipline.
3. **The scanner branches from freshly-fetched `main`.** Its PRs are then a few dozen lines, which
   is what both CI and the reviewer can judge properly.
4. **Feature branches stay short.** 26 commits is how you end up with a PR nobody can review and a
   production deploy that bypasses the PR entirely.
5. **Deploying still needs the human word.** The gate makes `main` safe to merge into; it does not
   make merging automatic. See the note on the code word in `CLAUDE.md`. Because of rule 1, the word
   applies to the **merge** — there is no later step to hold back.

### Merging more than one PR

Worked out the hard way on 2026-09-18 with seven open at once.

- **Order by conflict, not by age.** Compute which PRs touch the same file first; the one that
  overlaps the most merges **last**, so a single branch absorbs the reconciliation instead of
  several. Two PRs sharing a file is one merge conflict; three PRs each sharing with a fourth is
  three.
- **Every `scanner/**` PR after the first needs `git merge origin/main`.**
  `scripts/dev/check-branch-base.mjs` sets `SCANNER_ALLOWANCE = 0`, so any movement of `main`
  fails the base check on the rest. Human branches get 40 and are unaffected. N scanner PRs cost
  N−1 re-merges, and that is by design — a scanner PR is supposed to be cut fresh.
- **Merge the customer-facing fix first**, alone, and verify it. If seven land together and
  something is wrong on thefarmflow.in, the diff you have to bisect is all seven.
- **Confirm each one actually deployed** rather than assuming — local `git log` drifts:

  ```bash
  curl -s "https://api.vercel.com/v6/deployments?limit=5&target=production" \
    -H "Authorization: Bearer $Vercel_token" | jq -r '.deployments[] | "\(.meta.githubCommitSha[0:8]) \(.state)"'
  ```

- Rollback is `vercel alias set <previous-deployment-id> www.thefarmflow.in`. Have the previous id
  in hand *before* merging, not after.

## The gate

**A structural gate IS available on this repo, and `CLAUDE.md` was wrong to say otherwise.**

That entry is about Vercel's `deploymentPolicy`, which is Pro-only and genuinely unavailable. But
the gate does not have to live at Vercel. **This repository is public**, so GitHub rulesets and
branch protection are free — and stopping bad code from reaching `main` is equivalent to stopping
it from reaching production, given that `main` auto-deploys.

### ⚠ Two GitHub identities, and only one of them can write

This wastes an afternoon if you do not know it. `git push` works; every `gh` write fails.

```
origin                            git@github.com:niksr4/farmflow.git   (SSH — niksr4's key)
gh auth status                    Logged in as NikKaoss                (HTTPS)
gh api repos/niksr4/farmflow      {"admin":false,"pull":true,"push":false,...}
```

So pushes succeed and `gh pr create` returns *"must be a collaborator"*, while ruleset writes
403 — which reads as a flaky permission problem rather than as two different accounts. The
same split the Vercel CLI has.

**Anything that writes through the GitHub API needs a niksr4 token**, or `gh auth login` as
niksr4. A classic PAT with `repo` covers pull requests; the ruleset additionally needs
`Administration: write` (fine-grained) or `admin:repo_hook`-level access on a classic token.

Apply the gate with:

```bash
# uses the gh login, which today is the wrong account
node scripts/dev/setup-main-ruleset.mjs

# the way that actually works
GITHUB_ADMIN_TOKEN=<niksr4 pat> node scripts/dev/setup-main-ruleset.mjs --apply
node scripts/dev/setup-main-ruleset.mjs --apply --token=<niksr4 pat>
```

It prints which account it is acting as before doing anything.

What it sets on `main`:

| Rule | Why |
|---|---|
| Require a pull request | Every change gets a diff, a CI run, and a CodeRabbit review before it is live |
| Required approvals: **0** | Solo maintainer — GitHub will not count a self-approval, and requiring one would make the branch unmergeable |
| Require status check `quality` | Lint → typecheck → unit tests → build → public e2e, all green before merge |
| Block force-push | `main` is production history; rewriting it rewrites what shipped |
| Block deletion | — |

Zero required approvals is not a weakened gate. The gate is **CI must pass and a PR must exist**;
the PR is what CodeRabbit reviews and what leaves a record. Requiring an approval nobody can give
would just push everyone back to force-pushing.

## Undoing it

```bash
gh api repos/niksr4/farmflow/rulesets --jq '.[] | "\(.id)  \(.name)"'
gh api repos/niksr4/farmflow/rulesets/<id> -X DELETE
```

Instant and total. Nothing about the ruleset touches deployments, so removing it cannot break
production — it only removes the requirement that changes arrive through a PR.
