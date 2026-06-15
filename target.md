# AI Receptionist — Product Requirements Document (Phase 1)

## 1. Product Overview

AI Receptionist is a multi-tenant SaaS platform that gives small and medium businesses (healthcare clinics, academies, recruiters, real estate agents) a 24x7 AI receptionist. The receptionist answers customer queries in their own language (English, Hindi, Marathi, Tamil), captures and scores leads, and books appointments directly into the business's calendar.

Phase 1 focuses on a single channel — a website chat widget — backed by a real, secure, multi-tenant backend with calendar booking. WhatsApp and Voice are planned for later phases (outlined below) but are not part of Phase 1 delivery.

## 2. Goals & Approach

- Ship a working, demoable product where a real business can sign up, configure their AI receptionist, embed it on their website, and have it book real appointments.
- Build the system so that every later addition (WhatsApp, Voice, new industries) is an "adapter" on top of the existing core — not a rebuild.
- Keep the architecture simple enough for a small team to build and maintain, while being safe for multiple paying clients to use simultaneously (no data leakage between tenants).

## 3. User Personas

**Owner / Tenant** — the business (clinic owner, academy owner, recruiter, real estate agent) that signs up, configures their receptionist, connects their calendar, and views leads/conversations in a dashboard.

**Customer** — the end user (patient, student, candidate, property buyer) who chats with the AI receptionist on the business's website.

## 4. User Flow

**Owner flow**
1. Owner signs up / logs in (email or Google).
2. Onboarding wizard: business name, industry (Healthcare / Education / Recruitment / Real Estate), languages supported, greeting message, and structured FAQ data (services, fees, timings, locations).
3. Owner connects their calendar (Google Calendar or Outlook) via OAuth.
4. Owner receives an embed snippet (script tag) to paste into their website.
5. Owner customizes widget appearance (color, position, greeting) from the dashboard.
6. Owner views live conversations, captured leads (with intent, budget, sentiment, lead score), and booked appointments in the dashboard.

**Customer flow**
1. Customer visits the business's website and opens the chat widget.
2. Customer asks questions (services, fees, timings) in any supported language; AI responds in the same language using the business's configured data.
3. If the customer wants to book, the AI checks calendar availability and books a slot directly.
4. AI captures contact details, requirement, and budget naturally during conversation.
5. Conversation ends; system generates a summary, sentiment, and lead score, stored against the tenant.

## 5. System Architecture & Core Principles

The system has three layers: the **chat widget** (embedded on the client's website), the **brain API** (backend service handling conversation logic, LLM calls, and tool/function execution), and the **database** (multi-tenant data store).

Three principles guide every design decision, to ensure the system scales to new channels and industries without rework:

1. **Tenant isolation by default** — every record in the database is tied to a `tenantId`, and access is enforced at the database level, not just in application code.
2. **Calendar abstraction** — booking logic talks to a single interface (`checkAvailability`, `bookAppointment`); Google Calendar and Outlook are two interchangeable implementations behind it.
3. **Channel-agnostic brain** — the backend brain only processes "conversation in, conversation out." The website widget is the first "channel adapter"; WhatsApp and Voice will be additional adapters that reuse the same brain without any change to its logic.

## 6. Tech Stack & Services

- **Frontend**: React + TypeScript + Vite — both the owner dashboard and the embeddable chat widget.
- **Backend**: Node.js + TypeScript (Express or Fastify) — the brain API, calendar OAuth handling, and lead-processing pipeline.
- **LLM**: Gemini 2.5 Flash — conversation handling, function calling, and post-conversation summary/sentiment/lead scoring.
- **Calendar integrations**: Google Calendar API (OAuth 2.0) and Microsoft Graph API (Outlook/Microsoft 365).
- **Database & Auth**: see comparison below.

## 7. Database Options

**Option A: Supabase (Postgres)**

Pros:
- Built-in authentication for owner login/signup
- Built-in row-level security — enforces tenant isolation at the database layer, reducing risk of data leaks between clients
- Realtime subscriptions — useful for live conversation/lead feeds in the dashboard
- Built-in file storage for future needs (call recordings, documents)
- Single platform — fewer services to integrate and operate

Cons:
- Relational structure means industry-specific lead fields (e.g. "preferred doctor" vs "applied role" vs "property interest") need to go into a flexible JSON column rather than being natively schema-free

**Option B: MongoDB (Atlas)**

Pros:
- Flexible document schema — each lead can carry different fields per industry with no migrations
- Generous free tier
- Familiar to teams with prior Node/Mongo experience

Cons:
- No built-in authentication — requires a separate auth provider (e.g. Clerk, Auth.js)
- No built-in tenant isolation — every query must manually filter by `tenantId`; a missed filter risks cross-tenant data exposure
- No built-in realtime or storage — separate services needed
- More services to integrate and maintain overall

**Recommendation**: Supabase, primarily because tenant isolation is enforced at the database level rather than relying on application code to always filter correctly — this is the single highest-risk area in a multi-tenant SaaS. The lead-schema flexibility gap is easily solved with a JSON column for industry-specific fields.

## 8. Phase 1 Scope (Deliverables)

1. **Owner dashboard** — signup, onboarding wizard, business configuration, embed code generation, widget customization, conversation/lead view.
2. **Website chat widget** — embeddable React component, multilingual conversation powered by the brain API, using the business's configured FAQ/context data.
3. **Calendar integration** — Google Calendar and Outlook connectors via a shared interface, enabling real appointment booking through the chatbot.
4. **Data persistence** — all conversations, extracted lead details, summaries, sentiment, and lead scores stored per tenant in the database.

## 9. WhatsApp Integration Plan (Future Phase)

Once Phase 1 is stable, WhatsApp becomes a second channel adapter on top of the same brain API:

- Owner connects their WhatsApp Business number (Meta Cloud API) from the dashboard.
- Incoming WhatsApp messages are routed to the brain API exactly like widget messages, tagged with `source: whatsapp`.
- Replies, lead capture, and bookings work identically — no changes to the brain's core logic.
- Conversations from WhatsApp appear in the same dashboard feed as website chats, distinguished by channel.

## 10. Voice Integration (TBD)

Voice (inbound phone calls) is planned for a later phase and is intentionally out of scope for now. When taken up, it will follow the same adapter pattern — a voice platform (such as Bolna, chosen for strong Hindi/Marathi/Tamil support) will connect to the same brain API via a webhook, with call transcripts and recordings feeding into the same lead-processing pipeline. Exact platform, cost model, and rollout timeline to be finalized closer to that phase.

## 11. Roadmap Overview (Beyond Phase 1)

- **Phase 2**: Harden the brain API into a versioned, documented multi-tenant service; add usage tracking and CRM export.
- **Phase 3**: WhatsApp integration (see above).
- **Phase 4**: AI intelligence layer at scale — automated alerts for hot leads and urgent/angry conversations.
- **Phase 5**: Voice integration (see above, TBD).
- **Phase 6**: Branded voice cloning and additional industry templates (Recruitment, Real Estate, Education), reusing the Phase 1 architecture.