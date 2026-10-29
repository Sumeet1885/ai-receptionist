# PR #30 review assessment and local fixes

Review: https://github.com/Recrui8/ai-receptionist/pull/30#issuecomment-6488781567

The PR has one consolidated issue comment and no inline review threads. These changes address the code locally; they have not been pushed, and no GitHub thread was marked resolved.

| Finding | Assessment | Result |
| --- | --- | --- |
| CRM SSRF | Valid. Internal POST and response reflection were reproduced. The specific AWS credential-theft scenario was **not** reproduced: IMDS method and token requirements matter. | Public-address checks include all DNS answers; checked addresses are pinned to the connection, TLS uses the original host, redirects are never followed, body reads are capped at 64 KiB and DNS/connect/body time share a deadline. Raw response bodies are neither returned nor logged. Production requires HTTPS. Existing saved connections use the same transport protections. |
| Widget origin bypass | Valid application issue when attacker-controlled forwarding headers reach the API. Production proxy handling affects reachability. Browser domain restrictions are not client authentication. | Runtime Host and forwarded Host no longer grant authorization. Explicit configured application origins and bot domains remain supported. |
| IP limiter bypass | Valid for IP-keyed limits; **not** a bypass of per-user limits or the separate database-backed admin account lockout. | Use Express's proxy-resolved `req.ip`, falling back to socket peer for raw upgrades; request logs use the same source. Raw WebSocket requests deliberately share a proxy peer bucket rather than trusting arbitrary forwarded values. |
| Password verification bypass | Valid for an attacker holding an authenticated customer session. Not unauthenticated account takeover. | An existing password requires current-password verification or a short-lived recovery grant issued after server-side one-time recovery OTP verification. Grants bind user, access token and auth account version, and expire after 10 minutes. Activation can still set the first password. |
| Support upload memory exhaustion | Partly valid. Public creation was already limited to **2 MiB**, with an attempt limiter before parsing; replies allowed 3 × 10 MiB after guest/owner authorization. Multipart captcha fields cannot be verified before parsing them. | Bound aggregate reserved upload memory per process to 32 MiB, reject excess concurrent uploads with 503/Retry-After, cap parsing time and reject unsupported file metadata before buffering. Captcha/bot checks and file signatures remain enforced. This bounds heap use; distributed DoS still requires edge limits. |
| Revenue raw-row downloads | Valid. The old 20,000-row caps also risked inaccurate totals. | New service-only `admin_revenue_summary()` aggregates complete totals, counts, conversion, six monthly buckets and the top 20 plans inside PostgreSQL. No capped raw order lists are downloaded. Detailed purchase history stays server-paginated. |
| Customer MATERIALIZED CTEs | The query does work for exact filtered totals and unfiltered lifecycle counts. Removing MATERIALIZED alone is not a demonstrated improvement; multiply referenced CTEs may still materialize by default. | Tested forced inlining against the existing query. Same results; 54-customer dataset measured approximately 2.42 ms materialized versus 3.99 ms inlined (four warm samples). Kept current query. This small dataset does not establish high-volume performance; indexed search deserves a separate benchmark when scale justifies it. |
| Active-plan upgrade blocked | Valid in the PR's older code, already addressed by the current minute-purchase work. | Authenticated customers may top up the current period or replace the plan immediately for a new month, using the user's chosen policy, not queued/prorated billing. Prices come from the server; repeat customers do not pay setup again. |
| Failing CI tests | Both failures reproduced. Merely changing polling expectations would preserve unnecessary public-page polling. | Added the password input's direct maxLength; retained needed `session_id` in the lead projection and aligned the test; restored 15-second lead polling, 60-second dashboard polling and no polling on other routes. |
| AWS secret-containing cache keys | Valid avoidable duplication in memory, not demonstrated credential disclosure. Providers inherently hold credentials. | Cache keys contain only role/session/region. A SHA-256 source-credential fingerprint replaces stale providers after key rotation, without serializing raw secrets into map keys. |
| Multi-replica maps | Valid deployment limitation; not an authorization bypass by itself. | No Redis or distributed event bus was introduced. Rate limits, upload reservations and admin event fanout are per-process; account lockout is database-backed. Multi-replica rollout still needs shared rate-limit/event infrastructure. |

## Validation

- Full API suite: 178 tests passed, including new private-address/DNS checks, forwarding-header regressions, one-time recovery verification/grant checks, password bypass denial and upload concurrency admission/release.
- Local attack regression harness: all four previously reproduced attacks blocked, with zero password writes or internal-service hits.
- Minute billing: 15 rollback-only database checks passed, including exhaustion, duplicate credits, period filtering, corrected ingestion timestamps, fresh month, IST expiry, stale payment review and database permissions. API tests also reject browser price/owner/minute tampering.
- Database revenue totals compared with independent SQL sums/counts; six monthly buckets, bounded plan summary and service-only permissions checked. Customer query variants returned identical data.
- Web/admin production builds and SEO checks passed. Live Razorpay checkout, live Dograh inbound switching, existing-workflow resynchronization and high-volume load testing remain staging checks. No test emails or payments were sent.

`20261029100000_admin_revenue_summary.sql` was applied to the connected development database and registered in migration history. Apply it with the other new migrations before deploying these API changes elsewhere.

Useful commands:

```powershell
pnpm --filter @ai-receptionist/api test
pnpm --filter @ai-receptionist/api exec tsx scripts/security-review.ts
pnpm --filter @ai-receptionist/api exec tsx scripts/verify-minute-billing.ts
pnpm --filter @ai-receptionist/api exec tsx scripts/verify-review-database.ts
```
