# Calling minutes and workspace purchases

Customer Plans now reads the assigned plan, monthly usage and extra minutes from the API. It no longer uses a hardcoded Growth plan or localStorage credits. All receptionists share one workspace pool; choosing a different receptionist does not change the balance.

## Rules

- Top-ups expire at the current plan's existing expiry and do not extend access.
- A plan change, including restarting the same plan, takes effect after verified payment and starts a new calendar month. Existing unused minutes and top-ups are replaced. No setup fee or prorated credit applies to existing-workspace purchases. The confirmation dialog explains this before payment.
- Monthly deadlines use the existing IST end-of-day rules.
- Usage retains the existing billing pulses: unconnected calls use zero; connected calls shorter than 25 seconds use 0.5 minutes; 25 seconds and longer round up to whole minutes.
- Completed/mirrored phone calls update a server-only ledger keyed by call ID. Duplicate ingestion updates the same charge. Transcript/bot deletion does not erase historical workspace consumption.
- Extra minutes are credited only after the existing Razorpay signature, amount, currency and captured-payment verification. The credit and fulfilled order are committed together under database locks.
- A paid top-up for an expired/replaced period goes to **Needs review** without granting minutes to a different period. Concurrent plan purchases that target an already replaced period also go to review. Administrators must arrange a refund or deliberate resolution; refunds are not automatic.

## Catalogue configuration

The existing super-admin Plans & pricing feature values configure each plan's 500-minute pack price:

- `topup_500_minutes`: INR price in rupees, e.g. `4000` means ₹4,000 for 500 minutes.
- `topup_500_minutes_usd`: optional USD price in dollars, e.g. `48.25`. Add this comparison feature in Plans & pricing to configure international packs.

Use plain positive numbers with up to two decimal places. Missing/invalid prices disable online top-ups; prices and purchased minutes submitted by the browser are ignored. Customers can buy 1–10 packs at once in their current plan currency. Trial and custom/unlimited plans do not sell these packs.

## History and enforcement

Customers have server-paginated purchase history (10 per page). Super-admin Revenue → Purchase history has server-side purchase-type and payment-status filters (25 per page), payment references, top-up quantities, expiry and review reasons. Revenue includes all paid purchases; signup conversion and signup leads exclude workspace repeat purchases.

New outbound calls and campaign dispatches check the remaining balance. Exhaustion pauses campaigns without automatically restarting them; the customer can resume them from Calls after purchasing. Inbound lines switch to the existing capacity/hangup workflow after exhaustion and are reconciled after payment. Capacity restoration rechecks the balance rather than blindly reopening calls on a timer.

**Provider limitation:** usage is reconciled as Dograh calls are mirrored. Already connected/concurrent calls can finish and may exceed the last remaining minutes before ingestion. The time-remaining tool requests an early wrap-up, but this is not an exact provider-side hard cutoff or prepaid reservation system. Existing workflows should be resynchronised to receive the new initial-context exhaustion instruction. Test inbound switching and real payment callbacks in staging before release.

## Migration and checks

`20261029090000_workspace_minute_purchases.sql` adds purchase metadata, protected credit/usage ledgers, quota snapshots and atomic top-up fulfilment. Apply it before deploying the updated API to another environment.

Run the rollback-only SQL integration check with `pnpm --filter @ai-receptionist/api exec tsx scripts/verify-minute-billing.ts`. It requires the existing `SUPABASE_DB_URL`; it never sends emails or makes payments, and rolls back both fixtures and any test schema changes. Focused API tests cover price tampering, expired top-ups, owner isolation, billing and signup conversion.
