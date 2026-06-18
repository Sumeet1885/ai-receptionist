# Chat Timezone and Voice Transcript Design

## Goal

Ensure standalone React chat sends the visitor's IANA timezone and reliably persist visitor speech transcribed by Gemini Live.

## Design

Standalone chat will resolve the browser timezone immediately before each request and include it in the existing `POST /api/chat/reply` body. A small timezone helper will fall back to `Asia/Kolkata` if browser resolution fails or returns an empty value.

The Gemini Live setup will request input-audio transcription. The server will accept both camelCase and snake_case transcription fields from Gemini's WebSocket protocol, accumulate non-empty user transcript fragments, and persist one `messages` row with `sender: user` when Gemini marks the turn complete. Any remaining transcript will be flushed when the client socket closes. Successful persistence clears the buffer; failed persistence retains it so disconnect handling can retry. Bot transcript behavior remains unchanged.

## Error Handling

- Empty transcription fragments do not create messages.
- Database insert failures are logged and leave buffered text available for a later flush.
- Duplicate close/turn-complete flushes do not create duplicates because successful flushes clear the buffer.
- Existing voice audio and appointment-tool behavior is unchanged.

## Verification

- Unit-test browser timezone resolution and request payload composition.
- Unit-test fragmented transcription, protocol field variants, empty input, successful flush, failed flush, and retry behavior.
- Run server TypeScript compilation and the client production build.

