# Workspace plan grants and IST dates

Super-admin can approve an access request with any active plan. The default remains the private **Trial Period** plan (14 days, or its configured duration). Other plans grant one calendar month without charging the customer. Plan options remain paginated on the server.

Approval offers optional start and expiry dates:

- Blank start: access begins after email verification.
- Selected start: access begins at **00:01 IST** on that date, provided the email is verified. If verification happens later, the period starts at verification.
- Non-trial expiry: blank uses one calendar month from the effective start; an explicit date overrides it. Trial duration stays configured on the plan.
- The selected expiry date includes **23:59:59.999 IST**. The stored deadline is the following midnight, exclusive. UI expiry labels display the last accessible minute, **11:59 pm IST**.

One calendar month clamps to the last day of the next month (31 January -> 28 February, or 29 February in a leap year). UTC instants are stored in PostgreSQL; admin timestamps and plan deadlines display in IST regardless of the device timezone.

Scheduled customers can verify their email and choose a password, but the workspace remains locked with its scheduled start shown. API checks, Supabase restrictive policies, and Edge Function source checks enforce the same schedule. The browser refreshes access at the start boundary and on focus; expiry locks access at the exact deadline.

Migration: `20261028210000_workspace_plan_grants.sql`. It adds schedule/grant metadata, generalizes the private assignment RPC, updates verification/payment activation and server customer pagination, and aligns existing timed deadlines through the end of their current IST expiry date. Replaying assignment or resending activation does not extend an existing grant. Only the service role can assign plans; the approval API requires super-admin and validates dates before creating a login or sending mail.

Checks:

```powershell
pnpm --filter @ai-receptionist/api exec tsx --test tests/planDates.test.ts tests/workspaceTrials.test.ts tests/accessRequestNotes.test.ts tests/adminPagination.test.ts
pnpm --filter @ai-receptionist/web test
pnpm -r typecheck
```

Email and database calls in the HTTP tests are mocked; they do not send real emails or create customer accounts. Database-function checks also cover activation before/after the selected start, verification later than the scheduled start, SQL/TypeScript month-end agreement, and assignment permissions.
