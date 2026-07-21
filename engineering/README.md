# Engineering

This folder is not part of the FarmFlow product. Nothing here is imported by
`app/`, `components/`, or `lib/`, and none of it ships to production. It's the
toolkit used to drive Claude Code as an external QA/audit engineer against the
FarmFlow codebase and running app.

If you're looking for product docs (runbooks, compliance, module specs), see
[`docs/`](../docs/) instead. Rough split:

- `docs/` — describes FarmFlow as it exists (runbooks, DPDP, module specs, the
  in-app agents in `docs/agents/` that run as product features/cron jobs).
- `engineering/` — prompts and scenarios you hand to Claude Code to go
  *inspect* FarmFlow from the outside. Nothing in here is a product feature.

## Layout

- `prompts/` — reusable prompt text for a specific kind of review (QA persona
  sweep, architecture audit, security review, etc). Paste into Claude Code, or
  point Claude Code at the file and say "run this."
- `scenarios/` — scripted, narrative estate scenarios ("heavy rain interrupts
  picking, manager edits yesterday's labour") for exercising a workflow
  end-to-end rather than a single feature in isolation.
- `playbooks/` — step-by-step operational sequences (release checklist,
  onboarding a new validation estate) that combine prompts/scenarios with
  actual commands.
- `checklists/` — short pass/fail lists for a specific gate (e.g. "ready to
  onboard estate #4").
- `audits/` — dated output. When you run a prompt or scenario against the
  current codebase, save the findings here as `YYYY-MM-DD-<topic>.md` so
  there's a trail of what was checked and when, and whether it got fixed.

## Conventions

- Prompts and scenarios should name real FarmFlow concepts (actual module IDs
  from `lib/modules.ts`, actual roles — `owner` / `manager` / `user`, actual
  tab names) rather than invented ones, so they stay directly runnable.
- Nothing here should assume it has write access to prod data. Scenarios
  should either run against a dev tenant or say explicitly which environment
  they need (`DATABASE_URL_DEV` per [CLAUDE.md](../CLAUDE.md)).
- When a scenario or audit surfaces a real bug, file it the normal way (fix
  the code / open an issue) — don't let the finding live only as prose in
  `audits/`.
