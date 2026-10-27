# Stage 2a — Admin (staff) authentication design

**Date:** 2026-10-27 · **Status:** Design awaiting approval. No code written, no migration applied, no account created.

Companions: [01-repository-setup-plan.md](01-repository-setup-plan.md), [02-database-architecture.md](02-database-architecture.md) §7.

> **Implementation status (2026-10-27, branch `feat/admin-auth`).** Phase 1 is implemented; the migration is **not applied**. Decisions taken: D1 email + password with seeded accounts; D2 `public.staff_*` locked down; D3 the current project (`xdwcrsydlzprtldkwqzh`), applied by the owner; D5 MFA in phase 2. Differences from the design below:
>
> - `email` is lower-cased `text` with a unique index (no `citext` dependency); `token_hash` is hex `text`.
> - No `Host` check: the cookie is host-only on the admin domain, so requests through the customer site's `/api/*` proxy carry no session; the `Origin` check covers state-changing requests.
> - Scripts implemented: `staff:create`, `staff:reset-password`. Suspend / revoke-role come with the admin user-management screen. Instead of a production-ref check, every script requires `--confirm-project <ref>` matching `SUPABASE_URL`.
> - The `localStorage` boundary rule is not added; the admin app stores nothing in browser storage.
> - Development: `ADMIN_ORIGIN` defaults to `http://127.0.0.1:3001` (the `dev:admin` bind address) and the cookie is `admin_session` without `Secure`; elsewhere it is `__Host-admin_session` with `Secure`.

Scope: how staff sign in to `apps/admin` and how the API authorizes them. Customer (user-side) authentication is unchanged here and is covered by a separate document after this one is agreed.

---

## 1. Summary

| Decision | Choice |
| --- | --- |
| Credential | Email + password. **No public signup** for staff. Accounts are created only by a seed script run by an operator. |
| Identity store | Our own staff tables, **separate from customer Supabase Auth**. A customer account can never become a staff account, and no `profiles` column grants authority. |
| Where auth runs | Entirely in `apps/api`. `apps/admin` holds no tokens and never talks to Supabase (already enforced by `check:boundaries`). |
| Session | Opaque random token in an httpOnly cookie; only its SHA-256 hash is stored server-side. Idle and absolute expiry; revocable. |
| Password hashing | Node built-in `crypto.scrypt` (no new dependency). |
| Authorization | Roles `read_only`, `support`, `super_admin`; every `/api/admin/*` route is deny-by-default. |
| Audit | Insert-only `staff_audit_events` for every login attempt and every staff action. |
| MFA | TOTP, phase 2 — **required before the admin console is exposed on a public domain.** |

---

## 2. Why not reuse customer Supabase Auth

1. The customer project is the security boundary for tenants. Adding staff there means one misconfigured RLS policy or a claim set from the browser could grant staff powers to a customer.
2. `profiles` has no RLS (DB doc G1). Any flag stored there is writable by its owner.
3. Staff need stricter rules (no self-signup, lockout, MFA, audit, short sessions) than customers.

---

## 3. Login flow

```mermaid
sequenceDiagram
  participant B as Admin browser (admin origin)
  participant P as Caddy / Vite proxy (same origin)
  participant A as apps/api
  participant D as Postgres (staff_* tables, service role)

  B->>P: POST /api/admin/auth/login {email, password}
  P->>A: forward (same origin, no CORS)
  A->>A: rate limit per IP; check Origin == ADMIN_ORIGIN
  A->>D: load principal by email (active, not locked)
  A->>A: scrypt verify (dummy hash if unknown email)
  alt valid
    A->>D: insert staff_sessions(token_hash, expiries); reset failed_attempts
    A->>D: audit login.succeeded
    A-->>B: 200 {principal, roles} + Set-Cookie __Host-admin_session
  else invalid
    A->>D: failed_attempts++ (lock after 5 for 15 min); audit login.failed
    A-->>B: 401 "Invalid email or password"
  end
  B->>P: GET /api/admin/auth/me (cookie)
  A->>D: find session by sha256(cookie), check expiry, touch last_seen
  A-->>B: 200 {principal, roles}
```

**Same-origin by design.** The admin app is served from its own domain (e.g. `admin.bolegaindia.ai`), and that domain's Caddy block proxies `/api/admin/*` to `api:4000`, exactly as the customer site already proxies `/api/*`. Locally, the admin Vite dev server proxies `/api/admin` to `http://localhost:4000`. Result: the cookie is first-party, `SameSite=Strict` works, and no CORS rule is added for admin.

---

## 4. API surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/admin/auth/login` | none (rate-limited) | Verify credentials, create session, set cookie |
| `POST /api/admin/auth/logout` | session | Revoke current session, clear cookie |
| `GET /api/admin/auth/me` | session | Current principal and active roles |
| `POST /api/admin/auth/password` | session + current password | Change own password; revokes all other sessions |
| `/api/admin/*` (future) | session + `requireStaffRole(...)` | Admin features, each declaring its minimum role |

Middleware, in order, on every `/api/admin/*` request:

1. `adminOriginGuard` — state-changing methods must carry `Origin` equal to `ADMIN_ORIGIN`; otherwise 403. Also rejects requests whose `Host` is the customer domain, so `/api/admin` is not usable through the customer site's `/api/*` proxy.
2. `requireStaffSession` — resolves the cookie to an active session and principal; otherwise 401. Separate from the customer `requireAuth`; the two never accept each other's credentials.
3. `requireStaffRole(minRole)` — per route; otherwise 403 and an audit row with `decision = denied`.

Errors are generic (`Invalid email or password`, `Not authorized`). Response time for unknown emails matches known emails (dummy scrypt verify), so the endpoint does not reveal which emails exist.

---

## 5. Data model (migration file only; not applied)

Placement follows the existing `calendar_oauth_states` pattern (`supabase/migrations/20260618121000_secure_calendar_oauth.sql`): tables in `public`, RLS enabled with **no policies**, and all grants revoked from `anon` and `authenticated`, so only the service role (the API) can read or write them. This needs no Supabase project setting change. The alternative, a separate `staff` schema (DB doc §7), requires adding the schema to the project's exposed schemas for `supabase-js` to reach it; see decision D2.

```sql
-- illustrative — the real file is supabase/migrations/<ts>_staff_auth.sql, reviewed before anyone applies it
create table staff_principals (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null unique,
  display_name       text not null,
  password_hash      text not null,               -- scrypt$N$r$p$salt$hash
  status             text not null default 'active' check (status in ('active','suspended','revoked')),
  failed_attempts    int  not null default 0,
  locked_until       timestamptz,
  must_change_password boolean not null default true,
  totp_secret_enc    text,                        -- phase 2
  created_at         timestamptz not null default now(),
  password_changed_at timestamptz not null default now(),
  revoked_at         timestamptz
);

create table staff_role_assignments (
  id           uuid primary key default gen_random_uuid(),
  principal_id uuid not null references staff_principals(id),
  role         text not null check (role in ('read_only','support','super_admin')),
  granted_by   uuid references staff_principals(id),  -- null only for the bootstrap seed
  reason       text not null,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  check (granted_by is distinct from principal_id)     -- no self-grant
);

create table staff_sessions (
  id           uuid primary key default gen_random_uuid(),
  principal_id uuid not null references staff_principals(id),
  token_hash   bytea not null unique,                  -- sha256 of the cookie value
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,                   -- absolute: created_at + 8h
  revoked_at   timestamptz,
  ip           inet,
  user_agent   text
);

create table staff_audit_events (
  id                 bigserial primary key,
  occurred_at        timestamptz not null default now(),
  actor_principal_id uuid references staff_principals(id),
  actor_session_id   uuid references staff_sessions(id),
  action             text not null,                   -- login.succeeded, login.failed, logout, password.changed, ...
  decision           text not null check (decision in ('allowed','denied')),
  outcome            text not null check (outcome in ('succeeded','failed','pending')),
  tenant_owner_id    uuid,
  resource_type      text,
  resource_id        text,
  reason             text,
  request_id         text,
  ip                 inet,
  metadata           jsonb not null default '{}'      -- sanitised: never passwords, tokens, transcripts
);

-- every table: enable RLS, no policies; revoke all from anon, authenticated
-- staff_audit_events: also revoke update/delete/truncate from service_role + trigger rejecting update/delete
```

`citext` is a Supabase-provided extension; if it is not enabled on a project, the migration uses `text` with a `lower(email)` unique index instead.

---

## 6. Creating admin accounts ("seed directly in the DB")

Passwords must never appear in SQL, migrations, shell history or git. Seeding is therefore a script, not an `insert` statement:

```bash
# from the repo root, with apps/api/.env pointing at the target project
pnpm --filter @ai-receptionist/api staff:create --email ops@bolegaindia.ai --name "Ops" --role super_admin
```

The script:

1. Generates a random 20-character password (or reads one from a hidden prompt), hashes it with scrypt and inserts `staff_principals` with `must_change_password = true`.
2. Inserts a `staff_role_assignments` row. The very first `super_admin` has `granted_by = null` and `reason = 'bootstrap seed'`; any later run requires `--granted-by <email>` of an existing `super_admin`.
3. Writes a `staff.created` audit row and prints the password **once**.
4. Refuses to run if `SUPABASE_URL` matches the production project ref unless `--confirm-production` is passed.

Companion commands: `staff:reset-password`, `staff:suspend`, `staff:revoke-role`. All write audit rows.

On first login the admin UI forces a password change before anything else is shown.

---

## 7. Security parameters

| Control | Value |
| --- | --- |
| scrypt | N = 2^17, r = 8, p = 1, 16-byte salt, 64-byte key (OWASP minimum); `maxmem` raised accordingly |
| Password policy | ≥ 12 characters, not equal to the email, checked against a small bundled list of common passwords |
| Lockout | 5 consecutive failures → 15 min lock per account; failures still counted while locked |
| IP rate limit | 10 login attempts per IP per 15 min (existing `middleware/rateLimit.ts`) |
| Cookie | `__Host-admin_session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain` |
| Session lifetime | 30 min idle, 8 h absolute; all sessions revoked on password change, suspension or role revocation |
| CSRF | `SameSite=Strict` + `Origin` check on non-GET + JSON-only bodies |
| Logging | Request logger must not log `/api/admin/auth/*` bodies; `metadata` in audit rows is allow-listed fields only |
| MFA (phase 2) | RFC 6238 TOTP with Node `crypto` (no dependency), secret encrypted with a key from SSM, 10 one-time recovery codes |

`localhost` counts as a secure context in current browsers, so the `Secure` cookie works over `http://localhost` in development.

---

## 8. Changes by area

| Area | Change |
| --- | --- |
| `supabase/migrations/` | One new migration file (§5). **Not applied** until approved and the target project is confirmed (DB doc §8). |
| `apps/api/src/modules/staff-auth/` | `password.ts` (scrypt), `sessions.ts`, `repository.ts` (all `staff_*` queries), `middleware.ts` (`adminOriginGuard`, `requireStaffSession`, `requireStaffRole`), `routes.ts`, `audit.ts` |
| `apps/api/src/index.ts` | Mount `app.use('/api/admin', adminRoutes)` before the error handler. Existing routes unchanged. |
| `apps/api/scripts/` | `staff-create.ts`, `staff-reset-password.ts`, `staff-suspend.ts`, `staff-revoke-role.ts` + npm scripts |
| `apps/api/src/config.ts` | `ADMIN_ORIGIN` (e.g. `http://localhost:3001`), `ADMIN_HOSTS`. Optional: session lifetimes. |
| `apps/admin` | Login page, forced password change, signed-in shell with `me` + logout. Fetches same-origin `/api/admin/*` with `credentials: 'include'`. Vite dev proxy for `/api/admin`. Still no Supabase import. |
| `scripts/check-boundaries.mjs` | Add: `apps/admin/src` must not reference `localStorage`/`sessionStorage` for auth; `staff_*` tables only referenced from `modules/staff-auth/repository.ts`. |
| Tests (`apps/api/tests/`) | Hash/verify round trip and parameter parsing; lockout; session expiry (idle/absolute) and revocation; middleware 401/403 paths; Origin/Host guard; no customer JWT accepted on `/api/admin`; audit rows written for success and failure. |
| Deployment | Nothing until approved: an `admin` Caddy site block and Compose service are a later, separate change. |

No new npm dependency is required.

---

## 9. Phases

| Phase | Contents | Exit check |
| --- | --- | --- |
| 1 | Migration file, API module, seed scripts, admin login UI, tests | `pnpm verify` passes; local login works against a **non-production** project after the migration is applied there by you |
| 2 | TOTP MFA + recovery codes; enforce for all staff | Login without second factor is impossible |
| 3 | First real admin features (read-only tenant list, audit viewer) behind `requireStaffRole` | Every route has a role and an audit row |
| — | Customer-side auth review (separate doc 04) | — |

---

## 10. Decisions needed

1. **D1 — Approve email + password with seeded accounts and no staff signup.** (Your stated preference; recommended with MFA in phase 2.)
2. **D2 — Table placement:** `public.staff_*` with revoked grants and RLS-no-policy (recommended: matches existing pattern, no project setting change) or a separate `staff` schema (stronger separation, needs the schema exposed to the API in each project's settings).
3. **D3 — Which Supabase project to apply the migration to first for local testing.** The local `.env.local` points at the project the production Dockerfile uses (`xdwcrsydlzprtldkwqzh`). Recommended: apply to staging (`lckiehhthevtykulfbvw`) or a fresh dev project first.
4. **D4 — Admin domain name** (e.g. `admin.bolegaindia.ai`), needed for `ADMIN_ORIGIN` and the later Caddy block.
5. **D5 — Is MFA required before anyone outside the dev team uses the console?** Recommended: yes.

STOP: no code, migration or account will be created until these are answered.
