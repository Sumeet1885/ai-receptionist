# Pre-call Voice Contact Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect owner-selected phone/email fields before starting Gemini Live voice so the model does not need mid-call contact input tools.

**Architecture:** The public preview and embedded widget gate `startVoice` behind a local validated contact form. The live websocket receives preverified contact values in its connection URL, validates them again server-side, seeds `LiveContactCollection`, and tells Gemini these contact fields are already verified. Mid-call `request_text_input` remains as a defensive fallback only for missing values, not the normal path.

**Tech Stack:** React/TypeScript client, generated embedded widget JavaScript, Express/WebSocket backend, Supabase session persistence, existing `validateContactInput` utilities.

---

### Task 1: Backend preverified contact seeding

**Files:**
- Modify: `server/src/utils/contactValidation.ts`
- Modify: `server/src/controllers/liveChatController.ts`
- Test: `server/tests/liveVoiceEndCall.test.ts`

- [ ] Add tests that require a helper for server-validating pre-collected contact values and assert the live controller reads `preverifiedContacts`.
- [ ] Implement `seedVerifiedContactInputs(collection, values)` using existing `validateContactInput`.
- [ ] Parse `preverifiedContacts` from the websocket URL as JSON `{ phone?: string, email?: string }`.
- [ ] Validate and seed those fields before building `bookAppointmentRequired`.
- [ ] Build `missingContactFields` from owner-selected required fields minus server-verified fields.
- [ ] Pass `missingContactFields` to `buildWebVoiceExtraConstraints` and `buildLiveFunctionDeclarations`.
- [ ] Add an initial Gemini context message listing server-verified fields, without exposing unverified data.
- [ ] Run `npm test -- --test-reporter=spec tests/liveVoiceEndCall.test.ts`.

### Task 2: Public preview pre-call form

**Files:**
- Modify: `client/src/hooks/useLiveVoice.ts`
- Modify: `client/src/components/chat/VoiceCallView.tsx`
- Modify: `client/src/components/chat/PublicChatView.tsx`
- Test: `server/tests/liveVoiceEndCall.test.ts`

- [ ] Add tests that assert the public voice hook accepts preverified contacts and encodes them into `/api/chat/live`.
- [ ] Add tests that assert the public voice UI shows a pre-call contact stage before calling `startVoice`.
- [ ] Update `useLiveVoice.startVoice(preverifiedContacts?)` to append `preverifiedContacts` to the websocket URL.
- [ ] Update `PublicChatView` to pass owner-selected phone/email fields into `VoiceCallView`.
- [ ] Update `VoiceCallView` to collect those fields before calling `startVoice`.
- [ ] Preserve existing in-call requested input UI as fallback.
- [ ] Run `npm run build` in `client`.

### Task 3: Embedded widget pre-call form

**Files:**
- Modify: `server/src/controllers/widgetController.ts`
- Test: `server/tests/liveVoiceEndCall.test.ts`
- Test: `server/tests/widgetProtocol.test.ts`

- [ ] Add tests that assert `REQUIRED_VOICE_CONTACT_FIELDS` is embedded and the mic click calls a pre-call gate before `startVoice`.
- [ ] Add `REQUIRED_VOICE_CONTACT_FIELDS` from `widgetConfig.requiredLeadFields` filtered to `phone`/`email`.
- [ ] Reuse the existing phone/email voice input UI to collect pre-call fields before websocket creation.
- [ ] Store validated `preverifiedVoiceContacts`.
- [ ] Append `preverifiedContacts` to `/api/chat/live`.
- [ ] Keep mic muted behavior only for active call input fallback.
- [ ] Run widget protocol and live voice tests.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run server live voice tests.
- [ ] Run server typecheck.
- [ ] Run client build.
- [ ] Run `git diff --check`.
- [ ] Review diff for accidental removal of phone/email validation, mic muting, or booking guard.

### Self-review

- Spec coverage: backend seeding, public preview pre-call gate, embedded widget pre-call gate, validation, booking guard, and verification are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: uses existing `ContactField`, `LiveContactCollection`, `validateContactInput`, and voice websocket path names.
