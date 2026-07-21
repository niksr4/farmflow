# QA Persona Sweep

Drive the FarmFlow dashboard as a real user would, looking for breakage —
not just "does it look right."

## Setup

- Target a dev tenant (`DATABASE_URL_DEV`), never prod.
- Confirm which role you're testing. FarmFlow's actual roles are
  `owner | admin | user` (`lib/permissions.ts`) — there is no "accountant" or
  "field supervisor" role in the code, so test as one of the three real ones:
  - `admin` — the tenant's estate owner/top-level user. Full module access
    within their plan, can manage users and locations.
  - `user` — estate staff. Subject to per-user module exceptions; always
    blocked from `balance-sheet` regardless of plan (this is a hard rule, not
    a bug if you see it).
  - `owner` — platform owner. Bypasses all module checks by design — useful
    for confirming a restriction is plan/role-driven rather than broken, not
    useful for finding access-control bugs (owner will never hit them).
- Pick a plan tier to match (`basic | core | enterprise`, see
  `lib/modules.ts`) so the modules you're testing are actually enabled.

## For each page/tab you touch, ask

"What would this person actually click next?" — then try to break it:

- Submit the form with required fields blank.
- Submit it twice in a row (double-click / duplicate submission).
- Fill it out, hit browser back, then forward — does the draft survive or
  silently vanish?
- Refresh mid-save.
- Edit a record that's already a few days/weeks old — does the UI make that
  obviously different from creating a new one?
- Try it at mobile viewport width (this is a PWA used in the field —
  `docs/mobile-pwa-rollout.md` has the install/offline context).
- Try it keyboard-only.
- Enter something a suspicious/malicious user would try (script tags in free
  text fields, huge numbers in quantity fields, negative stock).

## Where to look

Cycle through modules relevant to the plan you picked (full list in
`lib/modules.ts`): `inventory`, `transactions`, `accounts`, `balance-sheet`,
`processing`, `dispatch`, `sales`, `other-sales`, `labor`, `picking`,
`season`, `journal`, `rainfall`, `weather`, `news`, `ai-analysis`, plus
enterprise-only `quality`, `curing`, `receivables`, `billing`, `documents`,
`compliance`, `market-pricing`, `plant-health`.

## Output

For each issue found, write one entry to
`engineering/audits/YYYY-MM-DD-qa-persona-sweep.md`:

```
### <page/tab> — <one-line summary>
Role/plan: <admin|user, basic|core|enterprise>
Repro: <exact steps>
Expected: <what should happen>
Actual: <what happened>
Severity: <blocks a real workflow | confusing but recoverable | cosmetic>
```

Anything that's a clear bug (not a UX judgment call) — fix it directly rather
than only recording it, and note the fix in the same entry.
