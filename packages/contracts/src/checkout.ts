import { validateContactInput } from './contact-validation';

// Details on the paid checkout, validated identically in the browser and the API. The password
// becomes the workspace login once the payment is captured (the API also rejects common ones).

export interface CheckoutContactInput {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  password: string;
  consent: boolean;
}

export type CheckoutContactErrors = Partial<Record<keyof CheckoutContactInput, string>>;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function validateCheckoutContact(input: unknown):
  | { ok: true; value: Omit<CheckoutContactInput, 'consent'> }
  | { ok: false; errors: CheckoutContactErrors } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: CheckoutContactErrors = {};

  const fullName = text(raw.fullName);
  if (fullName.length < 2 || fullName.length > 120) errors.fullName = 'Please enter your full name.';

  const email = validateContactInput('email', text(raw.email));
  if (!email.valid) errors.email = email.error;

  const phone = validateContactInput('phone', text(raw.phone).replace(/[\s()-]/g, ''));
  if (!phone.valid) errors.phone = phone.error;

  const businessName = text(raw.businessName);
  if (businessName.length < 2 || businessName.length > 150) errors.businessName = 'Please enter your business name.';

  const password = typeof raw.password === 'string' ? raw.password : '';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (password.length > 128) errors.password = 'Use at most 128 characters.';

  if (raw.consent !== true) errors.consent = 'Please accept the terms to continue.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      fullName,
      email: email.normalized,
      phone: phone.normalized.startsWith('+') ? phone.normalized : `+91${phone.normalized}`,
      businessName,
      password,
    },
  };
}
