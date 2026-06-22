export type ContactField = 'phone' | 'email';

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
// E.164 international format: + followed by 7 to 15 digits (e.g. +919876543210)
const PHONE_E164_PATTERN = /^\+[1-9]\d{6,14}$/;
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

  // Accept E.164 format (from react-phone-number-input: e.g. +919876543210)
  if (PHONE_E164_PATTERN.test(trimmed)) {
    // Strip country code to run fake-number checks on subscriber digits only
    const subscriberDigits = trimmed.replace(/^\+\d{1,3}/, '');
    if (
      /^(\d)\1{7,}$/.test(subscriberDigits)
      || ASCENDING_SEQUENCE.includes(subscriberDigits)
      || DESCENDING_SEQUENCE.includes(subscriberDigits)
    ) {
      return {
        valid: false,
        normalized: trimmed,
        error: 'Please enter a real phone number, not a repeated or sequential pattern.',
      };
    }
    return { valid: true, normalized: trimmed, error: '' };
  }

  return {
    valid: false,
    normalized: trimmed,
    error: 'Please enter a valid phone number with country code.',
  };
}

export class LiveContactCollection {
  private pending: ContactField | null = null;
  private readonly verified: Partial<Record<ContactField, string>> = {};

  get pendingField(): ContactField | null {
    return this.pending;
  }

  request(field: ContactField) {
    if (this.pending) {
      return { accepted: false as const, error: `${this.pending} input is still pending` };
    }
    if (this.verified[field]) {
      return { accepted: false as const, error: `${field} is already verified` };
    }
    this.pending = field;
    return { accepted: true as const, field };
  }

  submit(field: ContactField | null, value: string) {
    if (!this.pending) {
      return { accepted: false as const, field, error: 'No contact input is currently requested.' };
    }
    if (field !== this.pending) {
      return {
        accepted: false as const,
        field: this.pending,
        error: `Please submit the requested ${this.pending} before continuing.`,
      };
    }

    const validation = validateContactInput(this.pending, value);
    if (!validation.valid) {
      return { accepted: false as const, field: this.pending, error: validation.error };
    }

    const acceptedField = this.pending;
    this.verified[acceptedField] = validation.normalized;
    this.pending = null;
    return { accepted: true as const, field: acceptedField, value: validation.normalized };
  }

  getVerified(field: ContactField): string | null {
    return this.verified[field] ?? null;
  }

  getMissingVerified(fields: ContactField[]): ContactField[] {
    return [...new Set(fields)].filter(field => !this.verified[field]);
  }
}

export function getLiveBookingContactError(
  collection: LiveContactCollection,
  requiredFields: ContactField[],
  batchRequestsContactInput: boolean
): string | null {
  if (batchRequestsContactInput || collection.pendingField) {
    return 'Cannot book while contact input is pending. Wait until the requested textbox value is submitted and verified.';
  }

  const missingFields = collection.getMissingVerified(requiredFields);
  return missingFields.length > 0
    ? `Missing server-verified contact field: ${missingFields[0]}. Call request_text_input for that field and wait for its verified response before booking.`
    : null;
}
