# Production Hardening Design

## Scope

Harden the active Express, Supabase, widget, OAuth, and deployment paths without changing the product's intended UI or conversational behavior. Outlook availability and booking implementation remain unchanged.

## Compatibility invariants

- The embedded widget keeps the same launcher, iframe, text chat, voice overlay, greeting, and appointment UI.
- The standalone `/chats/:subdomain` page keeps working without requiring visitor authentication.
- Dashboard owners continue managing bots, leads, conversations, appointments, and calendar connections through Supabase RLS.
- Typed and voice Gemini prompts, models, tools, and calendar adapter behavior do not change.
- Existing Google and Outlook calendar connections remain readable. Only one active calendar connection is retained per owner, matching the current dashboard status model.

## Design

### Public chat boundary

All anonymous visitor operations go through Express. Add a public bot lookup by subdomain with the same safe projection used by the widget, and make the React public-chat client create sessions through `POST /api/chat/session`. A new migration removes anonymous `SELECT` access to full bot rows and anonymous inserts into `chat_sessions` and `messages`. Authenticated owner policies remain unchanged.

### Calendar boundary

Text and live voice controllers call a shared in-process calendar operations service. The public `/api/calendar/availability` and `/api/calendar/book` routes are removed, eliminating caller-controlled `ownerId`, `botId`, and `sessionId` inputs. The shared service retains exact-slot revalidation, one-booking-per-session, calendar adapter calls, and appointment persistence.

### OAuth state and connection contract

`GET /api/calendar/auth-url` creates an opaque random state token, stores only its SHA-256 hash with owner, provider, and expiry, and passes the opaque token to the existing adapter URL builder. The callback atomically deletes and returns one matching unexpired state row before exchanging the code. This makes state single-use without changing provider adapters.

Calendar connections are normalized to one row per owner because the current adapters upsert on `owner_id` and the dashboard status endpoint expects at most one row. A migration deterministically keeps the most recently updated row, replaces the composite unique constraint with `UNIQUE(owner_id)`, and the frontend auth upsert is aligned to `owner_id`.

### Voice session and widget protocol

Before opening Gemini Live, Express loads the session and active bot together and rejects mismatched `sessionId`/`botId` pairs. The embedded overlay continues to request typed phone/email input, but its protocol is corrected to consume `field` and send `data`, matching the existing backend and React hook.

### Credential and deployment hygiene

Remove the tracked Vercel OIDC token file and ignore `.env.vercel`. Expand server TypeScript coverage to active source and tests, add a typecheck script, add a Docker ignore file, and run the production container as the existing non-root `node` user. Error logs no longer include visitor message content.

## Verification

- Unit tests prove public bot projection, latest-history behavior, OAuth state single-use behavior, trusted calendar context derivation, live session/bot matching, and widget voice protocol compatibility.
- Server tests and type checking pass.
- Client production build passes.
- Static searches prove public calendar mutation routes and broad anonymous policies are absent from the new production state.
- Outlook source behavior is unchanged.

