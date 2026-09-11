# Scanner policy change: branch from `main`, not from whatever is checked out

Paste the block below to the `farmflow-daily-code-scan` task (and to the
`farmflow-scan-fresh-retry` duplicate, which carries the same policy).

This is the second policy change. The first — `docs/SCANNER-POLICY-CHANGE.md`, 2026-08-26 — stopped
the scanner pushing straight to `main`, and it worked: every scan since has opened a pull request.
This one fixes what that change exposed rather than caused.

---

## What went wrong, measured on 2026-09-11

The scanner creates its branch from whatever the working copy happens to be on. For four days
running that was `feature/biometric-attendance`, which was 26 commits ahead of `main`. So:

| PR | Branch | Diff against `main` | What the scanner actually changed |
|---|---|---|---|
| #5 | `scanner/2026-09-09` | +160 / −78 | ~160 lines |
| #6 | `scanner/2026-09-10` | +79 / −38 | ~79 lines |
| #7 | `scanner/2026-09-10-feature-biometric-attendance` | **+8,587 / −1,055** | a few dozen lines |
| #8 | `scanner/2026-09-11-feature-biometric-attendance` | **+8,617 / −1,071** | a few dozen lines |

Two consequences, both real:

1. **The review lands on the wrong code.** Greptile reviewed PR #8 and opened its summary with
   *"This PR is substantially broader than its title"*, then scored it 0/5 and declared it unsafe
   to merge. It was judging eight thousand lines of unrelated payroll work. The findings were
   genuinely good — six real defects — but they arrived attached to a PR about error messages, and
   the verdict could not be acted on as written.

2. **None of it merged, so none of it shipped.** All four PRs were still open on 2026-09-11.
   `app/api/ai-analysis/route.ts` and `app/api/ai-proactive-insights/route.ts` were still leaking
   raw `error.message` in production — fixed by the scanner in PR #5 on 2026-09-09, sitting
   unmerged for two days. **A scanner whose output nothing reads costs money and delivers nothing.**

---

## Paste this to the scanner

> Change your task file as follows. These are additions to the 2026-08-26 policy, not replacements
> — everything in that change still stands.
>
> **1. Always branch from freshly-fetched `origin/main`, never from the current checkout.**
> Before creating your branch, do:
> ```
> git fetch origin main
> git switch -c scanner/$(date +%Y-%m-%d) origin/main
> ```
> Never `git switch -c` from whatever HEAD happens to be. If the working copy is on a feature
> branch — it usually is — branching from it puts that entire branch inside your PR's diff.
> Reason: on 2026-09-11 this made a forty-line fix arrive as an 8,617-line pull request. CI still
> passed and the PR was still correct, but the automated reviewer spent its budget on someone
> else's feature and returned a verdict about that instead of about your change.
>
> **2. Scan the files as they are on `origin/main`, for the same reason.**
> Your sweep position (`files 78-137/935`) should be a position in `main`, not in whatever branch
> was checked out. Otherwise the file list shifts under you between runs and the ratchet counts
> stop meaning anything.
>
> **3. If your PR's diff is more than ~400 lines, stop and say so in the digest instead of opening
> it.** A scanner PR is a handful of small, self-contained fixes; anything that size means the base
> branch is wrong. Report the number and which branch you based on. Do not open the PR.
> Reason: this is the check that would have caught the above on day one rather than on day four.
> A number you print every run is a number somebody eventually reads.
>
> **4. In every digest, report whether your previous PRs are still open.**
> List them with their age. Four unmerged PRs accumulated without anything surfacing that fact,
> and the fixes inside them were not in production while the digest each day reported them as
> done. "Filed" is not "shipped", and only one of those is worth reporting as an outcome.
>
> **5. `main` is now gated (2026-09-11).** It requires a pull request and a green `quality` check
> — see `docs/RELEASE-FLOW.md`. This does not change what you do: you already open PRs. It means a
> PR with failing CI can no longer be merged by anyone, including by mistake.

---

## Why the first policy change did not cover this

It was written to stop the scanner writing to production unreviewed, and it did exactly that. The
failure it left behind is the opposite shape: work that is reviewed but never lands. Both come from
the same root — **`main` was not treated as production** — which is what `docs/RELEASE-FLOW.md`
addresses directly.
