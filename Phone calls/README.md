# Phone Calls (Dograh inbound voice)

This folder is the architecture home for the inbound-phone-call feature. It documents the
design; the runnable code lives inside `server/` and `client/` because production Docker
builds use `docker build ./server` as the build context (see
[`docs/AWS_DEPLOYMENT.md`](../docs/AWS_DEPLOYMENT.md)) — files outside `server/` are not
shipped to the backend image, and the Vite client build is likewise rooted at `client/`.

## What this feature does

Lets a business owner provision a real phone number that, when called, is answered by a
Dograh voice agent configured from the same bot persona (business profile + knowledge base)
used by the existing web chat and Gemini Live voice. Calls are mirrored into Supabase so they
show up in the existing Leads/Inbox tabs, and a dedicated **Calls** tab manages provisioning
and shows call history. The same tab can also place **outbound** calls (see below).

Dograh is a separate, already-deployed voice-AI platform (Docker, local instance at
`http://localhost:8000/api/v1`). On a phone call, **Dograh's own agent answers or dials** —
Express never proxies phone audio. Express only talks to Dograh's REST API to provision agents
and to pull (mirror) finished call records.

## Module layout (where the actual code lives)

```
server/src/modules/phone-calls/
  types.ts                     Shared TS types (Dograh API + internal)
  dograhClient.ts              Thin authenticated fetch wrapper over Dograh's REST API
  workflowDefinition.ts        Hand-authored, minimal workflow graph JSON (see below)
  receptionistInstruction.ts   buildBusinessPersona / buildWebVoiceExtraConstraints /
                                buildDograhPhoneInstruction / buildDograhOutboundInstruction
  callMirror.ts                Claim-first, resumable sync of Dograh runs -> Supabase
  callPoller.ts                Process-local interval that drives callMirror
  dograhController.ts          HTTP handlers (provision, numbers, assign, call, calls, sync)
  dograh.routes.ts             Express router, mounted at /api/dograh
  index.ts                     Barrel export

client/src/modules/phone-calls/
  dograhApi.ts                 Authenticated fetch client (Supabase session token)
  CallsWorkspace.tsx           Tab container (bot selector + panels)
  PhoneAgentPanel.tsx          Provision / number-assign / outbound dial panel
  CallsTable.tsx               Call history (transcript, recording, lead outcome)
```

Dograh env wiring (`DOGRAH_API_URL`/`DOGRAH_EMAIL`/`DOGRAH_PASSWORD`/`DOGRAH_POLL_INTERVAL_MS`)
lives in the app's existing `server/src/config.ts` singleton, not inside this module — see
"Environment variables" below.

Wiring into the existing app is intentionally thin:
- `server/src/index.ts` mounts `/api/dograh` and starts the poller.
- `server/src/controllers/liveChatController.ts` imports `buildBusinessPersona` +
  `buildWebVoiceExtraConstraints` from `receptionistInstruction.ts` instead of building its
  system instruction inline, so the web-voice and phone personas share one source of truth.
- `client/src/App.tsx` adds a `calls` route; `client/src/components/layout/Header.tsx` adds the
  nav entry.

## How Dograh concepts map to ours

| Dograh concept | Our model |
| --- | --- |
| Workflow (`POST /workflow/create/definition`, hand-authored graph) | The inbound (answering) agent for one bot. See "Workflow graph design" below for why we author the graph ourselves instead of using Dograh's `create/template` text-to-graph generator. |
| Outbound workflow (same endpoint, `isOutbound: true` variant of the same graph) | A **second**, separate workflow per bot for calls it places itself — Dograh fixes `call_type` at creation, so one workflow can't serve both directions. |
| Telephony config + phone number | Pre-existing (already tested manually). We bind a number's `inbound_workflow_id` to a bot's workflow, and reuse the same number as the outbound caller ID. |
| Run (`GET /workflow/{id}/runs`) | One completed phone call (either direction; `call_type` on the run record distinguishes them). Has `transcript_url`, `recording_url`, `gathered_context`, cost/usage. |
| `POST /telephony/initiate-call` | Places one ad-hoc outbound call (`workflow_id` + `phone_number` + caller ID). No bulk/campaign dialing here — see Scope below. |
| Auth (`POST /auth/login`) | One Dograh service account for the whole app, held server-side only. |

## Workflow graph design

Dograh's runtime is always a graph: each turn, the configured LLM both generates the agent's
reply *and* decides which outgoing edge (if any) to follow, based on that edge's natural-language
`condition`. There is no single-continuous-session mode like Gemini Live — but the graph can be
made as small as one conversational node, which is what we do.

**We don't use `POST /workflow/create/template`.** That endpoint feeds our persona text to
Dograh's own meta-LLM, which reinterprets it into an AI-generated node/edge graph we don't
control. In practice this produced a 4-node graph (`globalNode` → `startCall` → `agentNode` →
`endCall`, with two separate "end call" edges) with vague edge conditions and variable
extraction left off. Small/literal models (e.g. Groq `llama-3.1-8b-instant`) misfired the
ambiguous "end call" edge on short or uncertain user replies — causing instant hangups,
repeated questions (no persisted state), and the model occasionally choosing to end the call
itself mid-conversation.

Instead, `workflowDefinition.ts` builds the literal `workflow_definition` JSON ourselves and
sends it via `POST /workflow/create/definition` (first provision) or `PUT /workflow/{id}`
(re-provision — updates the same workflow id in place, then `POST /workflow/{id}/publish` makes
it live; both `PUT` and `create/definition` save a draft, so publish is required). The graph is
always exactly three nodes:

1. **`globalNode`** — the full persona (`buildDograhPhoneInstruction`/`buildDograhOutboundInstruction`
   output) verbatim. Never traversed; prepended to any node with `add_global_prompt: true`.
2. **`startCall`** — the *only* conversational node. Handles the entire call (greeting through
   close) in as many turns as needed. `extraction_enabled: true` with variables derived from
   `widgetConfig.requiredLeadFields` (e.g. `caller_name`, `caller_phone`) — gives the model
   persistent memory across turns instead of relying on raw transcript re-reading, which is what
   caused the looping/repetition.
3. **`endCall`** — a short, fixed closing line.

Exactly **one edge**, `startCall → endCall`, with a deliberately contrastive condition: it spells
out both *when to end* (caller says goodbye / explicitly wants to hang up / questions answered
and contact details collected) and *when not to* (a short reply, "okay"/"thanks", a pause, or
any uncertainty) so the model has an explicit "else, keep going" branch instead of an implicit
one — that implicit branch is what small models were collapsing into "end the call" under
ambiguity.

This also fixed a latent bug: re-provisioning previously called `create/template` again,
minting a **new** workflow id and leaving the assigned phone number's `inbound_workflow_id`
pointed at the old, now-abandoned workflow. Updating in place via `PUT` keeps the same id, so
re-provisioning an already-assigned bot now actually changes what the live number answers with.

A fresh `create/definition` call publishes the first version immediately (no separate draft);
`PUT` always creates a new draft requiring an explicit `publish`. `dograhClient.publishWorkflow`
calls publish unconditionally and swallows the resulting "No draft to publish" 400 on first
creation rather than branching on which path was used — simpler and correct either way.

The `startCall` node also carries a static `greeting` (TTS-only, no LLM round-trip) and
`allow_interrupt: false`. A white-box test against a real call surfaced two real conversational
defects that the architecture fix alone didn't catch: (1) the first LLM+TTS round-trip on a cold
connection took 7-20s of dead air before the opening line played, which callers read as "the
agent can't hear me"; (2) with `allow_interrupt: true` and no echo cancellation on this
self-hosted telephony audio path, the bot's own voice bled back into the input and got misheard
as the caller interrupting, truncating the bot's sentences mid-word. The static greeting removes
the dead-air window; disabling interrupt stops the bot from cutting itself off (the caller can
still always just start talking once the bot pauses between turns).

## Known transcript/recording gotcha

Dograh run records expose `transcript_url`/`recording_url` as **relative storage keys**
(e.g. `"transcripts/47.txt"`), not fetchable URLs — only `transcript_public_url`/
`recording_public_url` are absolute and downloadable. `callMirror.ts` fetches and stores the
public ones; fetching the relative key directly throws and silently marks the whole run
`ingest_status: 'failed'`, which is exactly what happened in production before this was caught by
a white-box test — every call with an actual transcript failed to mirror, while only
empty/too-short calls (no transcript) "succeeded," for 16 calls straight. The transcript text
format is also `[ISO timestamp] role: content` per line, not a bare `role: content` — the parser
strips the leading bracketed timestamp before matching the speaker.

For outbound calls, `caller_number` is the **bot's own** Twilio caller ID, not the number dialed
— `callMirror.ts` extracts the actual counterparty (the number the bot called, for outbound) so
the Calls tab shows who was contacted, not the bot's own number.

## Data flow

1. Owner opens **Calls**, picks a bot, clicks **Provision** →
   `POST /api/dograh/bots/:botId/provision` builds the phone persona and creates/updates the
   Dograh workflow; `bots.dograh_workflow_id` is stored.
2. Owner assigns a number → `POST /api/dograh/bots/:botId/assign-number`. Tenant isolation is
   enforced by *us*, not Dograh (it's one org/service account): `bots.dograh_phone_number_id`
   is unique, and the numbers picker hides numbers already claimed by another bot.
3. A caller dials the number; Dograh answers and runs the workflow.
4. The background poller (`callPoller.ts`) and the manual **Sync now** button both call
   `callMirror.syncBotCalls(bot)`, which claims each new run (`phone_calls.dograh_run_id`,
   `ingest_status`), creates a `chat_sessions` row (`channel:'phone'`), binds
   `phone_calls.session_id` immediately, inserts `messages` from the transcript, runs the
   existing `analyzeLead(...)` (`server/src/controllers/leadController.ts`) to populate
   `leads`, then finalizes the `phone_calls` row. This ordering makes mirroring resumable after
   a crash without creating duplicate sessions.
5. The phone call now appears in **Calls**, **Inbox**, and **Leads** like any web conversation.

**Outbound** is the same flow in reverse: clicking **Provision phone agent** also creates/updates
a second, outbound-flavored workflow (`bots.dograh_outbound_workflow_id`). Once a number is
assigned, "Call a number" in the panel hits `POST /api/dograh/bots/:botId/call`, which validates
the number with the same `validateContactInput` used by the web contact-collection flow, then
calls Dograh's `initiate-call`. The resulting run is picked up by the **same**
`callMirror`/`callPoller` pipeline — `syncBotCalls` simply loops over both workflow ids — so an
outbound call shows up in Calls/Inbox/Leads exactly like an inbound one.

## Scope (v1)

In scope: inbound provisioning, KB-grounded answering, single ad-hoc outbound calls, lead
capture from transcript, call mirroring for both directions.

Deferred:
- **Live calendar booking and sequential server-verified contact capture during the call**
  (either direction). The phone/outbound personas explicitly route booking requests to verbal
  contact capture + "the team will follow up" (mirrors the calendar-disabled branch already
  used by web voice when `enableCalendar` is false).
- **Per-call personalization for outbound calls.** Dograh's `initiate-call` API has no field for
  dynamic per-call context (e.g. "calling Priya about her enquiry") — the outbound persona is
  generic ("calling on behalf of the business to follow up"), not personalized per lead.
- **Bulk outbound dialing (campaigns).** Dograh has a separate campaign system (CSV source,
  retry/concurrency/scheduling) for mass dialing — materially bigger than this feature; not
  built here.
- Dograh OSS exposes no run-completion webhook to our server, so ingestion is poll + manual
  sync, never read-triggered.

## Environment variables

Added to `server/.env` / `.env.example`:

```dotenv
DOGRAH_API_URL=http://localhost:8000
DOGRAH_EMAIL=
DOGRAH_PASSWORD=
DOGRAH_POLL_INTERVAL_MS=60000
```

If unset, the phone-calls module stays inert (no routes called, no poller started) — it never
blocks the rest of the app from running.

## Database

Migrations (kept in the ordered migrations directory per the project's invariant — not
duplicated here):
- `server/supabase/migrations/20260626120000_add_dograh_calls.sql`
- `server/supabase/migrations/20260626130000_add_dograh_outbound.sql`

- `bots`: `dograh_workflow_id` (inbound), `dograh_outbound_workflow_id` (outbound),
  `dograh_telephony_config_id`, `dograh_phone_number_id` (unique), `dograh_phone_number`.
- `chat_sessions`: `channel` (`'web' | 'phone'`).
- `phone_calls` table: one row per Dograh run (either direction), claim/resume key
  `dograh_run_id`.

## Security

- The Dograh JWT and service-account credentials never leave Express; the browser only calls
  our own authenticated `/api/dograh/*` routes (Supabase session token, same as `/api/calendar`).
- All `/api/dograh/*` routes verify the bot belongs to the authenticated owner before touching
  Dograh or Supabase.
