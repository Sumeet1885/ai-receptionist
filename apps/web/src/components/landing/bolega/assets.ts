import suppliedConversation from './suppliedConversation.json';

const base = '/bolegaindia';

export const landingAssets = {
  logo: `${base}/brand/bolegaindia-logo.png`,
  brandWeave: `${base}/images/bolegaindia-brand-weave.svg`,
  heroIndiaArtwork: `${base}/images/hero-india-culture-artwork.svg`,
  heroAiAssistant: `${base}/images/hero-male-assistant.webp?v=2`,
  businessFemaleAssistant: `${base}/images/business-female-human-ai.webp?v=5`,
  businessFemaleAssistantSmall: `${base}/images/business-female-human-ai-600.webp?v=5`,
  closingAiAssistant: `${base}/images/closing-ai-human.webp`,
  closingAiAssistantSmall: `${base}/images/closing-ai-human-600.webp`,
  heroCustomerGroup: `${base}/images/hero-customer-group-transparent.webp`,
  conversationAudio: `${base}/audio/hero-conversation-continuous.mp3`,
  productStoryWide: `${base}/video/how-it-works-natural-wide.mp4`,
  productStoryWidePoster: `${base}/images/how-it-works-indian-wide-poster.jpg`,
  productStoryPortrait: `${base}/video/how-it-works-natural-portrait.mp4`,
  productStoryPortraitPoster: `${base}/images/how-it-works-indian-portrait-poster.jpg`,
  productStoryCaptions: `${base}/video/how-it-works-natural.vtt`,
  customerConversationWide: `${base}/video/retail-conversation-wide.mp4`,
  customerConversationPortrait: `${base}/video/retail-conversation-portrait.mp4`,
  customerConversationWidePoster: `${base}/images/retail-conversation-wide-poster.jpg`,
  customerConversationPortraitPoster: `${base}/images/retail-conversation-portrait-poster.jpg`,
  customerConversationCaptions: `${base}/video/retail-conversation.vtt`,
  customerConversationVoice: `${base}/audio/hero-conversation-continuous.mp3`,
} as const;

/** Eleven supplied clips, joined in numeric order without interrupting playback. */
export const conversationRecording = {
  label: 'Conversation',
  duration: suppliedConversation.duration,
  waveform: suppliedConversation.waveform,
} as const;
