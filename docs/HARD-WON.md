# Hard-won

Facts that cost real time to learn and would cost it again. **Not a backlog** — nothing here is
waiting to be done. It lives in the repo rather than in a task list because a task list should be
able to reach zero, and this cannot: it only grows, and that is correct.

Three rules for this file, learned from CLAUDE.md having been confidently wrong in bold about six
separate things:

1. **A measurement gets its date.** A number without one is a claim with no expiry.
2. **When you correct something here, grep for every other copy of the claim first.** A
   half-corrected document is worse than an uncorrected one, because the contradiction makes both
   halves untrustworthy.
3. **Prefer a command to a number.** `wc -l` cannot go stale; "4,974 lines" has been wrong twice.

---

## The one thing to know

**This codebase's bugs do not throw.** They return a confident wrong number onto a screen an estate
owner believes, and nothing is logged anywhere. An exception gets a Sentry issue and a fix; a
plausible figure gets reconciled against and built on.

Worked examples, all real: muster allocations that counted nowhere. Pepper revenue six routes could
not see. A CSP that silently dropped client-side Sentry for months. `isWeatherDone` accepting a null
longitude because `Number(null)` is `0`. A report applying its date period *after* a 2000-row cap,
so a fiscal-year export omitted most of the year under a header claiming the year.

So: weight effort towards wrong answers over crashes, and **ask "does any tenant have rows here?"
before ranking severity.** A red finding on `app/api/lots/[lotId]` was fixed and then reverted once
the data showed it 404s for every possible input. Dormant code and a live break look identical in a
scan and are one query apart.

---

## Guards: how they go vacuous

Most tests here scan source, because the defects are wrong answers rather than crashes. A vacuous
guard is the most expensive artefact in the repository: it is indistinguishable from a working one.

**Tamper-test every guard** — break the thing it protects, watch it go red. Then:

- ⚠ **Verify the tamper applied.** On 2026-10-08 four tamper attempts were silent no-ops: the
  `perl -0pi -e` pattern did not match, the file was untouched, the test passed, and that reads
  exactly like "the guard is fine". Assert the needle exists *and* the mutation landed before
  believing a green result.
- ⚠ **Use `cp` for the backup, never `git checkout <file>`** — that discards all uncommitted work in
  the file, and once threw away a whole batch of fixes.

### The failure modes, each of which has actually happened

| mode | instance |
|---|---|
| Asserts a mention, not a call | `toContain("helperName")` satisfied by the import line alone. Strip imports, match `helperName\s*\(` |
| Trips on its own documentation | **Fired four times.** The fix documents the forbidden pattern and the raw scan matches its own explanation, failing over correct code. **Strip comments before scanning** |
| Hand-kept file list | A list of two or three is how the next instance hides. Derive the set from the tree |
| Regex pinned to current names | A picker scan matched `<SelectItem>` and `loc.name`, missing `{l.name}` and `<option>{b.name}</option>` — the only two real offenders. Key on *shape*, not identifiers |
| Re-implements what it checks | A guard inlined its own copy of a scan's exemption rules; breaking the real scan changed nothing. Split the pure part out and point the test at that |
| Query matches the wrong element | `within(phone).getAllByText("Could not hold")` passed with the worker row deleted, because the totals card carries the same label. Scope to the row under test |
| **Predicate narrower than the rule** | 2026-10-22: a guard against "a sorter must not close over changing state" matched only `useState`/`useMemo` bindings, with a comment asserting plain consts cannot change without `items` rebuilding. They can — `processingRoute` is a plain const off a **prop** while `items` is `useState`. Reinstating the exact bug left it **green** |
| **Checks that a value is read, not that it is read in time** | A report guard required `buildRows` to read `period.start`. The Audit Log did, and was still wrong: it read the period, then applied it to an already-capped result set |

**The pattern behind most of these is one predicate checked at a coarser scope than the thing it
guards** — module instead of role, file instead of handler, first-match instead of every-branch,
load handler instead of save handler. Five instances in a single session, none found by re-reading.

### Known blind spots in existing guards

- `tests/today-is-the-estates-today.test.ts` scans `app` `components` `lib` `hooks` for `.ts`/`.tsx`
  only, so **`scripts/dev/*.mjs` is outside it entirely** — 74 harnesses, none covered.
- `check-rls-coverage.mjs` and `check-tenant-isolation.mjs` both filter `table_type='BASE TABLE'`,
  so **neither can ever see a view.** That is how `inventory_summary` came to be the one view of
  five without `security_invoker=true`. Proven on dev: a HoneyFarm-scoped non-bypass session read
  ₹7,47,976 from the base table and **₹20,12,900 — the whole platform — through the view**, while
  `schema:isolation` printed PASS.
- **78 tests read source files by path**, so moving code silently decouples them.
  `components/attendance-tab.tsx` is pinned by **12**. Always `rg -l '<path>' tests/` before moving
  a file.

---

## Traps in the code

### Database and tenancy

- **`sql` is never falsy.** It is `baseUrl ? neon(baseUrl) : createUnavailableClient()` — a stub that
  *throws* on use. So every `if (!sql)` is dead code. Gate on **`isDbConfigured`**, and on
  **`isAdminDbConfigured`** for DDL, because `adminSql` falls back to `sql` and can hand you the
  DML-only runtime role.
- **Raw `sql` outside `runTenantQuery` returns zero rows, not an error**, on any `tenant_id` table.
  Zero rows is a wrong answer, not a failure. Already hit benchmarks and ai-validate.
- **FK checks bypass RLS** — the root of the `location_id` class.
- `labour_assignments.total_cost` and `picking_records.total_cost` are **`GENERATED ALWAYS`**;
  naming them in an INSERT fails with `428C9`.
- **`processing_records` has a live recompute trigger**, so the DATABASE owns `dry_cherry_percent`,
  `fr_wp_percent`, `wp_dp_percent` and every `*_todate`. Nothing on the client may recompute it, and
  the save handler must **re-read the row** — `handleSaveUnguarded` does not call `setRecord`;
  `loadRecordForDate` does. The chain is
  `trg_processing_records_recompute` → `processing_records_recompute_trigger()` →
  `PERFORM recompute_processing_totals(...)`.
- ⚠ **A `CREATE OR REPLACE FUNCTION` inside that chain only changes FUTURE writes.** Migration 155's
  `UPDATE processing_records` sits *inside* the function body, so applying it replaced the function
  and rewrote **nothing**. Existing rows correct themselves when something next writes to that
  tenant/location/coffee type. Verified on prod 2026-10-23: four Estate Mock rows still read `0.00`
  after the apply.
- Column names that have been got wrong: `tenant_modules.module` (not `module_id`);
  `rainfall_records` stores `inches` and `cents` (there is no `amount_mm`);
  `processing_records.process_date`; `tenants.ui_preferences` is JSONB under key `'n'`;
  the actor on a `labour_assignments` change lives in `audit_logs.username`, not a `created_by`.
- `booked_revenue` callers that mean COFFEE must filter `source='sale'`.

### Permissions

- **`canDeleteModule` is byte-identical to `canWriteModule` for every module in
  `USER_MUTATION_MODULES`**, so neither is an admin gate and any writer passes. Use `isAdminRole`.
  This shipped live on a punch-delete route, and the guard "protecting" it distinguished the two
  functions — matching a string with no behaviour behind it.
- Roles are **`owner` | `admin` | `user`**. There is no `manager`, whatever a doc says.

### React and the browser

- **`useListControls` memoises without `sorters`**, behind an eslint-disable reading "sorters are
  stable config". True of 20 of 21 callers. A sorter that closes over changing state goes stale
  silently — resolve the value into the rows and sort on that field, so the dependence travels
  through `items`, which the memo does track.
- **`components/ui/button.tsx` sets no default `type`**, and HTML's default inside a form is
  `submit`. Wrapping anything in a `<form>` turns every untyped `<Button>` into a submit; a Cancel
  button has written records. Tamper-confirmed.
- **Radix `DropdownMenuRadioItem` closes the menu on select** unless `onSelect` preventDefaults.
  And **`DropdownMenu` is uncontrolled**, so opening it does not re-render the parent — removing a
  `useMemo` is not enough to refresh anything on open.
- **`FieldLabel` takes `label`, not children.**
- **`Blob.text()` strips a leading BOM** per spec, so assert bytes when checking for one.
- Use `useSingleFlightSubmit` for a form, never `useSingleFlight` — the latter *drops* the second
  call, and if it has not yet reached `preventDefault()` the browser performs a native submit and
  reloads the page mid-POST.
- **Never abort a mutation.** Aborting a POST does not roll back the server; the client reports
  failure for a write that committed, the user retries, and you get duplicates.

### Dates

**The estate's locale is IST. Every server is UTC. Nearly every date bug lives in that gap and none
of them throws.** Format wall clocks in SQL (`to_char(... AT TIME ZONE 'Asia/Kolkata')`) and send
them as strings; a formatted string cannot be re-offset by anybody.

Eight signatures of the one bug, each of which shipped:

1. `new Date().toISOString().slice(0,10)` — UTC, not IST
2. the same via `.split("T")`
3. `new Date().getMonth()` / `getDate()` / `getDay()` / `getHours()` — the host's calendar
4. the **variable** form of 3, split across two lines
5. `getDay()`/`getHours()` against estate-time windows
6. `toLocaleDateString`/`toLocaleTimeString` **with no `timeZone`** — a locale picks the FORMAT, not
   the offset, so `"en-IN"` does not make it IST
7. **date-fns**: `format`, `startOfWeek`, `isToday` all read a Date's LOCAL parts
8. `.getUTCFullYear` slipping past a guard anchored on `.getFullYear`

`isToday`/`isFuture`/`isPast` are **banned** — they take no reference date, so they are always the
host's opinion. Compare `YYYY-MM-DD` strings against `todayIso()`.

**Testing it:** a shape-only assertion (`/\d{1,2}:\d{2}/`) passes in every timezone, which is
exactly why it cannot see any of the above. Assert the clock, and re-render under more than one
`process.env.TZ`. CI sets no `TZ`, so a timezone-dependent test passes on the runner's accident.

The worked example: HoneyFarm's muster showed `04:31 – 13:18` for workers who punched
`08:01 – 16:48`. The screenshot came from a phone in Africa, 3½ hours behind IST. The ingest was
correct the whole time. Three endpoints read that column and only one used `to_char`.

---

## By design — do not "fix" these

- **Every `lib/server/agents/*` file uses `adminSql` (BYPASSRLS) deliberately.** So the half of the
  system that emails per-tenant numbers to customer inboxes has no DB-level isolation, and
  `schema:isolation` structurally cannot cover it. Swept: 41 statements, 31 touching tenant tables,
  **0 missing a predicate**.
- **`/api/benchmarks` is cross-tenant by design**, with `MIN_ESTATES_FOR_BENCHMARK=3` and 0 tenants
  qualifying. Raise k to 5 before it ever activates.
- `findConflictingUserByUsername` lets any estate admin test whether a username exists
  platform-wide.
- 22 of 82 write routes are rate-limited, and **login IS covered** — inside `authorize()` rather
  than the route.
- `/api/get-activity` ignores its own `locationId` query param entirely.
- Migration 90 is recorded as applied on prod **without** its DELETE having run: those "unused"
  activity codes are genuinely in use in real HoneyFarm data, so the DELETE correctly fails its FK
  constraint there. Don't force it.
- Lot traceability, `curing`, `quality`, `receivables`, `billing`, `compliance`, `documents`,
  `market-pricing`, `yield-forecast` are **built and used by nobody** — one dormant product *tier*,
  not eight features. Kept deliberately: all optional, all nullable, deleting it would cost a
  multi-table migration to reclaim no runtime cost. `plant-health` is the exception — Seshagiri has
  it via a `tenant_modules` override.

---

## Who actually uses this (prod, 30 days to 2026-10-22)

This decides design, and it is measured rather than imagined.

| persona | evidence |
|---|---|
| **Pure observer admin** | Medappa's `manoj` made **zero** writes in thirty days while his writer Gagan Rai made **1,515**. He owns the estate and never touches a form |
| **Correcting admin** | HoneyFarm's `admin`: 84 writes, 40 of them corrections (48%). Seshagiri's `adminna`: 123 / 33 (27%) |
| **Owner-operator** | Laxmi's `adminkuc`: 412 writes, 68 corrections, and **no user-role account on the tenant at all**. Same for greenvalley's `keziah`, who is alone. For these two the admin *is* the writer, so any "here is what your writer did" framing is noise |
| **Writers** | KAB123 291/12, Gagan Rai 1,515/45, nuthan 238/13 — high volume, low correction rate. They need today's work list, not a feed |

**Five of eleven users have no email at all**, which blocks password recovery and every digest, and
is why an in-app notifications pane is the only channel FarmFlow has for them.

Other shape facts that kill otherwise-good ideas: **0 of 69 locations have lat/long** (migration 114
gives points only, never polygons), so there is no map. **Only Seshagiri entered `area_acres`**
(20 of 22; everyone else 0), so anything per-acre works for exactly one tenant. **Only HoneyFarm has
processing history** (77 rows), so "vs last year" needs a designed empty state.

Whole-funnel conversion, ever: **7 signups → 2 provisioned → 1 surviving tenant → 1 login → 0
business records.** The single real inbound estate (Malabar Ridge, 27 May) was lost at email
verification.

---

## Infrastructure

- **Merging is not deploying.** `vercel.json` sets `git.deploymentEnabled.main = false`; production
  moves only via `pnpm go-live -- --yes`. The setting lives in `vercel.json`, **not** the project
  API — `PATCH /v9/projects/:id` returns 200 and changes nothing.
- **Both domains are aliased** (`www.thefarmflow.in` and the apex). Moving one leaves real visitors
  on the broken build.
- **Deploy from the primary checkout, not a linked worktree, and nobody knows why.** A 17:26 IST
  deploy from `farmflow-main` 500'd ~40 DB-backed routes while the same commit from the primary
  checkout was clean minutes later. Four explanations proposed, all four disproved. `go-live` now
  refuses to run from a linked worktree — refusing the condition, not the cause. If you find the
  cause, replace it.
- **The CI runner is pinned to `ubuntu-24.04` and has to be.** `ubuntu-latest` rolled to 26.04 on
  2026-10-19, Playwright could not install chromium there, and both jobs died at the browser-install
  step — failing the gated check on **all nine open pull requests at once.** It reads exactly like
  "my change broke CI". Same reasoning applies to pinning a third-party action to a tag, not `@main`.
- **CodeRabbit has never auto-reviewed this repo** and will not until it has 10 stars. Its own
  comment says so. A green `CodeRabbit` check reports that the integration ran, **not** that a
  review happened — on #68 the check read `pass` while its detail said "Review skipped", and a
  hand-triggered review then produced 5 findings. **A `Review rate limited` reply is a refusal, not
  a pass.** Findings live on three surfaces, and the review `body` is the one that has hidden them.
- `.github/workflows/coderabbit-retry.yml` runs on GitHub's infrastructure, so it works with the
  laptop shut. The cron says hourly; **GitHub does not honour that** on a low-activity repo —
  observed cadence is every five to six hours, so four or five reviews a day.
- **A `pull_request` workflow is taken from the BASE branch**, so it cannot run on the PR that adds
  it. An empty Checks tab there is the rule, not a fault.
- The **SSO wall** covers every URL except the custom domain, so a `--skip-domain` build cannot be
  browsed. Smoke it with the `x-vercel-protection-bypass` header instead: a healthy build answers
  200 on pages and **401** on every API — 401 is the gate working; 5xx is the failure.
- ⚠ **`schema_migrations` says a file RAN, not that its effect survived.** Sort numerically when
  reading it — `"100-…" < "87-…"` as strings hides the newest files mid-list. A version string is
  **not** a path: `102-biometric-attendance.sql` is in the ledger and is not a file.
- A fresh database does **not** run migrations 1–87 (`BOOTSTRAP_CUTOFF`); they are recorded without
  executing. The migration runner has **no `--only` flag** — it applies everything pending in
  whatever `scripts/` the working tree holds.

---

## Local environment

- `scripts/dev/*.mjs` cannot resolve `node_modules` from outside the repo — run them from the root.
- `node -e` from the repo root **shifts `process.argv` by one**; use `slice(-2)`.
- `pg_get_functiondef` throws on aggregates — filter `prokind='f'`.
- A SQL comment inside a tagged template literal **must not contain a backtick**, and neither may a
  test's assertion message.
- `timeout` does not exist on this mac. There is no `pyyaml`; `js-yaml` lives under
  `node_modules/.pnpm`.
- `git commit -m` and `gh pr create --body` break on apostrophes — use `-F` / `--body-file`.
- `gh pr merge` refuses while GitHub is recomputing mergeability right after another merge lands
  (`mergeable: UNKNOWN`). Wait a few seconds and retry.
- **Never let a connection string reach the terminal.** It has leaked five times, most recently from
  a *backgrounded* job completing and bash echoing its assignment line.
