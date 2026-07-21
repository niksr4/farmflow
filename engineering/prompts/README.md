# Prompts

Reusable prompt text for a specific kind of review. These are meant to be
handed to Claude Code verbatim (paste the body, or say "run
engineering/prompts/qa-persona-sweep.md against the dashboard").

Each prompt should:
- Name a real persona/role that actually exists in FarmFlow's role model
  (`owner`, `manager`, `user` — see `lib/roles.ts` / `lib/permissions.ts`),
  not an invented job title that has no corresponding access level.
- Say what to do with findings (usually: write to
  `engineering/audits/YYYY-MM-DD-<topic>.md`, then fix anything that's an
  actual bug rather than just describing it).
- Assume a dev tenant, not prod data.

## Index

- `qa-persona-sweep.md` — drive the dashboard as owner/manager/user and try to
  break each workflow.
