# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified production security and reliability blockers while preserving all current customer-facing chat, voice, dashboard, and calendar behavior and leaving Outlook implementation unchanged.

**Architecture:** Anonymous visitor access moves behind Express projections and session endpoints. Calendar tool execution becomes an in-process service, OAuth state becomes opaque and single-use, and voice sessions are bound to their bot before Gemini opens. Database migrations preserve authenticated owner access while closing anonymous direct writes.

**Tech Stack:** TypeScript, Express, React/Vite, Supabase/Postgres RLS, Node test runner, Docker.

---

### Task 1: Public chat API boundary

**Files:**
- Create: `server/src/services/publicBot.ts`
- Modify: `server/src/routes/chat.routes.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/hooks/useChat.ts`
- Test: `server/tests/publicBot.test.ts`

- [ ] Write a failing test proving public bot responses expose UI fields but not `owner_id`, `knowledge_base`, or `allowed_domains`.
- [ ] Run `npm test --prefix server -- publicBot.test.ts` and confirm the missing helper fails.
- [ ] Add a shared public projection, use it for ID and subdomain endpoints, then switch standalone chat loading and session creation to Express.
- [ ] Run the focused test and `npm run build`.

### Task 2: Close anonymous Supabase policies

**Files:**
- Create: `server/supabase/migrations/20260618_harden_public_access.sql`
- Test: `server/tests/migrations.test.ts`

- [ ] Write a failing static migration test requiring removal of `public_bot_read`, `public_session_insert`, and `public_message_insert` while retaining owner policies.
- [ ] Add an idempotent migration that drops only the three anonymous policies.
- [ ] Run the focused migration test.

### Task 3: Internalize calendar tool operations

**Files:**
- Create: `server/src/services/calendar/calendarOperations.ts`
- Modify: `server/src/controllers/chatController.ts`
- Modify: `server/src/controllers/liveChatController.ts`
- Modify: `server/src/routes/calendar.routes.ts`
- Modify: `server/src/controllers/calendarController.ts`
- Test: `server/tests/calendarOperations.test.ts`

- [ ] Write failing tests for exact-slot validation, one booking per session, and trusted owner derivation from the server-loaded bot.
- [ ] Move availability and booking logic into injectable service functions without modifying calendar adapters.
- [ ] Replace internal HTTP fetches in typed and voice controllers with direct calls.
- [ ] Remove public availability and booking routes.
- [ ] Run focused and full server tests.

### Task 4: Single-use OAuth state and connection consistency

**Files:**
- Create: `server/src/services/calendar/oauthState.ts`
- Create: `server/supabase/migrations/20260618_secure_calendar_oauth.sql`
- Modify: `server/src/controllers/calendarController.ts`
- Modify: `client/src/hooks/useAuth.ts`
- Test: `server/tests/oauthState.test.ts`

- [ ] Write failing tests proving state is random, stored hashed, expires, and can be consumed only once.
- [ ] Implement state creation and atomic delete-on-consume against Supabase.
- [ ] Make auth URL creation await state creation and make callback reject missing, expired, provider-mismatched, or replayed state.
- [ ] Add a migration for `calendar_oauth_states`, an atomic consume function, deterministic calendar connection deduplication, and `UNIQUE(owner_id)`.
- [ ] Align the frontend calendar token upsert conflict target to `owner_id`.
- [ ] Run focused tests and client build.

### Task 5: Bind live sessions and preserve voice typed-input UX

**Files:**
- Create: `server/src/services/liveSession.ts`
- Modify: `server/src/controllers/liveChatController.ts`
- Modify: `server/src/controllers/widgetController.ts`
- Test: `server/tests/liveSession.test.ts`
- Test: `server/tests/widgetProtocol.test.ts`

- [ ] Write failing tests rejecting missing, inactive, and bot-mismatched live sessions.
- [ ] Add a session-context loader and use it before acquiring a Gemini Live slot.
- [ ] Write a failing static protocol test requiring `request_input.field` and `textInput.data` in the generated widget.
- [ ] Correct only those protocol keys, preserving the existing overlay DOM and styling.
- [ ] Run focused and full server tests.

### Task 6: Credential, logging, typecheck, and container hygiene

**Files:**
- Delete: `client/.env.vercel`
- Modify: `.gitignore`
- Modify: `server/src/routes/chat.routes.ts`
- Modify: `server/tsconfig.json`
- Modify: `server/package.json`
- Create: `server/.dockerignore`
- Modify: `server/Dockerfile`
- Test: `server/tests/productionHygiene.test.ts`

- [ ] Write a failing static test requiring `.env.vercel` ignore coverage, active source typecheck coverage, non-root Docker user, Docker exclusions, and absence of `userMessage` in error logs.
- [ ] Apply the minimal configuration and logging changes.
- [ ] Run the focused test, server typecheck, server tests, and client build.
- [ ] Record Vercel token revocation as the sole external credential action; never print or reuse the token.

### Task 7: Completion audit

**Files:**
- Review: all files above

- [ ] Run `npm test --prefix server`.
- [ ] Run `npm run typecheck --prefix server`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Search for public calendar mutation routes, broad anonymous policies, leaked `.env.vercel`, mismatched widget protocol keys, and unbound live session setup.
- [ ] Confirm `server/src/services/calendar/outlookCalendar.ts` has no diff.
- [ ] Compare every design invariant against direct code or command evidence and report any external deployment action still required.

No commits are created during execution because the working tree contains pre-existing user changes that must remain reviewable as a single unstaged diff.
