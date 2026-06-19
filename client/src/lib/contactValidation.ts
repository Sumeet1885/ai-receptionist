export type ContactField = 'phone' | 'email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_PATTERN = /^\d{10}$/;
const ASCENDING_SEQUENCE = '01234567890123456789';

export function validateContactInput(field: ContactField, value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: `Please enter your ${field}.`,
    };
  }

  if (field === 'email') {
    const normalized = trimmed.toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      return {
        valid: false,
        normalized,
        error: 'Please enter a valid email address like name@example.com.',
      };
    }

    return { valid: true, normalized, error: '' };
  }

  if (!PHONE_PATTERN.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter exactly 10 digits with no spaces or symbols.',
    };
  }

  if (/^(\d)\1{9}$/.test(trimmed) || ASCENDING_SEQUENCE.includes(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter a real phone number, not a repeated or sequential pattern.',
    };
  }

  return { valid: true, normalized: trimmed, error: '' };
}
