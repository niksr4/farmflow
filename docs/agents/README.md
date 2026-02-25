# Agent Framework (FarmFlow)

This repo now includes three internal agents designed to be **human-approved** and safe for existing tenant data.

## What Is Vercel AI SDK?

Vercel AI SDK is the `ai` package you already have installed.  
It standardizes LLM calls (`generateText`, `generateObject`, streaming) across providers.

In this implementation:
- Rule-heavy logic (integrity checks, clustering) is deterministic SQL/TypeScript.
- AI is optional and used only for summarization in the log anomaly daily brief.

## Agent B: Schema + Migration Assistant

Purpose:
- Watch schema-related repo changes.
- Flag destructive/idempotency risks.
- Generate safety-check SQL and rollback templates.

Run:
```bash
pnpm agent:schema
pnpm agent:schema:staged
```

Outputs:
- `docs/agents/schema-migration-report.md`
- `scripts/generated/schema-safety-check.sql`
- `scripts/generated/schema-rollback-template.sql`

Important:
- It **never executes** migrations.
- Use generated files for review + manual Neon execution only.

## Agent C: Log Anomaly Agent

Purpose:
- Scan last 48h of error/security events.
- Cluster similar errors.
- Highlight what is new since yesterday.
- Suggest likely causes + impacted endpoints.

Cron endpoint:
- `GET /api/cron/log-anomalies` (Vercel Cron)
- `POST /api/cron/log-anomalies` (manual/test)
- Auth: `Authorization: Bearer $CRON_SECRET`

Admin read endpoint:
- `GET /api/admin/log-anomaly-brief`

Optional external ingest endpoint:
- `POST /api/ops/error-ingest`
- Auth: `x-agent-token: $LOG_INGEST_TOKEN` (or `Authorization: Bearer ...`)

### Optional AI brief (Vercel AI SDK)

If one of these is configured, the anomaly agent adds an AI daily brief:
- `OPENAI_API_KEY` (model default: `gpt-4o-mini`)
- `GROQ_API_KEY` (model default: `llama-3.3-70b-versatile`)

Optional model overrides:
- `AGENT_OPENAI_MODEL`
- `AGENT_GROQ_MODEL`

## Agent D: Data Integrity Agent

Purpose:
- Nightly checks for:
  - negative inventory
  - processed < sold (30-day window)
  - dispatch received > dispatched estimate
  - yield/float outlier spikes
- Maintains an automatic exceptions list.

Cron endpoint:
- `GET /api/cron/data-integrity` (Vercel Cron)
- `POST /api/cron/data-integrity` (manual/test)
- Auth: `Authorization: Bearer $CRON_SECRET`
- Optional body: `{ "tenantId": "<uuid>", "dryRun": true }`

Admin read endpoint:
- `GET /api/admin/data-integrity-exceptions?status=open&limit=200`

## Database Setup

Run this once in Neon SQL Editor:
- `scripts/54-agent-ops.sql`

This migration is additive only (new tables/indexes), no destructive changes.

## Recommended Scheduler

Suggested Vercel Cron jobs:
1. `0 2 * * *` -> `/api/cron/data-integrity`
2. `0 8 * * *` -> `/api/cron/log-anomalies`
3. `30 2 * * *` -> `/api/cron/retention` (privacy + import job cleanup)

All should send:
- Header `Authorization: Bearer $CRON_SECRET`
- This repo includes [vercel.json](/Users/nikhilchengappa/FarmFlow/farmflow/farmflow/vercel.json) with these schedules.

Optional retention controls:
- `IMPORT_JOB_RETENTION_DAYS` (default `30`)
- `IMPORT_JOB_CSV_RETENTION_DAYS` (default `7`)

## Email Alerts

Agents can email you when issues arise:
- Data integrity agent: new or escalated exceptions.
- Log anomaly agent: new clusters since yesterday or critical ongoing clusters.

Required env vars for email delivery:
- `ALERT_EMAIL_TO` (comma-separated allowed; e.g. `nikchengappa@gmail.com`)
- `ALERT_EMAIL_FROM` (e.g. `FarmFlow Alerts <onboarding@resend.dev>`)
- `RESEND_API_KEY`

Email sending is non-blocking: if email fails, agent runs still complete and findings remain stored.
