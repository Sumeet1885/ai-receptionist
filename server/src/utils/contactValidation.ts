import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export type ContactField = 'phone' | 'email';
export type PendingContactToolCall = {
  id: string;
  name: string;
  field: ContactField;
};

const EMAIL_LOCAL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i;
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

  const isInternational = /^\+[1-9]\d+$/.test(trimmed);
  const isLegacyIndianNumber = /^\d{10}$/.test(trimmed);
  const parsedPhone = isInternational
    ? parsePhoneNumberFromString(trimmed)
    : isLegacyIndianNumber
      ? parsePhoneNumberFromString(trimmed, 'IN')
      : undefined;

  if (!parsedPhone?.isValid()) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Select a country and enter a valid phone number.',
    };
  }

  const subscriberDigits = parsedPhone.nationalNumber;
  if (
    /^(\d)\1+$/.test(subscriberDigits)
    || /^(\d{2,5})\1+$/.test(subscriberDigits)
    || ASCENDING_SEQUENCE.includes(subscriberDigits)
    || DESCENDING_SEQUENCE.includes(subscriberDigits)
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Please enter a real phone number, not a repeated or sequential pattern.',
    };
  }

  return {
    valid: true,
    normalized: isInternational ? parsedPhone.number : trimmed,
    error: '',
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

  seedVerified(field: ContactField, value: string) {
    if (this.pending) {
      return { accepted: false as const, field, error: `${this.pending} input is still pending` };
    }

    const validation = validateContactInput(field, value);
    if (!validation.valid) {
      return { accepted: false as const, field, error: validation.error };
    }

    this.verified[field] = validation.normalized;
    return { accepted: true as const, field, value: validation.normalized };
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

export function canForwardLiveModelOutput(
  collection: LiveContactCollection,
  pendingToolCall: PendingContactToolCall | null = null
): boolean {
  return !collection.pendingField && !pendingToolCall;
}

export function inferContactFieldRequestedByAssistantText(
  text: string,
  requiredFields: ContactField[],
  collection: LiveContactCollection
): ContactField | null {
  if (!text.trim()) return null;

  const missingFields = collection.getMissingVerified(requiredFields);
  if (missingFields.length === 0) return null;

  const normalized = text.toLowerCase();
  const asksForTypedInput =
    /\b(text\s*box|textbox|input|type|enter|fill(?:\s+in)?|submit)\b/.test(normalized);
  if (!asksForTypedInput) return null;

  if (
    missingFields.includes('phone')
    && /\b(phone|mobile|number|contact\s+number|call\s+number)\b/.test(normalized)
  ) {
    return 'phone';
  }

  if (
    missingFields.includes('email')
    && /\b(e-?mail|email\s+address|mail\s+address)\b/.test(normalized)
  ) {
    return 'email';
  }

  if (
    /\b(detail|details|contact\s+detail|contact\s+details)\b/.test(normalized)
    && /\b(text\s*box|textbox|input|type|enter|fill(?:\s+in)?|submit)\b/.test(normalized)
  ) {
    return missingFields[0];
  }

  return null;
}

export function seedVerifiedContactInputs(
  collection: LiveContactCollection,
  values: Partial<Record<ContactField, unknown>>
) {
  const seeded: Partial<Record<ContactField, string>> = {};
  const errors: Partial<Record<ContactField, string>> = {};

  for (const field of ['phone', 'email'] as ContactField[]) {
    const value = values[field];
    if (typeof value !== 'string' || !value.trim()) continue;

    const result = collection.seedVerified(field, value);
    if (result.accepted) {
      seeded[field] = result.value;
    } else {
      errors[field] = result.error;
    }
  }

  return { seeded, errors };
}

export function submitLiveContactForTool(
  collection: LiveContactCollection,
  pendingToolCall: PendingContactToolCall | null,
  submittedField: ContactField | null,
  value: string
) {
  if (!pendingToolCall || pendingToolCall.field !== submittedField) {
    return {
      accepted: false as const,
      field: collection.pendingField ?? submittedField,
      error: 'This input request expired. Please ask the assistant to request it again.',
    };
  }

  return collection.submit(submittedField, value);
}

export function applyVerifiedContactDetails<T extends Record<string, any>>(
  collection: LiveContactCollection,
  details: T
): T {
  const verifiedPhone = collection.getVerified('phone');
  const verifiedEmail = collection.getVerified('email');

  return {
    ...details,
    ...(verifiedPhone ? { visitorPhone: verifiedPhone } : {}),
    ...(verifiedEmail ? { visitorEmail: verifiedEmail } : {}),
  };
}
