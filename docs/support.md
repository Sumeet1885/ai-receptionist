# Customer support

The support flow follows own-crm's guest/customer ticket model, adapted to this project's Supabase service and admin sessions.

## Pages

- A floating Support button opens a compact drawer on the product pages, including landing, authentication, onboarding, pricing and checkout. The signed-in user menu opens the customer's support tickets. Public chat embeds do not show the product support launcher.
- `/contact-support`: compatibility link that opens the contact drawer over the home page.
- `/contact-support/ticket#token=...`: opens a private guest conversation in the drawer. The initial link goes only to the submitted email address, never in the submission response. The token is removed from the address bar after opening.
- `/support`: compatibility link that opens the signed-in customer's tickets in the drawer; new requests, replies, close and reopen remain available.
- `/super-admin/support`: admin inbox, status/priority/category filters, subject/email search, unread state, replies, internal notes and settings.

The landing footer and app navigation link to support. Support remains accessible to customers still completing account setup.

Privacy and terms pages are available at `/privacy` and `/terms`, linked from footers, the user menu and checkout. Company attribution and shared support contacts match own-crm; the policy text describes this product's calling, chat, calendar and billing features.

## Database setup

Apply `supabase/migrations/20261027190000_support_tickets.sql` before using support. It creates the tables, legacy private `support-attachments` bucket, atomic ticket/message functions and a durable attachment deletion queue. New attachments use AWS S3; existing Supabase attachments remain readable and are cleaned up by the same retention process.

```powershell
pnpm exec supabase login
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

Review the dry run; apply to the intended linked project. Restart the API after applying the migration. The API uses the existing Supabase service credential, SES sender/role and Turnstile settings. Public forms require Turnstile outside development, as with access requests.

S3 follows own-crm's configuration names: `S3_BUCKET_NAME`, `AWS_S3_ROLE_ARN`, and `AWS_REGION` (optionally override storage region with `AWS_S3_REGION`). Development uses AssumeRole with auto-refreshing credentials when an ARN is configured; staging/production use the instance role. Local configuration reuses own-crm's bucket and the verified `crm-ec2-role`. Objects are isolated under `ai-receptionist/support/`; the role needs `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on that prefix. Keep the bucket private. No public base URL is used for support files.

New database storage keys include the bucket (`s3://bucket/ai-receptionist/support/...`) so files continue to resolve if the configured upload bucket later changes. The existing text column and cleanup queue support this without another migration. S3 uploads use server-side AES256 encryption and private/no-store caching; downloads use 60-second signed URLs and attachment disposition.

## Security and behavior

- Guest creation uses origin checks, a pre-upload flood limit, honeypot, minimum fill time, Turnstile, and per-IP/per-email limits. Signed-in requests and replies have per-user limits; guest reads/replies have per-IP and per-token limits.
- An unverified guest email never attaches a ticket to an existing customer. Guest confirmations do not echo user-controlled names, subjects or descriptions into the recipient's inbox.
- Guest links contain 256-bit random tokens. Only SHA-256 hashes are stored, with a 180-day expiry. Tokens travel in the URL fragment and an `X-Support-Token` header, keeping them out of API URLs and access logs. Treat the link as a private bearer credential.
- Signed-in ticket queries check both ticket ID and authenticated user ID. RLS is enabled on all support tables, with no direct browser access; privileged SQL functions execute only for the service role.
- Customer responses omit triage metadata, internal notes, storage paths and admin identity. Internal attachments require admin authorization too.
- Initial requests accept one attachment up to 2 MB; replies accept three up to 10 MB each. Only JPG, PNG, WEBP and PDF are permitted. The API validates extension, MIME, size/count and file signatures. New files live in S3; an authorized download receives a 60-second signed download URL. Historical Supabase files retain their existing private download path.
- Admin reads require `read_only`; replies, notes and triage require `support`; category/retention settings require `super_admin`. Cookie authentication, origin/CSRF protection and audit logging use the existing admin infrastructure.
- Customer confirmations, public admin replies and status changes use SES. New-ticket alerts go to active super admins. Replies to an existing guest ticket direct the guest to their original email's private link; its hash cannot be reversed to reconstruct it.
- Categories have server-selected default priorities and may be archived. Customers cannot choose or override priority, ownership or internal-note status.
- Retention is disabled by default (`0` days). When configured, an hourly sweep deletes only resolved/closed tickets older than the retention period. Row locks protect against concurrent replies. Storage paths are queued transactionally and retried if deletion fails.

## Validation

`apps/api/tests/support.test.ts` checks validation, customer redaction, guest tokens, file checks and HTTP authorization/guest email behavior with mocked external services. Browser checks cover guest submission, private replies, mobile layout and the admin inbox/settings using mocked responses. No customer emails are sent by these checks.

The migration and its create/reply/retention functions were also exercised against an isolated PostgreSQL engine, including anonymous access denial and attachment cleanup queuing. Applying and exercising the migration against the connected Supabase project remains a separate activation step.

The admin inbox keeps its list and filters behind a right-side drawer when a ticket is selected. The drawer closes with Escape, the backdrop or its Close button. Ticket assignment controls are not available.
