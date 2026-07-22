# Scenario: A Day of Labour

Modules needed: `labor`, `picking`, `accounts` (plan: `core` or `enterprise`).
Role: `admin` for setup, `user` for day-to-day entry if a user account with
`labor` access exists on the tenant.

## Setup

- A dev tenant with at least one location and the default 80 activity codes
  (seeded automatically on provisioning — see `provision-tenant.ts`).

## Steps

1. **Morning** — open the Labour tab (`components/labor-deployment-tab.tsx`).
   Log a deployment: pick a real activity code (not a placeholder), assign a
   worker count, a location, a date of today.
2. Open the Attendance tab (`components/attendance-tab.tsx`) and mark
   attendance for the same day/location.
3. Open the Picking Log (`components/picking-log-tab.tsx`) if the estate
   picks that day — log kg picked, tie it to the same location/date.
4. Check the Accounts / balance sheet tab — does the labour cost show up as
   an expense for today, with the right amount (worker count × rate, or
   however the activity code prices it)?
5. **Next day** — go back and edit yesterday's labour entry (change the
   worker count). This is the "manager corrects a mistake after the fact"
   case from real estate operations.
   - Does the balance sheet / expense total update to reflect the edit, or
     does it silently keep the old number anywhere (cached dashboard tile,
     exported report, weekly digest preview)?
   - Is there any audit trail showing the entry was edited after the fact
     (`lib/server/audit-log.ts`)? Should there be, for a corrected payroll
     number?
6. **Field-realistic edge case** — log an entry with a worker count of 0, then
   one with an implausibly large worker count (e.g. 5000). Does validation
   catch either, or does it silently accept and skew the balance sheet?

## Reconcile

At the end: does the sum of individual labour entries for the day match what
the Accounts tab shows as today's labour expense, exactly, including after
the edit in step 5? If not, that's the finding — not "UI looks fine."
