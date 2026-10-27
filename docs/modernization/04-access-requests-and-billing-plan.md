# Stage 2b — Gated access, email, abuse protection and payments: plan

**Date:** 2026-10-27 · **Status:** Plan awaiting approval. No code, migration, AWS or Supabase setting changed.

Reference implementation: `own-crm` (Ezeebzee) — `apps/server/src/controllers/accessRequest.controller.ts`, `middleware/{botGuard,turnstile,signupGuards,rateLimiter}.ts`, `packages/core/src/aws/sesClient.ts`, `routes/signup.routes.ts` (Razorpay). We copy its **behaviour**, not its code: own-crm owns its user table (Prisma + bcrypt + JWT), while this product's customers live in **Supabase Auth**. Provisioning here therefore means "the API creates the Supabase user", and every DB change is a Supabase migration file.

Depends on: [03-admin-auth.md](03-admin-auth.md) (super-admin login is needed to review requests).

---

## 1. Target flows

### 1.1 Free access (now)

```mermaid
sequenceDiagram
  participant V as Visitor (bolegaindia.ai)
  participant A as apps/api
  participant D as Postgres
  participant S as AWS SES
  participant SA as Super admin (apps/admin)

  V->>A: POST /api/public/access-requests (form + Turnstile token + honeypot + fill time)
  A->>A: flood limit → honeypot/fill time → Turnstile siteverify → per-IP / per-email hourly limits → validate
  A->>D: insert access_requests (status pending)
  A->>S: "We received your request" to visitor; "New request" to notification list
  SA->>A: list / view / mark contacted / reject (reason) / approve
  A->>D: approve → supabase.auth.admin.createUser (no password, email unconfirmed) + bots/profile defaults
  A->>A: auth.admin.generateLink(type: invite) → one-time activation link
  A->>S: "Your workspace is ready — set your password" (branded, from our domain)
  V->>V: opens link → sets password → email is verified by that click → signs in → onboarding (later)
```

### 1.2 Paid plan (later)

Pricing → minimal checkout form (name, email, phone, company, plan) behind the same guards → server creates a Razorpay order for a **server-side price** → Razorpay Checkout → `/confirm` verifies the HMAC signature → **webhook `payment.captured` is the source of truth** → provision the workspace exactly as in 1.1 (activation email via SES). Idempotent on `razorpay_order_id` / `payment_id`; a reconciliation job covers lost webhooks.

---

## 2. Work packages (in order)

Each package is one PR, with its own tests, and leaves `npm run verify` green. Migrations are written and reviewed; **you** apply them, to a non-production project first.

| # | Package | Contents | Needs from you |
| --- | --- | --- | --- |
| **P1** | Admin auth | As designed in doc 03: staff tables, scrypt, cookie sessions, `staff:create` seed script, admin login UI | Doc 03 decisions D1–D5 |
| **P2** | Public-form protection | `middleware/botGuard.ts` (honeypot field + minimum fill time 3 s), `middleware/turnstile.ts` (siteverify, 5 s timeout, hostname must equal our app host, **fails closed** outside development), per-IP and per-email limits on top of the existing `middleware/rateLimit.ts`; `publicFormGuards` chain in own-crm's order: flood limit → bot guard → Turnstile → hourly IP → hourly email. Web: `<Turnstile>` component + hidden honeypot + fill-time hook. Security headers (`Cache-Control: no-store`, `Referrer-Policy`) and Origin check on public POSTs | Cloudflare Turnstile site key + secret (per environment) |
| **P3** | Access request form | Migration `access_requests` (RLS on, no policies, grants revoked: API-only). `POST /api/public/access-requests` (zod-style validation, duplicate check on email/phone while pending/contacted/approved, IP + UA stored). Web page `/request-access`; landing and header "Get started" point to it | Which fields to collect (§4) |
| **P4** | SES email module | `apps/api/src/services/email/` — SESv2 client (instance role on EC2, static keys/assumed role only in development), templated HTML + text, one `sendEmail()` entry point, `email_messages` log table (status, provider message id, no body), bounce/complaint suppression later. Templates: request received, new-request notification, workspace ready (activation), password reset | SES region, verified sending domain/address, production access (out of sandbox), IAM permission on the EC2 role |
| **P5** | Super-admin review + provisioning | Admin pages: list (filters by status, search), detail, mark contacted, reject with reason (optional email), approve → provision. Provisioning: `auth.admin.createUser` + `generateLink('invite')` → SES activation email; resend activation; every action written to `staff_audit_events`. Notification-recipient list stored in a settings row | Who receives "new request" emails |
| **P6** | Close open self-signup | Remove the public sign-up form, route "Sign up" to `/request-access`; set-password page for activation links. Supabase settings (you change them): disable "Allow new users to sign up" — this also stops Google/Microsoft sign-in from creating new accounts; existing users still sign in. Point Supabase Auth's own emails (password reset) at SES SMTP so all mail comes from our domain | Approval to close self-signup; keep Google/Microsoft sign-in for existing users? |
| P7 | Onboarding | Later, separately designed | — |
| P8 | Plans + Razorpay | `plans` (server-side prices), `checkout_requests`, `payment_orders` (status machine: created → captured / failed / review), Razorpay order creation, signature check, webhook with `X-Razorpay-Signature` HMAC and idempotency, reconciliation job, provisioning reuse from P5, kill switch `PAID_SIGNUP_ENABLED` | Razorpay account + keys + webhook secret; plan names and prices |

P2 and P4 do not depend on each other; P3 needs P2; P5 needs P1, P3 and P4; P6 needs P5.

---

## 3. Security rules applied throughout

1. **Rate limiting:** every public POST has a flood limit before any outbound call; per-email limits count only captcha-verified submissions (so an attacker cannot lock out someone else's email). The existing limiter is in-memory, which is correct for the current single API container; if the API is ever scaled out, move buckets to Redis or Postgres.
2. **Bot defence:** honeypot with a meaningless field name, browser-measured fill time, Turnstile with hostname binding. Turnstile **fails closed** in staging/production when the secret is missing or Cloudflare is unreachable.
3. **No enumeration:** public responses never reveal whether an email has an account. (own-crm returns 409 `TENANT_EXISTS`; we return the same "request received" message and handle duplicates by email to the owner instead.)
4. **Secrets server-side only:** Turnstile secret, AWS credentials, Razorpay secret and webhook secret live in `apps/api` env/SSM; `check:boundaries` is extended to fail on them in the web bundle.
5. **Payments:** the server sets prices; the browser's success callback never grants anything; webhook signature + idempotency keys; amount and currency re-checked against the order.
6. **Audit:** every super-admin decision and every provisioning step is in `staff_audit_events`.
7. **No PII in logs:** request bodies of public routes are not logged; emails are masked in log lines.

---

## 4. Proposed access-request fields

Required: full name, work email, phone (validated with the existing `libphonenumber-js`), business name, business type/industry. Optional: website, city, expected monthly call/chat volume, preferred language(s), "what do you want the receptionist to do" (free text, 1,000 chars). Consent checkbox for being contacted.

---

## 5. Decisions needed

1. Approve the package order P1 → P6 (P7, P8 later).
2. Turnstile: do you already have a Cloudflare account/site key (own-crm uses one — same account, new widget for `bolegaindia.ai`)?
3. SES: reuse own-crm's AWS account/region and verify `bolegaindia.ai` as a sending domain? Sender address (e.g. `no-reply@bolegaindia.ai`) and reply-to.
4. Close self-signup in P6 (recommended), and keep Google/Microsoft sign-in for already-provisioned users?
5. Field list in §4.
6. Which Supabase project receives the migrations first (the local env points at the production-Dockerfile project).

STOP: implementation starts with P1 after these and the doc 03 decisions are answered.
