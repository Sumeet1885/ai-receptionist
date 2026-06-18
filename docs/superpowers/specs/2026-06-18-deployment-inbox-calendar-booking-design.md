# Deployment, Inbox, Calendar, and Booking Reliability Design

## Goals

1. Replace the clipped post-creation dialog with the approved action-first deployment modal.
2. Make Inbox show persisted conversations or a visible actionable error.
3. Make Calendar show real appointment records instead of permanent placeholder content.
4. Prevent the receptionist from contradicting calendar results or claiming unsupported confirmation actions.

## Deployment Modal

The modal uses a viewport-bounded shell with a sticky header and footer. Only its body scrolls. The body contains three ordered actions:

1. Public chat link with copy and open actions.
2. Website widget script with copy action.
3. AI-developer prompt retained as a compact secondary card.

The “This script is local-only” warning block is removed. Copy feedback remains. The dialog begins near the top on small screens and is centered on larger screens without allowing content outside the viewport.

## Inbox

Inbox reads `chat_sessions.started_at`, matching the deployed schema. The hook exposes loading and error states instead of turning query failures into an empty array. Message-summary failures are also visible. The view distinguishes loading, error with retry, true empty state, and populated conversations.

## Calendar

Calendar fetches appointments directly through the authenticated Supabase client. Existing RLS policies restrict rows to bots owned by the current user. Appointment rows are mapped to the existing `Appointment` application type and divided into upcoming and past sections. Calendar connection status and appointment loading are independent: saved appointments remain visible even when the connection-status endpoint is unavailable or disconnected.

The Calendar view includes explicit loading, error with retry, empty, upcoming, and past states. It never renders hard-coded “No recent bookings” when rows exist.

## Booking Reliability

Availability labels are formatted explicitly in the visitor’s IANA timezone. After an availability tool response, server code creates the user-facing list instead of asking Gemini to restate raw slots. After a booking tool response, server code creates confirmation or failure text directly from the backend result.

The receptionist must not claim that SMS, phone, or email confirmation was sent because no notification service exists. Typed chat will reject a booking tool call when the supplied phone number cannot be found in visitor-authored conversation text, preventing the model from inventing contact information.

Booking-time validation remains backend-controlled: the selected instant must exactly match a fresh available slot, and only successful external calendar creation plus database persistence produces confirmation.

## Compatibility and Security

No table schema change is required. Existing RLS policies remain in force. The separate finding that `public.profiles` has RLS disabled will be reported but not changed in this scope because enabling it safely requires an explicit access-policy decision.

## Verification

- Unit tests cover session mapping, appointment mapping/grouping, timezone-aware slot formatting, deterministic availability/booking replies, and phone provenance validation.
- Client and server TypeScript builds must pass.
- The deployment modal is checked at desktop and narrow viewport sizes.
- Live Supabase table metadata confirms the queried columns match the deployed schema.

