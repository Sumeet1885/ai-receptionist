# Workspace trials

Apply `supabase/migrations/20261028160000_workspace_trials.sql` after the earlier billing migrations, then deploy the API, web and admin apps together. If Supabase Edge Functions are deployed, redeploy `chat-reply` and `analyze-lead` too. No new environment variables are required; payments use the existing Razorpay configuration and captured-payment webhook.

In the admin console, Plans & pricing has a **Trial plan (admin only)** switch and a required duration of 1-365 whole days. The migration creates **Trial Period** with 7 days. Trial plans are excluded from public pricing and checkout.

Approving an access request defaults to Trial Period; the administrator can select another active trial plan. The selected plan is saved on the request. The duration is copied to the workspace, so editing the plan later does not change an assigned trial. Creation and trial assignment happen in one database transaction; an activation resend can recover an interrupted assignment without restarting the clock.

The trial starts when Supabase confirms the customer's email, including an already-confirmed customer during recovered provisioning. Resending activation or verifying again does not restart it. Before verification, the existing account activation gates still apply.

At expiry, the signed-in app displays only paid plan selection, payment and sign-out. Direct database access is restricted by RLS; workspace APIs and public receptionist endpoints also check access. Live voice connections recheck access every 10 seconds; outbound campaigns pause before starting another call. Already-connected external telephone calls are controlled by the telephony provider and are not forcibly disconnected by this change.

The authenticated payment endpoint derives the customer from the access token and amounts from the saved plan. It never accepts a customer ID or price from the browser. Only the existing Razorpay verification/captured-webhook flow activates the workspace. Activation retains the account, agents and data, clears its trial dates and grants one calendar month from the confirmed payment. Repeated processing of the same order does not extend access. Admin suspension remains effective after payment.

Existing workspaces are preserved; this migration does not retroactively expire legacy accounts without an access expiry. Admin Customers shows **Payment required** for expired workspaces and the plan period end in its detail drawer.

Checks: `pnpm run typecheck`, `pnpm --filter @ai-receptionist/api exec tsx --test tests/workspaceTrials.test.ts tests/billing.test.ts tests/accountStage.test.ts tests/support.test.ts`. The full test suite has a pre-existing `leadQueryClient` assertion unrelated to trials.
