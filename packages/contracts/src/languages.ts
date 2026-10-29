// Indian languages the receptionist supports, in the order we show them. Used by the landing
// page (greeting wall and FAQ) and the free-access form; English is supported as well.

export interface SupportedLanguage {
  name: string;
  /** A greeting in the language's own script, for the landing page. */
  greeting: string;
  /** How the greeting reads in Latin letters. */
  romanised: string;
  /** BCP 47 code, for lang attributes. */
  code: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { name: 'Hindi', greeting: 'नमस्ते', romanised: 'Namaste', code: 'hi' },
  { name: 'Tamil', greeting: 'வணக்கம்', romanised: 'Vanakkam', code: 'ta' },
  { name: 'Telugu', greeting: 'నమస్కారం', romanised: 'Namaskaram', code: 'te' },
  { name: 'Bengali', greeting: 'নমস্কার', romanised: 'Nomoskar', code: 'bn' },
  { name: 'Kannada', greeting: 'ನಮಸ್ಕಾರ', romanised: 'Namaskara', code: 'kn' },
  { name: 'Malayalam', greeting: 'നമസ്കാരം', romanised: 'Namaskaram', code: 'ml' },
  { name: 'Marathi', greeting: 'नमस्कार', romanised: 'Namaskar', code: 'mr' },
  { name: 'Gujarati', greeting: 'નમસ્તે', romanised: 'Namaste', code: 'gu' },
  { name: 'Punjabi', greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', romanised: 'Sat Sri Akal', code: 'pa' },
  { name: 'Odia', greeting: 'ନମସ୍କାର', romanised: 'Namaskar', code: 'or' },
  { name: 'Urdu', greeting: 'آداب', romanised: 'Adaab', code: 'ur' },
];

/** "Hindi, Tamil, … and Urdu" */
export const SUPPORTED_LANGUAGE_LIST = `${SUPPORTED_LANGUAGES.slice(0, -1).map((l) => l.name).join(', ')} and ${SUPPORTED_LANGUAGES[SUPPORTED_LANGUAGES.length - 1].name}`;
