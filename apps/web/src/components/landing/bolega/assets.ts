const base = '/bolegaindia';

export const landingAssets = {
  logo: `${base}/images/bolegaindia-logo.svg`,
  brandWeave: `${base}/images/bolegaindia-brand-weave.svg`,
  heroIndiaArtwork: `${base}/images/hero-india-culture-artwork.svg`,
  heroAiAssistant: `${base}/images/hero-ai-assistant.webp`,
  heroCustomerGroup: `${base}/images/hero-customer-group-transparent.webp`,
  conversationAudio: `${base}/audio/bolegaindia-conversation.mp3`,
  productStoryWide: `${base}/video/product-story-wide.mp4`,
  productStoryWidePoster: `${base}/images/product-story-wide-poster.jpg`,
  productStoryPortrait: `${base}/video/product-story-portrait.mp4`,
  productStoryPortraitPoster: `${base}/images/product-story-portrait-poster.jpg`,
  productStoryCaptions: `${base}/video/product-story-captions.vtt`,
} as const;

/** The conversation recording is two takes joined end to end (17.28 s + 6.32 s). */
export const conversationRecording = {
  label: 'Conversation',
  duration: 23.6,
  // 64 RMS bins computed from the recording itself, normalised to the loudest bin.
  waveform: [
    0.584, 0.536, 0.796, 0.463, 0.422, 0.247, 0.08, 0.71, 0.822, 0.915, 0.535, 0.08, 0.311, 0.603, 0.27, 0.33,
    0.62, 0.802, 0.832, 0.829, 0.652, 0.08, 0.657, 0.851, 0.853, 0.343, 0.08, 0.595, 0.239, 0.08, 0.816, 0.652,
    0.583, 0.158, 0.08, 0.574, 0.722, 0.453, 0.08, 0.764, 0.161, 0.894, 0.279, 0.271, 0.912, 0.348, 0.155, 0.549,
    0.69, 0.256, 0.49, 0.656, 0.667, 0.623, 0.65, 0.441, 0.938, 0.603, 1, 0.396, 0.667, 0.707, 0.654, 0.091,
  ],
} as const;
