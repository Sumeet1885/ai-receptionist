import { asRecord, done, emailField, optionalText, type FieldErrors, type Validated } from './fields';
import { LIMITS } from './limits';

// Who gets the admin alert emails, managed by super admins in the console.

export const NOTIFICATION_EVENTS = {
  access_requests: 'New free-access requests',
  payments: 'Payments and paid signups',
  signup_leads: 'Signup leads (closed checkout or failed payment)',
} as const;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;

export interface NotificationRecipientColumns {
  email: string;
  label: string | null;
  notify_access_requests: boolean;
  notify_payments: boolean;
  notify_signup_leads: boolean;
  is_active: boolean;
}

export function validateNotificationRecipient(input: unknown): Validated<NotificationRecipientColumns> {
  const raw = asRecord(input);
  const errors: FieldErrors = {};

  const value: NotificationRecipientColumns = {
    email: emailField(errors, 'email', raw.email),
    label: optionalText(errors, 'label', raw.label, 'the name', LIMITS.recipientLabel),
    notify_access_requests: raw.accessRequests === true,
    notify_payments: raw.payments === true,
    notify_signup_leads: raw.signupLeads === true,
    is_active: raw.isActive !== false,
  };
  if (!value.notify_access_requests && !value.notify_payments && !value.notify_signup_leads) {
    errors.events = 'Choose at least one kind of alert.';
  }
  return done(errors, value);
}
