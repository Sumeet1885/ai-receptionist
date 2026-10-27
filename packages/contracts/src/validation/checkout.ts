import { asRecord, consentField, done, emailField, phoneField, requiredText, type Validated } from './fields';
import { LIMITS } from './limits';
import { checkCustomerPassword } from './passwords';

// Details on the paid checkout, validated identically in the browser and the API. The password
// becomes the workspace login once the payment is captured.

export interface CheckoutContactInput {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  password: string;
  consent: boolean;
}

export type CheckoutContactErrors = Partial<Record<keyof CheckoutContactInput, string>>;

export function validateCheckoutContact(input: unknown): Validated<Omit<CheckoutContactInput, 'consent'>, CheckoutContactErrors> {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const fullName = requiredText(errors, 'fullName', raw.fullName, 'your full name', LIMITS.personName);
  const email = emailField(errors, 'email', raw.email);
  const phone = phoneField(errors, 'phone', raw.phone);
  const businessName = requiredText(errors, 'businessName', raw.businessName, 'your business name', LIMITS.businessName);

  const password = typeof raw.password === 'string' ? raw.password : '';
  const passwordProblem = checkCustomerPassword(password, errors.email ? undefined : email);
  if (passwordProblem) errors.password = passwordProblem;

  consentField(errors, 'consent', raw.consent, 'Please accept the terms to continue.');

  return done(errors as CheckoutContactErrors, { fullName, email, phone, businessName, password });
}
