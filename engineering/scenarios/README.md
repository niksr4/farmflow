# Scenarios

Narrative, multi-step estate scenarios — exercising a real workflow across
several tabs/modules the way an estate actually operates, rather than testing
one feature in isolation. This is where you catch the bugs that only show up
at the seams between features (labour entry affecting the balance sheet,
dispatch quantities constraining a sale, an edited record not propagating).

Each scenario should:
- Reference real tabs/components, not invented ones (see
  `components/*-tab.tsx` for what actually exists).
- End with a concrete, checkable "did it reconcile" question — not just
  "does it look fine."
- Note which modules/plan it needs (`lib/modules.ts`).

## Index

- `labour-day.md` — a normal day of labour deployment + attendance, plus the
  edit-yesterday's-entry edge case.
- `dispatch-to-sale.md` — coffee moves from processing output through
  dispatch into a sale, checking quantities stay consistent end to end.

## Running one

Point Claude Code (optionally with browser/Playwright MCP access) at the
scenario file and a running dev server (`pnpm dev` against
`DATABASE_URL_DEV`), and ask it to execute the steps and report where the
actual behavior diverges from the expected outcome. Log findings the same way
as prompts — `engineering/audits/YYYY-MM-DD-<scenario-name>.md`.
