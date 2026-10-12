# Third-Party and Outside Services Registry

This document lists and details all external and third-party services integrated into the **AI Receptionist** project. It specifies where they are utilized (Client-side, Server-side, or both), their purpose, and relevant configuration details.

---

## 1. Supabase
* **Service Category:** Database, Authentication, and Backend-as-a-Service (BaaS)
* **Usage Location:** Both **Client-Side** and **Server-Side**
* **Purpose:**
  * **Client-Side:** Manages user authentication (sign-in, sign-up, session state) in the React dashboard. Queries public configuration data.
  * **Server-Side:** The Express server acts as a trusted client using the Supabase Service Role Key to perform admin database operations, bypass Row-Level Security (RLS) when executing anonymous widget operations, and manage database migrations.
* **Environment Variables:**
  * Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  * Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
* **Key Files / Integration Points:**
  * Client Service: [`client/src/services/supabase.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/client/src/services/)
  * Database Migrations: [`server/supabase/migrations/`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/supabase/migrations/)

---

## 2. Google Cloud Platform (GCP) & Google Workspace
* **Service Category:** Identity Provider & Productivity APIs
* **Usage Location:** Both **Client-Side** (Auth) and **Server-Side** (Calendar API)
* **Purpose:**
  * **Client-Side:** Authenticates dashboard owners via Google Sign-In (integrated through Supabase Auth).
  * **Server-Side:** Connects Google Calendar accounts of business owners to check availability and book appointments on their behalf.
* **Scopes Requested:**
  * `openid`, `email`, `profile` (Identity)
  * `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.readonly` (Calendar access)
* **Environment Variables:**
  * Server: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
* **Key Files / Integration Points:**
  * Express Controller: [`server/src/controllers/calendarController.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/controllers/calendarController.ts)
  * Google Calendar Adapter: [`server/src/services/calendar/googleCalendar.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/services/calendar/)

---

## 3. Microsoft Entra ID & Microsoft Graph
* **Service Category:** Identity Provider & Productivity APIs
* **Usage Location:** Both **Client-Side** (OAuth Flow redirection) and **Server-Side** (Graph API)
* **Purpose:**
  * **Server-Side:** Connects Outlook Calendar accounts of business owners to check availability and book appointments.
* **Environment Variables:**
  * Server: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`
* **Key Files / Integration Points:**
  * Outlook Adapter: [`server/src/services/calendar/outlookCalendar.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/services/calendar/)
  * Dependencies: `@microsoft/microsoft-graph-client`

---

## 4. Google Gemini API (Google AI Studio)
* **Service Category:** Large Language Model & Conversational AI API
* **Usage Location:** **Server-Side** (Client proxies all voice/typed sessions through the server)
* **Purpose:**
  * **Typed Chat:** Handles normal text-based conversations between visitors and bots using `gemini-2.5-flash-lite`.
  * **Live Voice:** Establishes a server-side WebSocket session using `models/gemini-3.1-flash-live-preview` (Gemini Live API) to stream bidirectional audio and run real-time tools.
* **Environment Variables:**
  * Server: `GEMINI_API_KEY`, `GEMINI_MODEL` (Optional)
* **Key Files / Integration Points:**
  * Voice WebSocket Controller: [`server/src/controllers/liveChatController.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/controllers/liveChatController.ts)
  * LLM Guard & Rules: [`server/src/services/geminiGuard.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/services/geminiGuard.ts)
  * Tool Execution: [`server/src/services/liveTools.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/services/liveTools.ts)

---

## 5. Groq Cloud API
* **Service Category:** Large Language Model Inference Platform
* **Usage Location:** **Server-Side Only**
* **Purpose:**
  * Executes background lead analysis (`llama-3.1-8b-instant`) once a typed or voice conversation ends. Parses transcripts to extract customer names, phone numbers, emails, project requirements, sentiment, lead scores, and booking status.
* **Environment Variables:**
  * Server: `GROQ_API_KEY`
* **Key Files / Integration Points:**
  * Lead Controller: [`server/src/controllers/leadController.ts`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/controllers/leadController.ts)

---

## 6. Dograh Platform
* **Service Category:** Self-Hosted / Managed Telephony & Voice Agent System
* **Usage Location:** Both **Client-Side** (Provisioning UI & Analytics) and **Server-Side** (API client & sync poller)
* **Purpose:**
  * **Client-Side:** Provides a UI workspace to provision phone numbers, view phone call history, transcripts, and call recordings.
  * **Server-Side:** Communicates with Dograh's REST API. Packages receptionist configurations into workflows (`POST /workflow/create/definition`), links active phone numbers, triggers outbound dialing (`POST /telephony/initiate-call`), and syncs finished call records (runs) into the local database via a process-local poller (`callPoller.ts`).
  * *Note: Dograh itself connects to upstream telephony carriers (like Plivo) to manage cellular/PSTN networks.*
* **Environment Variables:**
  * Server: `DOGRAH_API_URL`, `DOGRAH_API_KEY`, `DOGRAH_POLL_INTERVAL_MS`, `PHONE_TOOLS_API_KEY`, `PHONE_TOOLS_CALLBACK_BASE_URL`
* **Key Files / Integration Points:**
  * Server Module: [`server/src/modules/phone-calls/`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/server/src/modules/phone-calls/)
  * Client Module: [`client/src/modules/phone-calls/`](file:///d:/Dev/Ai-Receptionist/ai-receptionist/client/src/modules/phone-calls/)
