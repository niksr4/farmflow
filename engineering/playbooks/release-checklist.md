# Release Checklist

For a change worth gating rather than letting `main` auto-deploy straight to
prod (see [CLAUDE.md → Release process](../../CLAUDE.md#release-process) for
why there's no platform-level gate and what the staged-deploy workaround is).

## Before building

- [ ] `pnpm lint && pnpm test && pnpm build` clean locally.
- [ ] If the change touches a workflow covered by a scenario in
      `engineering/scenarios/`, run that scenario against a dev tenant and
      note the result in `engineering/audits/`.
- [ ] If the change touches auth, modules, or tenant data access, run the
      relevant suite from `docs/e2e-regression.md`
      (`pnpm test:e2e:auth`, `pnpm test:regression:strict`).

## Staged deploy

```bash
vercel --prod --skip-domain
```

- [ ] `vercel inspect <deployment-url>` — confirm it built clean.
- [ ] `vercel logs --deployment <deployment-url> --level error` — no errors
      on cold start.
- [ ] Click through the unique deployment URL directly (it's genuinely
      public, no SSO wall) and re-check the specific thing that changed.

## Promote

```bash
vercel alias set <deployment-id> www.thefarmflow.in
```

- [ ] Watch `pg_stat_activity` / error logs for a few minutes after
      promoting, especially for anything touching RLS
      (`app_runtime` connection) or billing.

## If something's wrong

```bash
vercel alias set <previous-known-good-deployment-id> www.thefarmflow.in
```

or `vercel rollback`. Do not touch the domain's `gitBranch` binding to try to
gate this — see the explicit warning in CLAUDE.md, it caused a real outage
once.
