import { done, optionalText, type FieldErrors, type Validated } from './fields';
import { LIMITS } from './limits';

// What admins type while reviewing an access request.

/** Private notes on a request. Blank clears them (null). */
export function validateAdminNotes(raw: unknown): Validated<string | null> {
  const errors: FieldErrors = {};
  if (typeof raw !== 'string') return { ok: false, errors: { adminNotes: 'Notes must be text.' } };
  return done(errors, optionalText(errors, 'adminNotes', raw, 'notes', LIMITS.adminNotes, { multiline: true }));
}

/** Optional reason shown to the person when a request is declined. */
export function validateRejectionReason(raw: unknown): Validated<string | null> {
  const errors: FieldErrors = {};
  return done(errors, optionalText(errors, 'reason', raw, 'the reason', LIMITS.rejectionReason, { multiline: true }));
}
