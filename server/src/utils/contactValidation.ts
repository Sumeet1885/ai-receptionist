export type ContactField = 'phone' | 'email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_ALLOWED_PATTERN = /^[0-9+\-\s().]+$/;

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

  if (!PHONE_ALLOWED_PATTERN.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter a valid phone number using digits and symbols like +, -, or spaces only.',
    };
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter a valid phone number with 7 to 15 digits.',
    };
  }

  return { valid: true, normalized: trimmed, error: '' };
}
