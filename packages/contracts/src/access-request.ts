import { validateContactInput } from './contact-validation';

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

export const ACCESS_REQUEST_LIMITS = { name: 120, business: 150, website: 200, city: 80, useCase: 1000 } as const;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function validateAccessRequest(input: unknown):
  | { ok: true; value: AccessRequestValues }
  | { ok: false; errors: AccessRequestErrors } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: AccessRequestErrors = {};

  const fullName = text(raw.fullName);
  if (fullName.length < 2) errors.fullName = 'Please enter your full name.';
  else if (fullName.length > ACCESS_REQUEST_LIMITS.name) errors.fullName = 'Name is too long.';

  const email = validateContactInput('email', text(raw.email));
  if (!email.valid) errors.email = email.error;

  const phone = validateContactInput('phone', text(raw.phone).replace(/[\s()-]/g, ''));
  if (!phone.valid) errors.phone = phone.error;

  const businessName = text(raw.businessName);
  if (businessName.length < 2) errors.businessName = 'Please enter your business name.';
  else if (businessName.length > ACCESS_REQUEST_LIMITS.business) errors.businessName = 'Business name is too long.';

  const industry = text(raw.industry);
  if (!(ACCESS_REQUEST_INDUSTRIES as readonly string[]).includes(industry)) errors.industry = 'Please choose your industry.';

  let website = text(raw.website);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const url = new URL(website);
      if (!url.hostname.includes('.') || website.length > ACCESS_REQUEST_LIMITS.website) throw new Error();
      website = url.toString();
    } catch {
      errors.website = 'Please enter a valid website, like example.com.';
    }
  }

  const city = text(raw.city);
  if (city.length > ACCESS_REQUEST_LIMITS.city) errors.city = 'City name is too long.';

  const volume = text(raw.monthlyVolume);
  if (volume && !(volume in ACCESS_REQUEST_VOLUMES)) errors.monthlyVolume = 'Please choose an option.';

  const languages = Array.isArray(raw.languages) ? [...new Set(raw.languages.map(text))] : [];
  if (languages.some((language) => !(ACCESS_REQUEST_LANGUAGES as readonly string[]).includes(language))) {
    errors.languages = 'Please choose from the listed languages.';
  }

  const useCase = typeof raw.useCase === 'string' ? raw.useCase.trim() : '';
  if (useCase.length > ACCESS_REQUEST_LIMITS.useCase) errors.useCase = `Please keep this under ${ACCESS_REQUEST_LIMITS.useCase} characters.`;

  if (raw.consent !== true) errors.consent = 'Please agree to be contacted about your request.';

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      fullName,
      email: email.normalized,
      // Ten-digit numbers are Indian numbers; store everything in international format.
      phone: phone.normalized.startsWith('+') ? phone.normalized : `+91${phone.normalized}`,
      businessName,
      industry,
      website: website || null,
      city: city || null,
      monthlyVolume: (volume || null) as AccessRequestVolume | null,
      languages,
      useCase: useCase || null,
    },
  };
}
