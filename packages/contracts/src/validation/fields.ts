import { validateContactInput } from './contact';

// Field rules shared by every form. Each takes the raw value, records a message under the field's
// name in `errors` when it is not acceptable, and returns the cleaned value.

export type FieldErrors = Record<string, string>;
export type Validated<T, E = FieldErrors> = { ok: true; value: T } | { ok: false; errors: E };

export function done<T, E extends FieldErrors>(errors: E, value: T): Validated<T, E> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? input as Record<string, unknown> : {};
}

/** Trimmed, with runs of whitespace collapsed to one space (single-line fields). */
export function cleanLine(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** Trimmed only, keeping line breaks (multi-line fields). */
export function cleanBlock(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

const capitalise = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

/** Length check on an already-cleaned value; records the first problem. */
function checkLength(errors: FieldErrors, field: string, value: string, label: string, { min = 0, max }: { min?: number; max: number }) {
  if (value.length < min) errors[field] = min <= 1 ? `Please enter ${label}.` : `${capitalise(label)} must be at least ${min} characters.`;
  else if (value.length > max) errors[field] = `${capitalise(label)} must be at most ${max} characters.`;
}

export function requiredText(
  errors: FieldErrors,
  field: string,
  raw: unknown,
  label: string,
  limit: { min?: number; max: number },
  { multiline = false } = {},
) {
  const value = multiline ? cleanBlock(raw) : cleanLine(raw);
  if (!value) errors[field] = `Please enter ${label}.`;
  else checkLength(errors, field, value, label, limit);
  return value;
}

/** Blank → null. */
export function optionalText(
  errors: FieldErrors,
  field: string,
  raw: unknown,
  label: string,
  limit: { max: number },
  { multiline = false } = {},
) {
  const value = multiline ? cleanBlock(raw) : cleanLine(raw);
  if (value) checkLength(errors, field, value, label, limit);
  return value || null;
}

export function emailField(errors: FieldErrors, field: string, raw: unknown) {
  const result = validateContactInput('email', cleanLine(raw));
  if (!result.valid) errors[field] = result.error;
  return result.normalized;
}

/** Ten-digit numbers are Indian numbers; the value is always international (+91…). */
export function phoneField(errors: FieldErrors, field: string, raw: unknown) {
  const result = validateContactInput('phone', cleanLine(raw).replace(/[\s()-]/g, ''));
  if (!result.valid) errors[field] = result.error;
  return result.normalized.startsWith('+') ? result.normalized : `+91${result.normalized}`;
}

/** Must be exactly `true` (a ticked checkbox). */
export function consentField(errors: FieldErrors, field: string, raw: unknown, message: string) {
  if (raw !== true) errors[field] = message;
  return raw === true;
}

export function oneOf<T extends string>(errors: FieldErrors, field: string, raw: unknown, allowed: readonly T[], message: string): T | null {
  const value = cleanLine(raw);
  if (!(allowed as readonly string[]).includes(value)) {
    errors[field] = message;
    return null;
  }
  return value as T;
}

/**
 * Whole number in range (numbers or numeric strings, as forms send them). Blank → null when
 * `nullable`, otherwise "required".
 */
export function integerField(
  errors: FieldErrors,
  field: string,
  raw: unknown,
  { min, max, nullable = false }: { min: number; max: number; nullable?: boolean },
): number | null {
  if (raw === null || raw === undefined || raw === '') {
    if (!nullable) errors[field] = 'Required.';
    return nullable ? null : 0;
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) errors[field] = 'Enter a whole number.';
  else if (n < min) errors[field] = `Must be at least ${min.toLocaleString('en-IN')}.`;
  else if (n > max) errors[field] = `Must be at most ${max.toLocaleString('en-IN')}.`;
  else return n;
  return nullable ? null : 0;
}

/** ISO timestamp, or null when blank and `nullable` (otherwise blank means now). */
export function dateField(errors: FieldErrors, field: string, raw: unknown, { nullable }: { nullable: boolean }) {
  if (raw === null || raw === undefined || raw === '') return nullable ? null : new Date().toISOString();
  const time = Date.parse(String(raw));
  if (Number.isNaN(time)) {
    errors[field] = 'Enter a valid date.';
    return null;
  }
  return new Date(time).toISOString();
}
