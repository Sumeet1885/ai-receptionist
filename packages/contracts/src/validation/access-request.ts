import { asRecord, cleanLine, consentField, done, emailField, oneOf, optionalText, phoneField, requiredText, type Validated } from './fields';
import { LIMITS } from './limits';

// Free-access request form, validated identically in the browser and the API.

export const ACCESS_REQUEST_INDUSTRIES = [
  'Healthcare & clinics',
  'Real estate',
  'Education & coaching',
  'Hospitality & restaurants',
  'Retail & e-commerce',
  'Professional services',
  'Automotive',
  'Recruitment & staffing',
  'Financial services',
  'Other',
] as const;

export const ACCESS_REQUEST_VOLUMES = {
  under_100: 'Under 100 calls or chats a month',
  '100_500': '100 – 500 a month',
  '500_2000': '500 – 2,000 a month',
  over_2000: 'More than 2,000 a month',
} as const;

export const ACCESS_REQUEST_LANGUAGES = [
  'English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Malayalam', 'Punjabi',
] as const;

export type AccessRequestVolume = keyof typeof ACCESS_REQUEST_VOLUMES;

export interface AccessRequestInput {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  industry: string;
  website?: string;
  city?: string;
  monthlyVolume?: AccessRequestVolume | '';
  languages?: string[];
  useCase?: string;
  consent: boolean;
}

export interface AccessRequestValues {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  industry: string;
  website: string | null;
  city: string | null;
  monthlyVolume: AccessRequestVolume | null;
  languages: string[];
  useCase: string | null;
}

export type AccessRequestErrors = Partial<Record<keyof AccessRequestInput, string>>;

// Kept for the form's maxLength attributes; the values come from LIMITS.
export const ACCESS_REQUEST_LIMITS = {
  name: LIMITS.personName.max,
  business: LIMITS.businessName.max,
  website: LIMITS.website.max,
  city: LIMITS.city.max,
  useCase: LIMITS.useCase.max,
} as const;

// Scheme optional; host must have a dot. Stored as scheme://host[:port]/path.
const WEBSITE = /^(https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d{1,5})?(\/\S*)?$/i;

export function validateAccessRequest(input: unknown): Validated<AccessRequestValues, AccessRequestErrors> {
  const raw = asRecord(input);
  const errors: Record<string, string> = {};

  const fullName = requiredText(errors, 'fullName', raw.fullName, 'your full name', LIMITS.personName);
  const email = emailField(errors, 'email', raw.email);
  const phone = phoneField(errors, 'phone', raw.phone);
  const businessName = requiredText(errors, 'businessName', raw.businessName, 'your business name', LIMITS.businessName);
  const industry = oneOf(errors, 'industry', raw.industry, ACCESS_REQUEST_INDUSTRIES, 'Please choose your industry.');

  let website = optionalText(errors, 'website', raw.website, 'website', LIMITS.website);
  if (website && !errors.website) {
    const match = WEBSITE.exec(website);
    if (!match) errors.website = 'Please enter a valid website, like example.com.';
    else website = `${(match[1] || 'https://').toLowerCase()}${match[2].toLowerCase()}${match[3] ?? ''}${match[4] ?? '/'}`;
  }

  const city = optionalText(errors, 'city', raw.city, 'city name', LIMITS.city);

  const volume = cleanLine(raw.monthlyVolume);
  if (volume && !(volume in ACCESS_REQUEST_VOLUMES)) errors.monthlyVolume = 'Please choose an option.';

  const languages = Array.isArray(raw.languages) ? [...new Set(raw.languages.map(cleanLine))] : [];
  if (languages.some((language) => !(ACCESS_REQUEST_LANGUAGES as readonly string[]).includes(language))) {
    errors.languages = 'Please choose from the listed languages.';
  }

  const useCase = optionalText(errors, 'useCase', raw.useCase, 'this description', LIMITS.useCase, { multiline: true });
  consentField(errors, 'consent', raw.consent, 'Please agree to be contacted about your request.');

  return done(errors as AccessRequestErrors, {
    fullName,
    email,
    phone,
    businessName,
    industry: industry ?? '',
    website,
    city,
    monthlyVolume: (volume || null) as AccessRequestVolume | null,
    languages,
    useCase,
  });
}
