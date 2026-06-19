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
}
