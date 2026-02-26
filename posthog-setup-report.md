<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into FarmFlow — a Next.js 16.1.6 App Router coffee estate operations platform. The project already had `posthog-js` and `posthog-node` installed, `instrumentation-client.ts` configured for client-side initialization with session recording and error tracking, Next.js rewrites for `/ingest` reverse proxy, and `lib/posthog-server.ts` for server-side events.

The wizard extended the existing integration by adding new event captures across 6 files: 4 server-side API routes (`app/api/billing/invoices/route.ts`, `app/api/mfa/verify/route.ts`, `app/api/mfa/disable/route.ts`, `app/api/privacy/accept/route.ts`, `app/api/sales/route.ts`) and 2 client-side files (`app/settings/reset-password/page.tsx`, `components/inventory-system.tsx`). Environment variables `POSTHOG_API_KEY` and `POSTHOG_HOST` were also added to `.env.local` alongside the existing `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. All events use a consistent `{tenantId}:{username}` distinct ID pattern for user correlation across client and server.

## Events Added

| Event Name | Description | File |
|---|---|---|
| `user_signed_in` | User successfully authenticated (existing) | `components/login-page.tsx` |
| `user_signed_out` | User signed out from the estate dashboard workspace | `components/inventory-system.tsx` |
| `access_requested` | Estate manager submitted a new access/onboarding request (existing) | `app/signup/page.tsx` |
| `sale_recorded` | A new coffee sale entry was saved (existing) | `components/sales-tab.tsx` |
| `sale_updated` | An existing coffee sale record was edited and saved (existing) | `components/sales-tab.tsx` |
| `sale_deleted` | A coffee sale record was deleted by admin/owner (existing) | `components/sales-tab.tsx` |
| `dispatch_recorded` | A new dispatch entry was saved (existing) | `components/dispatch-tab.tsx` |
| `dispatch_updated` | An existing dispatch record was edited and saved (existing) | `components/dispatch-tab.tsx` |
| `dispatch_deleted` | A dispatch record was deleted by admin/owner (existing) | `components/dispatch-tab.tsx` |
| `sales_csv_exported` | User exported sales records to CSV (existing) | `components/sales-tab.tsx` |
| `dispatch_csv_exported` | User exported dispatch records to CSV (existing) | `components/dispatch-tab.tsx` |
| `sales_created_server` | Server-side: sale record saved via POST /api/sales | `app/api/sales/route.ts` |
| `invoice_created_server` | Server-side: invoice created via POST /api/billing/invoices | `app/api/billing/invoices/route.ts` |
| `mfa_enabled` | Server-side: user verified TOTP and enabled MFA | `app/api/mfa/verify/route.ts` |
| `mfa_disabled` | Server-side: user disabled MFA on their account | `app/api/mfa/disable/route.ts` |
| `password_changed` | User successfully rotated their account password | `app/settings/reset-password/page.tsx` |
| `privacy_notice_accepted` | Server-side: user accepted the DPDP privacy notice | `app/api/privacy/accept/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- 📊 **[Analytics basics dashboard](https://eu.posthog.com/project/132362/dashboard/542357)** — all 5 insights in one place

### Insights

1. **[User Sign-ins & Access Requests](https://eu.posthog.com/project/132362/insights/v88y9nZd)** — Daily sign-ins vs new access requests over the last 30 days
2. **[Onboarding Funnel: Access Request → Sign In](https://eu.posthog.com/project/132362/insights/Ggw8C5g7)** — 90-day conversion funnel from estate access request to first sign-in (key acquisition metric)
3. **[Operations Activity: Sales, Dispatches & Invoices](https://eu.posthog.com/project/132362/insights/kWlzo3DT)** — Daily core operations events to track estate engagement health
4. **[Sales Workflow Funnel: Sign In → Record Sale → Export](https://eu.posthog.com/project/132362/insights/wyIbplyG)** — Completion funnel for the primary sales workflow
5. **[Account Security Events: Sign Outs, Passwords & MFA](https://eu.posthog.com/project/132362/insights/RQbTP38Y)** — Weekly security activity for compliance monitoring

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
