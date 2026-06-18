# Chat Timezone and Voice Transcripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the visitor timezone from standalone React chat and persist Gemini Live user-speech transcripts once per completed voice turn.

**Architecture:** Add one pure client helper for timezone-aware request bodies and one pure server-side transcript accumulator for Gemini protocol events. Wire these tested units into the existing chat hook and Live WebSocket controller without restructuring either subsystem.

**Tech Stack:** React, TypeScript, Node.js built-in test runner, tsx, Gemini Live WebSocket protocol, Supabase.

---

### Task 1: Standalone chat timezone

**Files:**
- Create: `client/src/lib/chatRequest.ts`
- Modify: `client/src/hooks/useChat.ts`
- Test: `test/chatRequest.test.ts`

- [x] Write tests asserting that `createChatReplyBody` includes the resolved IANA timezone and falls back to `Asia/Kolkata` when resolution throws or returns an empty string.
- [x] Run `server/node_modules/.bin/tsx --test test/chatRequest.test.ts` and confirm failure because the helper does not exist.
- [x] Implement `resolveVisitorTimezone` and `createChatReplyBody`, then use the helper in `useChat.sendMessage`.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Gemini Live user transcript persistence

**Files:**
- Create: `server/src/services/llm/liveInputTranscript.ts`
- Modify: `server/src/controllers/liveChatController.ts`
- Test: `test/liveInputTranscript.test.ts`

- [x] Write tests for camelCase and snake_case Gemini transcript fields, fragment accumulation, whitespace filtering, clearing after a successful flush, and retaining text after a failed flush.
- [x] Run `server/node_modules/.bin/tsx --test test/liveInputTranscript.test.ts` and confirm failure because the accumulator does not exist.
- [x] Implement the transcript accumulator with `accept(response)` and asynchronous `flush(save)` operations.
- [x] Add `input_audio_transcription: {}` to Gemini Live setup, feed every server response into the accumulator before interruption handling, flush on `turnComplete`, and flush again on client disconnect.
- [x] Re-run the focused test and confirm it passes.

### Task 3: Full verification

**Files:**
- Verify all modified and created files.

- [x] Run `server/node_modules/.bin/tsx --test test/chatRequest.test.ts test/liveInputTranscript.test.ts` and confirm all regression tests pass.
- [x] Run `npm exec tsc -- --noEmit -p server/tsconfig.json` and confirm server compilation succeeds.
- [x] Run `npm run build --prefix client` and confirm the production client build succeeds.
- [x] Inspect `git diff --check` and `git diff` to confirm no unrelated user changes were overwritten.
