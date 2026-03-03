# Product Validation Metrics + PostHog Funnel Runbook

## Goal
Define a stable scorecard to validate adoption and value delivery without adding new product scope.

## Canonical Funnel Events
These are now the canonical events for activation tracking:

| Funnel step | Event name | Source |
| --- | --- | --- |
| Signup request submitted | `funnel_signup_submitted` | `/signup` form and landing-page request-access form |
| Login success | `funnel_login_succeeded` | login flow after authenticated session resolution |
| First successful import | `funnel_first_import_committed` | import commit success in settings import page |
| First dashboard insight viewed | `funnel_first_dashboard_insight_viewed` | dashboard intelligence brief load with actionable insight |

Supporting quality signals:

| Purpose | Event name |
| --- | --- |
| Import validation passed | `import_validation_passed` |
| Import validation failed | `import_validation_failed` |
| Import commit succeeded | `import_commit_succeeded` |
| Import commit failed | `import_commit_failed` |

## Product Validation Scorecard
Track these every week (Monday to Sunday window):

1. `Signup Volume`: count of `funnel_signup_submitted`.
2. `Signup -> Login Conversion (7d)`: funnel conversion from `funnel_signup_submitted` to `funnel_login_succeeded` within 7 days.
3. `Login -> First Import Conversion (14d)`: funnel conversion from `funnel_login_succeeded` to `funnel_first_import_committed` within 14 days.
4. `Import -> First Insight Conversion (7d)`: funnel conversion from `funnel_first_import_committed` to `funnel_first_dashboard_insight_viewed` within 7 days.
5. `Signup -> First Value Time`: median time from `funnel_signup_submitted` to `funnel_first_dashboard_insight_viewed`.
6. `Weekly Active Tenants`: unique `tenant_id` across `funnel_login_succeeded` (and optionally `$pageview` for engagement context).
7. `Import Success Rate`: `import_commit_succeeded / (import_commit_succeeded + import_commit_failed)`.
8. `Validation Friction`: median `error_count` on `import_validation_failed` and top failing datasets.

## Target Bands
Use these initial bands until 4 weeks of baseline data is available:

1. Signup -> Login conversion: `>= 60%`.
2. Login -> First Import conversion: `>= 50%`.
3. Import -> First Insight conversion: `>= 70%`.
4. Signup -> First Value median: `<= 3 days`.
5. Import success rate: `>= 90%`.

## Weekly Review Cadence
Run a 45-minute validation review every Monday:

1. Pull the last completed week in PostHog.
2. Review funnel conversion and median time-to-value.
3. Segment by `source`, `role`, and `dataset` to isolate drop-off points.
4. Review import failure and validation friction events.
5. Decide top 3 de-risking actions for the week (copy, onboarding SOP, data quality guidance, docs clarification).
6. Assign owners and expected metric movement for each action.
7. Re-check movement in the next Monday review.

## PostHog Setup Checklist
1. Create one Funnel insight named `Activation Funnel` with the 4 canonical events in order.
2. Set conversion windows to `7d/14d/7d` as defined above (or a single 14-day window if you want one simple chart).
3. Create Trends insights for each scorecard metric event.
4. Create a Dashboard named `Product Validation` containing funnel, trends, and median time-to-value.
5. Pin weekly date filter defaults and save role/source breakdowns.

## Guardrails
1. Keep event names stable; add new properties rather than renaming events.
2. Avoid sending sensitive free-text fields to PostHog.
3. Use `tenant_id` and `role` consistently for segmentation.
4. If a step is instrumented in multiple surfaces, keep the event name identical and segment with `source`.
