export type ContactField = 'phone' | 'email';

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
const PHONE_PATTERN = /^\d{10}$/;
const ASCENDING_SEQUENCE = '01234567890123456789';
const DESCENDING_SEQUENCE = '98765432109876543210';

function isValidEmail(value: string): boolean {
  if (value.length > 254 || value.includes('..')) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.')) return false;
  if (!EMAIL_LOCAL_PATTERN.test(local)) return false;

  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label =>
    !label
    || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  )) return false;

  return /^[a-z]{2,63}$/i.test(labels[labels.length - 1]);
}

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
    if (!isValidEmail(normalized)) {
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

  if (
    /^(\d)\1{9}$/.test(trimmed)
    || /^(\d{2,5})\1+$/.test(trimmed)
    || ASCENDING_SEQUENCE.includes(trimmed)
    || DESCENDING_SEQUENCE.includes(trimmed)
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter a real phone number, not a repeated or sequential pattern.',
    };
  }

  return { valid: true, normalized: trimmed, error: '' };
}
