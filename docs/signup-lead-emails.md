# Signup lead follow-ups

In **Super admin → Signup leads**, support and super-admin roles can select **Send email**, review the recipient, subject and branded template in a drawer, then select **Send email now**. Opening the preview does not send anything. Read-only admins cannot preview or send.

The server chooses the template from the order's current state:

| Lead state | Email |
| --- | --- |
| Checkout started | Invitation to complete checkout |
| Checkout closed | Pick up where you left off |
| Payment failed | Retry guidance and assistance, including advice to check an existing bank debit first |

The browser cannot supply the recipient, email body, price or payment URL. If the stage changes after preview, sending is rejected until the preview is refreshed. Paid orders cannot receive checkout follow-ups. Content uses the existing HTML and plain-text email layout and escapes customer-supplied fields. Raw payment-provider errors are not included.

Live saved orders receive a private checkout-resume link valid for seven days. The link opens a real loading state while the saved order and Razorpay script load, then opens the payment modal directly once per visit. Cancellation shows **Retry payment** and **Switch plan**. Retrying uses the existing provider order; switching opens the normal checkout with contact details prefilled and requires the new checkout's password/consent again. Current prices and offers are rechecked for a changed plan.

Each send has its own token hash, so a later email does not break an earlier link. Old automatic-reminder links still work and use the same direct-payment screen. Leads without a live payment order or saved password, including dummy fixtures, also receive a private checkout link. After validation it opens checkout with contact details prefilled, a currently purchasable plan and current server-side prices. These leads must complete required fields before a payment order can be created. Existing-workspace purchases point back to the signed-in workspace.

The resume endpoint never returns password hashes. Saved payment amounts remain fixed on the server. Invalid, expired and already-paid links do not open payment. The token is removed from the address bar after a successful lookup. Browser payment-script errors offer retry and plan switching; the script has a 15-second load timeout. No artificial delay is added to the loading screen.

Claims are stored in PostgreSQL to block concurrent sends across API instances, with a one-minute cooldown after an accepted manual or automatic email. A failed manual send remains retryable. Claims interrupted before completion can be retried after five minutes. The per-admin endpoint limit is 30 send requests per hour. Successful manual sends suppress the order's pending automatic reminder; automatic sends also check manual-send claims before sending.

`checkout_followup_emails` records stage, requesting admin, status, token hash/expiry, SES message ID and timestamps. Customers have no direct access to this table. The lead list shows the last follow-up status/time; audit events record send outcomes. A success toast means SES accepted the message, not that the recipient's mailbox delivered it. API email logs show delivery-provider acceptance or failures.

Migration `20261028190000_checkout_followup_emails.sql` is applied to the connected database. No new environment variables are required; this uses the existing SES configuration. API tests mock SES and browser tests mock the send endpoint; no real emails were sent during implementation.
