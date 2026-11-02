Section 05 uses a compact responsive player with four stories. “Across India” follows the Website story and plays nine short customer-and-AI exchanges continuously: Tamil, Telugu, Bengali, Kannada, Malayalam, Gujarati, Punjabi, Odia and Urdu. Hindi and Marathi remain in the earlier stories. Each added language includes both a customer question and an AI reply, native-script captions, an English translation, and a button to seek to that language. Urdu uses right-to-left text. These are illustrative, generated appointment enquiries; no appointment-booking capability is implied by the sample.

The How it works video uses an expressive Indian-English male voice (`en-in-advisor-3`) with conversational delivery. Desktop and portrait visuals and captions are retimed to the new narration. The original supplied hero recording is unchanged.

Sources:

- `apps/web/scripts/assets/multilingual-conversation.json`: editable native scripts and translations. Review regional pronunciation with native speakers before using the demo as a voice-quality benchmark.
- `apps/web/scripts/generate-natural-landing-audio.mjs`: offline speech generation, normalization and video retiming. Reads the existing local Gemini key; no credentials or runtime speech calls are sent to the frontend. Cached individual takes live in the OS temporary directory `bolegaindia-landing-audio`.
- Run `node apps/web/scripts/generate-natural-landing-audio.mjs` for the multilingual MP3 and timed manifest. Set `AUDIO_TASK=workflow` for narration and responsive videos. `LANDING_TTS_MODEL` optionally selects the speech model; rate-limited requests retry with backoff.
- The source videos `how-it-works-indian-{wide,portrait}.mp4` supply the original product animation. Active videos are `how-it-works-natural-{wide,portrait}.mp4`, with `how-it-works-natural.vtt` captions. The multilingual audio is `audio/reels/across-india.mp3`.

Playback starts only after user interaction, coordinates with the other landing-page players, and pauses offscreen or when the tab is hidden. Audio uses `preload="none"`. Reduced-motion preferences disable decorative photo animation.

Validation: workspace build and type checks passed, as did all 16 web tests and the boundary check. Browser checks passed for every language jump, Urdu direction, offscreen pause and narrated video playback. No page overflow or clipped player content at 320, 375, 568, 700, 701, 768, 1024, 1440, 1920 and 2560 pixels. No lint script is configured. The multilingual sample lasts 72.16 seconds; the updated walkthrough lasts 43.56 seconds. Remove the corresponding cached take after changing its source text to regenerate it.
