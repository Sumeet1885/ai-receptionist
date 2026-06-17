# AI Receptionist — Phase 1 Engineering PRD

---

## 1. Current State Audit

### What has been built

The project today is a monorepo with two workspaces (`client/` and `server/`) and a root-level orchestrator `package.json`. Below is a file-by-file inventory of what exists and what each piece delivers.

---

### 1.1 Client (`client/`)

| File | Purpose | Status |
|---|---|---|
| `src/App.tsx` | Root component. Manages all view routing (`landing`, `auth-signin`, `auth-signup`, `onboarding`, `dashboard`, `public-chat`), Supabase auth listener, bot/lead state, chat session lifecycle. | **Working** — but monolithic. All state and business logic lives in a single 370-line component. |
| `src/main.tsx` | React 19 entry point, renders `<App />` into `#root`. | **Working** |
| `src/index.css` | ~29 KB of hand-written CSS + Tailwind v4 theme tokens (`--color-brand-*`). Defines the full dark-mode design system. | **Working** |
| `src/lib/supabaseClient.ts` | Initializes `@supabase/supabase-js` client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` env vars. | **Working** |
| `src/types/index.ts` | TypeScript interfaces: `Bot`, `Lead`, `Message`, `Toast`. | **Working** — but missing `Profile`, `ChatSession`, `CalendarEvent` types needed by Phase 1. |
| `src/constants/initialData.ts` | Hardcoded seed data: 2 sample bots (Apex Academy, Smile Dental) and 3 sample leads. | **Legacy** — was used before Supabase integration. Still imported by `.js` duplicates but no longer used by the `.tsx` code path. |
| `src/services/gemini.ts` | Client-side Gemini API caller with retry logic + `analyzeLead` function. | **Legacy** — should be deleted. All LLM calls now go through Supabase Edge Functions. |
| `src/services/speech.ts` | Browser `SpeechSynthesis` wrapper for text-to-speech toggle in the chat UI. | **Working** |
| `src/services/seedDemo.ts` | On first login, checks if user has bots; if not, inserts a demo bot + session + messages + lead into Supabase. | **Working** |
| `src/components/LandingView.tsx` | Marketing landing page with parallax scroll hero, feature grid, stats, industry cards. Premium dark/emerald theme. | **Working** |
| `src/components/AuthView.tsx` | Sign-in / sign-up page. Google OAuth, Microsoft OAuth, email/password. Matches landing page aesthetic. | **Working** |
| `src/components/Header.tsx` | Sticky navbar. Shows "Sign In" + "Create an account" for guests; user email + "Sign Out" for authenticated users. | **Working** |
| `src/components/Footer.tsx` | Simple footer with copyright, Terms, Privacy, API Status links. | **Working** |
| `src/components/OnboardingView.tsx` | Bot creation wizard: business name, industry selector, greeting, knowledge base, color theme, languages. | **Working** — but still shows an "Optional Custom Gemini API Key" field that is no longer used. |
| `src/components/DashboardView.tsx` | Owner console: bot selector, lead table (with score/sentiment badges), bot settings panel, embed code generator, stats cards. 514 lines. | **Working** — but large and not split into sub-components. |
| `src/components/PublicChatView.tsx` | Chat simulator with fake browser chrome. Desktop/mobile toggle, speech toggle, message bubbles, typing indicator. | **Working** |
| `src/components/Icons.tsx` | Inline SVG icon library: Bot, Chat, Users, TrendingUp, Settings, ExternalLink, Copy, Check, Plus, Globe, ArrowRight, Trash, Calendar, Shield, Volume, Sparkles, Google, Microsoft. | **Working** |
| `src/components/Toast.tsx` | Notification toast component (success/error). | **Working** |

**Note on `.js` duplicates:** Every `.tsx` component has a parallel `.js` file (e.g., `DashboardView.js` alongside `DashboardView.tsx`). These are leftover build artifacts from an earlier non-TypeScript phase. They are not imported anywhere in the current TypeScript code path and should be deleted.

---

### 1.2 Server (`server/`)

| File | Purpose | Status |
|---|---|---|
| `supabase/migrations/001_schema.sql` | Full Postgres schema: `profiles` (auto-created via trigger on `auth.users`), `bots`, `chat_sessions`, `messages`, `leads`. All tables have RLS policies for tenant isolation. | **Working** — solid foundation. Missing `calendar_connections` and `appointments` tables needed for Phase 1. |
| `supabase/functions/chat-reply/index.ts` | Deno Edge Function. Receives `{ sessionId, userMessage }`, resolves session → bot, fetches last 20 messages, calls `chatController.handleChat` (Gemini), persists messages, fires `analyze-lead` in background. | **Working** |
| `supabase/functions/analyze-lead/index.ts` | Deno Edge Function. Receives `{ sessionId, botId, transcript }`, calls `leadController.analyzeLead` (Gemini structured output), upserts into `leads` table. | **Working** |
| `supabase/functions/deno.json` | Deno import map for Supabase Edge Functions runtime. | **Working** |
| `controllers/chatController.ts` | Builds system prompt from bot config + knowledge base, constructs rolling history prompt, calls Gemini REST API, returns reply. | **Working** — but uses `bot.businessName` / `bot.knowledgeBase` (camelCase) while the database columns are `business_name` / `knowledge_base` (snake_case). The Edge Function maps these before calling the controller, so it works, but the type mismatch is fragile. |
| `controllers/leadController.ts` | Sends transcript to Gemini with a strict JSON response schema (`RESPONSE_SCHEMA`). Parses structured lead data (name, phone, requirement, budget, leadScore, sentiment, summary, appointmentStatus) and upserts into `leads`. | **Working** |
| `types/index.ts` | Server-side `Bot` and `Message` interfaces. | **Working** — but duplicates the client types. |
| `package.json` | Scripts: `deploy:functions` and `db:migrate`. Dev dependency: `supabase` CLI. | **Working** |
| `tsconfig.json` | Server TypeScript config. | **Working** |

---

### 1.3 Root Level

| File | Purpose |
|---|---|
| `package.json` | Workspace orchestrator. `dev` → runs client dev server. `build` → builds client. `install:all` → installs both workspaces. |
| `tsconfig.json` | Root TypeScript config (references client). |
| `target.md` | The product vision document (the one you wrote). |

---

## 2. Gap Analysis: Current State vs target.md Phase 1

| target.md Requirement | Current Status | Gap |
|---|---|---|
| Owner sign-up / login (email or Google) | ✅ AuthView with Google, Microsoft, email/password. Supabase Auth integrated. | Microsoft is via Azure provider — works but needs Azure AD app registration. |
| Onboarding wizard (business name, industry, languages, greeting, FAQ data) | ✅ OnboardingView exists with all fields. | Still shows a vestigial "Custom Gemini API Key" input. Should be removed. |
| Owner connects calendar (Google Calendar or Outlook) via OAuth | ❌ Not implemented | **Major gap.** No calendar tables, no OAuth flow, no booking logic. |
| Owner receives embed snippet (script tag) | ⚠️ DashboardView generates a `<script>` snippet, but it's a placeholder URL. | The snippet references a non-existent hosted widget bundle. Needs a real embeddable widget build. |
| Owner customizes widget appearance (color, position, greeting) | ⚠️ Color and greeting are configurable during onboarding. Position (bottom-left / bottom-right) is not. | Minor gap — add a position selector. |
| Owner views live conversations, leads, and booked appointments | ⚠️ Dashboard shows leads with scores. Conversations (message history) are not viewable. Appointments panel does not exist. | Need a conversation transcript viewer and an appointments tab. |
| Chat widget embedded on business website | ❌ Only an in-app simulator (PublicChatView with fake browser chrome). | **Major gap.** Need a standalone, embeddable `<script>` widget that runs outside this React app. |
| Multilingual conversation | ✅ Gemini handles language matching via system prompt instruction. | Works in practice, but there's no explicit language detection or routing. |
| AI checks calendar availability and books a slot | ❌ Not implemented | **Major gap.** Requires Gemini function-calling + calendar adapter. |
| AI captures contact details naturally | ✅ System prompt instructs lead capture. `analyze-lead` extracts structured data. | Working. |
| Post-conversation summary, sentiment, lead score | ✅ `analyze-lead` Edge Function handles this. | Working. |
| Tenant isolation at DB level | ✅ All tables have RLS policies keyed on `auth.uid()` → `owner_id`. | Solid. |
| Channel-agnostic brain API | ⚠️ `chatController` is channel-agnostic in concept. | But it's tightly coupled to the Deno Edge Function runtime. A proper Express/Fastify server would make it truly reusable across channels. |

---

## 3. Proposed File & Folder Structure (Phase 1 Target)

This structure is designed to be built incrementally from what exists today. Files marked `[EXISTS]` are already in the codebase. Files marked `[NEW]` need to be created. Files marked `[DELETE]` should be removed.

```
AI Receptionist/
│
├── package.json                              [EXISTS] Root workspace orchestrator
├── tsconfig.json                             [EXISTS] Root TS config
├── target.md                                 [EXISTS] Product vision doc
├── PRD.md                                    [NEW]    This file
├── .env.example                              [NEW]    Template for all env vars
├── .gitignore                                [NEW]    Standard ignores
│
├── client/                                   React + Vite frontend
│   ├── package.json                          [EXISTS]
│   ├── tsconfig.json                         [EXISTS]
│   ├── vite.config.ts                        [EXISTS]
│   ├── index.html                            [EXISTS]
│   ├── .env                                  [EXISTS] VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
│   │
│   └── src/
│       ├── main.tsx                          [EXISTS] App entry point
│       ├── App.tsx                           [EXISTS] → Refactor: extract auth/routing into hooks
│       ├── index.css                         [EXISTS] Design system + Tailwind tokens
│       │
│       ├── types/
│       │   └── index.ts                     [EXISTS] → Extend with Profile, ChatSession,
│       │                                              CalendarConnection, Appointment
│       │
│       ├── lib/
│       │   └── supabaseClient.ts            [EXISTS]
│       │
│       ├── hooks/                           [NEW] Custom React hooks
│       │   ├── useAuth.ts                   [NEW]    Auth session + user state
│       │   ├── useBots.ts                   [NEW]    Bot CRUD against Supabase
│       │   ├── useLeads.ts                  [NEW]    Lead fetch + realtime subscription
│       │   └── useChat.ts                   [NEW]    Chat session + message lifecycle
│       │
│       ├── services/
│       │   ├── speech.ts                    [EXISTS]
│       │   ├── seedDemo.ts                  [EXISTS]
│       │   ├── gemini.ts                    [DELETE] Legacy client-side LLM calls
│       │   └── calendar.ts                  [NEW]    Client-side helpers for calendar
│       │                                              OAuth redirect handling
│       │
│       ├── constants/
│       │   ├── initialData.ts               [DELETE] Legacy hardcoded seed data
│       │   └── industries.ts                [NEW]    Industry configs (greeting templates,
│       │                                              knowledge base templates, colors)
│       │
│       ├── components/
│       │   ├── common/                      [NEW] Shared atomic components
│       │   │   ├── Toast.tsx                [EXISTS] → Move here
│       │   │   ├── Icons.tsx                [EXISTS] → Move here
│       │   │   ├── Modal.tsx                [NEW]    Reusable modal shell
│       │   │   └── LoadingSpinner.tsx       [NEW]    Loading state indicator
│       │   │
│       │   ├── layout/                      [NEW] Page shell components
│       │   │   ├── Header.tsx               [EXISTS] → Move here
│       │   │   └── Footer.tsx               [EXISTS] → Move here
│       │   │
│       │   ├── landing/                     [NEW] Landing page sections
│       │   │   ├── LandingView.tsx          [EXISTS] → Move here
│       │   │   ├── HeroSection.tsx          [NEW]    Extract hero from LandingView
│       │   │   ├── FeaturesGrid.tsx         [NEW]    Extract features grid
│       │   │   └── IndustryCards.tsx         [NEW]    Extract industry showcase
│       │   │
│       │   ├── auth/
│       │   │   └── AuthView.tsx             [EXISTS] → Move here
│       │   │
│       │   ├── onboarding/
│       │   │   ├── OnboardingView.tsx       [EXISTS] → Move here; remove Gemini key field
│       │   │   └── CalendarConnect.tsx      [NEW]    Step in wizard to connect
│       │   │                                          Google Calendar or Outlook
│       │   │
│       │   ├── dashboard/                   [NEW] Break up the 514-line DashboardView
│       │   │   ├── DashboardView.tsx        [EXISTS] → Move here; make it a layout shell
│       │   │   ├── StatsCards.tsx            [NEW]    Top-level KPI cards
│       │   │   ├── LeadTable.tsx             [NEW]    Leads tab content
│       │   │   ├── ConversationList.tsx      [NEW]    Conversations tab — session list
│       │   │   ├── ConversationDetail.tsx    [NEW]    Full transcript viewer for a session
│       │   │   ├── AppointmentsTab.tsx       [NEW]    Appointments tab — upcoming bookings
│       │   │   ├── BotSettings.tsx           [NEW]    Bot config editor
│       │   │   └── EmbedCodePanel.tsx        [NEW]    Widget embed snippet generator
│       │   │
│       │   └── chat/
│       │       └── PublicChatView.tsx        [EXISTS] → Move here
│       │
│       └── [DELETE] *.js files              All legacy .js duplicates in src/ and
│                                             src/components/ should be removed:
│                                             App.js, main.js, DashboardView.js,
│                                             Footer.js, Header.js, Icons.js,
│                                             LandingView.js, OnboardingView.js,
│                                             PublicChatView.js, Toast.js,
│                                             supabaseClient.js, gemini.js,
│                                             speech.js, initialData.js, index.js
│
├── server/                                   Backend: Edge Functions + Express brain API
│   ├── package.json                          [EXISTS] → Add express, googleapis,
│   │                                                    @microsoft/microsoft-graph-client
│   ├── tsconfig.json                         [EXISTS]
│   │
│   ├── src/                                  [NEW] Express API server (the "brain")
│   │   ├── index.ts                         [NEW]    Express app entry point
│   │   ├── config.ts                        [NEW]    Env var loader + validation
│   │   │
│   │   ├── middleware/                      [NEW]
│   │   │   ├── auth.ts                      [NEW]    Validate Supabase JWT from
│   │   │   │                                          Authorization header
│   │   │   ├── tenantContext.ts             [NEW]    Extract tenantId from JWT,
│   │   │   │                                          attach to req
│   │   │   └── errorHandler.ts              [NEW]    Global error handler
│   │   │
│   │   ├── routes/                          [NEW]
│   │   │   ├── chat.routes.ts               [NEW]    POST /api/chat/reply
│   │   │   ├── calendar.routes.ts           [NEW]    GET /api/calendar/auth-url
│   │   │   │                                          GET /api/calendar/callback
│   │   │   │                                          GET /api/calendar/availability
│   │   │   │                                          POST /api/calendar/book
│   │   │   └── webhook.routes.ts            [NEW]    POST /api/webhook/whatsapp
│   │   │                                              (stubbed for Phase 2+)
│   │   │
│   │   ├── controllers/
│   │   │   ├── chatController.ts            [EXISTS] → Move here from server/controllers/
│   │   │   ├── leadController.ts            [EXISTS] → Move here from server/controllers/
│   │   │   └── calendarController.ts        [NEW]    Orchestrates calendar operations
│   │   │
│   │   ├── services/                        [NEW] Pure business logic, no HTTP awareness
│   │   │   ├── llm/
│   │   │   │   ├── geminiClient.ts          [NEW]    Gemini API wrapper (retry, error
│   │   │   │   │                                      handling, structured output)
│   │   │   │   ├── promptBuilder.ts         [NEW]    System prompt construction from
│   │   │   │   │                                      bot config
│   │   │   │   └── functionCalling.ts       [NEW]    Gemini function declarations for
│   │   │   │                                          calendar tools (checkAvailability,
│   │   │   │                                          bookAppointment)
│   │   │   │
│   │   │   ├── calendar/                    [NEW] Calendar abstraction layer
│   │   │   │   ├── calendarInterface.ts     [NEW]    Interface: checkAvailability(),
│   │   │   │   │                                      bookAppointment(), listEvents()
│   │   │   │   ├── googleCalendar.ts        [NEW]    Google Calendar API implementation
│   │   │   │   └── outlookCalendar.ts       [NEW]    Microsoft Graph implementation
│   │   │   │
│   │   │   └── leadAnalyzer.ts              [NEW]    Extracted from leadController —
│   │   │                                              pure Gemini call + parse logic
│   │   │
│   │   └── types/
│   │       └── index.ts                     [EXISTS] → Move here from server/types/;
│   │                                                    extend with CalendarEvent,
│   │                                                    Appointment, CalendarConnection,
│   │                                                    ToolCall types
│   │
│   ├── supabase/                             Supabase-specific config and functions
│   │   ├── config.toml                      [EXISTS]
│   │   │
│   │   ├── migrations/
│   │   │   ├── 001_schema.sql               [EXISTS] Existing schema
│   │   │   └── 002_calendar_and_appointments.sql [NEW] New tables:
│   │   │                                          - calendar_connections (tenant calendar
│   │   │                                            OAuth tokens, provider type)
│   │   │                                          - appointments (bot_id, session_id,
│   │   │                                            title, start_time, end_time,
│   │   │                                            calendar_event_id, status)
│   │   │
│   │   └── functions/
│   │       ├── deno.json                    [EXISTS]
│   │       ├── chat-reply/
│   │       │   └── index.ts                 [EXISTS] → Refactor to call Express brain
│   │       │                                          API instead of importing controllers
│   │       │                                          directly (or keep as-is if deploying
│   │       │                                          controllers within Edge Functions)
│   │       └── analyze-lead/
│   │           └── index.ts                 [EXISTS]
│   │
│   └── [DELETE] controllers/                 Move to server/src/controllers/
│   └── [DELETE] types/                       Move to server/src/types/
│
└── widget/                                   [NEW] Standalone embeddable chat widget
    ├── package.json                          [NEW]
    ├── tsconfig.json                         [NEW]
    ├── vite.config.ts                        [NEW]    Configured to build a single
    │                                                   self-contained JS bundle (IIFE)
    └── src/
        ├── main.tsx                          [NEW]    Entry: reads data-bot-id from
        │                                              <script> tag, mounts widget
        ├── Widget.tsx                        [NEW]    Floating chat bubble + expandable
        │                                              chat window (no fake browser chrome)
        ├── api.ts                            [NEW]    Calls Supabase Edge Function
        │                                              (chat-reply) directly
        └── widget.css                        [NEW]    Self-contained styles, scoped to
                                                       avoid conflicts with host page
```

---

## 4. Database Schema Additions (Migration `002`)

The following tables are required for calendar integration and appointment tracking. They follow the same RLS pattern as the existing schema.

```sql
-- ── calendar_connections ──────────────────────────────────
-- Stores OAuth tokens for each tenant's connected calendar.
CREATE TABLE calendar_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  calendar_id     TEXT,          -- e.g. "primary" for Google, specific calendar ID for Outlook
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_calendar" ON calendar_connections
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── appointments ──────────────────────────────────────────
-- Tracks bookings made through the chat widget.
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id            UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  visitor_name      TEXT,
  visitor_phone     TEXT,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  calendar_event_id TEXT,        -- External ID from Google/Outlook for sync
  status            TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_appointments" ON appointments
  USING (bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()))
  WITH CHECK (bot_id IN (SELECT id FROM bots WHERE owner_id = auth.uid()));
```

---

## 5. Key Architecture Decisions

### 5.1 Edge Functions vs Express Server

The current setup uses Supabase Edge Functions (Deno) as the only backend. This works for chat and lead analysis but creates friction for calendar OAuth flows (which require redirect URLs, token storage, and token refresh — patterns that map better to a persistent server).

**Decision:** Keep Edge Functions for the two existing use-cases (`chat-reply` and `analyze-lead`) since they work. Add a lightweight Express server (`server/src/`) specifically for calendar OAuth handling and as the future home of the "brain API" when WhatsApp/Voice adapters need it. The Express server connects to the same Supabase Postgres database using the service role key.

### 5.2 Calendar Abstraction

Both Google Calendar and Outlook implement a shared interface:

```typescript
interface CalendarAdapter {
  getAuthUrl(tenantId: string): string;
  handleCallback(code: string, tenantId: string): Promise<void>;
  checkAvailability(date: string, tenantId: string): Promise<TimeSlot[]>;
  bookAppointment(slot: TimeSlot, details: BookingDetails): Promise<CalendarEvent>;
}
```

This means the chat controller's function-calling tools (`check_availability`, `book_appointment`) call the interface, never a specific provider. Adding a new calendar provider later is a single file.

### 5.3 Embeddable Widget

The `widget/` workspace produces a single `receptionist-widget.min.js` file via Vite's library mode (IIFE format). A business owner pastes:

```html
<script src="https://cdn.AI Receptionist/widget.js" data-bot-id="UUID"></script>
```

The script reads `data-bot-id`, creates a floating chat bubble in the bottom-right corner, and communicates directly with the `chat-reply` Edge Function. It is completely independent of the `client/` React app.

### 5.4 Gemini Function Calling for Bookings

During a chat, if the visitor expresses intent to book, the system prompt includes Gemini function declarations:

```
Tools available:
- check_availability(date: string) → returns available time slots
- book_appointment(date: string, time: string, name: string, phone: string) → confirms booking
```

When Gemini returns a function call instead of text, the Edge Function executes it against the calendar adapter, then feeds the result back to Gemini for a natural-language confirmation to the visitor.

---

## 6. Build Order (Practical Sequence)

This is the order in which the work should be done to minimize blocking dependencies.

### Sprint 1: Cleanup & Refactor (1-2 days)
1. Delete all `.js` duplicate files from `client/src/`.
2. Delete `client/src/services/gemini.ts` and `client/src/constants/initialData.ts`.
3. Remove the "Custom Gemini API Key" field from `OnboardingView.tsx`.
4. Reorganize `client/src/components/` into the subdirectory structure (`common/`, `layout/`, `landing/`, `auth/`, `onboarding/`, `dashboard/`, `chat/`).
5. Extract custom hooks (`useAuth`, `useBots`, `useLeads`, `useChat`) from `App.tsx`.
6. Move `server/controllers/` and `server/types/` into `server/src/`.

### Sprint 2: Dashboard Enhancements (2-3 days)
1. Break `DashboardView.tsx` (514 lines) into `StatsCards`, `LeadTable`, `ConversationList`, `ConversationDetail`, `BotSettings`, `EmbedCodePanel`.
2. Build `ConversationList` — fetch `chat_sessions` for the active bot, display as a list with last message preview and timestamp.
3. Build `ConversationDetail` — fetch all `messages` for a selected session, render as a scrollable transcript.

### Sprint 3: Calendar Integration (3-5 days)
1. Write migration `002_calendar_and_appointments.sql` and apply it.
2. Scaffold `server/src/` Express app with auth middleware.
3. Implement `googleCalendar.ts` adapter (OAuth 2.0 flow, token storage, availability check, booking).
4. Implement `outlookCalendar.ts` adapter (Microsoft Graph, same interface).
5. Build `CalendarConnect.tsx` component — "Connect Google Calendar" / "Connect Outlook" buttons that initiate the OAuth redirect.
6. Add Gemini function-calling declarations to `chatController.ts` for `check_availability` and `book_appointment`.
7. Build `AppointmentsTab.tsx` in dashboard.

### Sprint 4: Embeddable Widget (2-3 days)
1. Create `widget/` workspace with Vite library-mode config.
2. Build `Widget.tsx` — floating bubble, expandable chat window, self-contained styles.
3. Build `api.ts` — direct calls to Supabase Edge Function using the public anon key.
4. Update `EmbedCodePanel.tsx` to generate a real `<script>` tag pointing to the built widget.
5. Test embedding on a plain HTML page.

### Sprint 5: Polish & QA (1-2 days)
1. Add widget position customization (bottom-left / bottom-right) to onboarding.
2. Add realtime subscription for leads in dashboard (Supabase Realtime).
3. End-to-end test: sign up → create bot → connect calendar → embed widget → visitor chats → lead appears in dashboard → appointment booked.

---

## 7. Environment Variables

```env
# ── Client (.env in client/) ──
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...

# ── Server (.env in server/) ──
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIza...

# Calendar OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4000/api/calendar/callback/google

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=http://localhost:4000/api/calendar/callback/outlook

# Server
PORT=4000
```

---

## 8. What is NOT in Phase 1

These are explicitly deferred per `target.md`:

- WhatsApp channel adapter (Phase 3)
- Voice / phone call integration (Phase 5)
- Usage tracking / billing
- CRM export
- Automated hot-lead alerts
- Voice cloning
- Multi-region deployment
