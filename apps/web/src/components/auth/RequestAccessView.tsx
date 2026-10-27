import React, { useState } from 'react';
import {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_LANGUAGES,
  ACCESS_REQUEST_LIMITS,
  ACCESS_REQUEST_VOLUMES,
  validateAccessRequest,
  type AccessRequestErrors,
  type AccessRequestInput,
} from '@ai-receptionist/contracts';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { fieldClassName, Input, Label, Textarea } from '../ui/field';
import { Honeypot } from '../security/Honeypot';
import { Turnstile } from '../security/Turnstile';
import { postPublic, usePublicFormGuard } from '../../lib/publicForm';
import { AuthSplitLayout } from './AuthSplitLayout';

interface RequestAccessViewProps {
  navigate: (path: string) => void;
}

const EMPTY: AccessRequestInput = {
  fullName: '',
  email: '',
  phone: '',
  businessName: '',
  industry: '',
  website: '',
  city: '',
  monthlyVolume: '',
  languages: [],
  useCase: '',
  consent: false,
};

// Compact fields so the whole form fits one laptop screen (1366x768) without scrolling.
const COMPACT = 'py-2 [@media(max-height:800px)]:py-1.5';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1 text-xs text-danger">{message}</p>;
}

function Optional() {
  return <span className="font-normal text-text-subtle"> (optional)</span>;
}

export const RequestAccessView: React.FC<RequestAccessViewProps> = ({ navigate }) => {
  const [form, setForm] = useState<AccessRequestInput>(EMPTY);
  const [errors, setErrors] = useState<AccessRequestErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const guard = usePublicFormGuard();

  const set = <K extends keyof AccessRequestInput>(key: K, value: AccessRequestInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const toggleLanguage = (language: string) => {
    const current = form.languages ?? [];
    set('languages', current.includes(language) ? current.filter((l) => l !== language) : [...current, language]);
  };

  // Each field is checked as the person leaves it (once something is typed); the rest on submit.
  const checkField = (key: keyof AccessRequestInput) => {
    const value = form[key];
    if (typeof value !== 'string' || !value.trim()) return;
    const result = validateAccessRequest(form);
    setErrors((prev) => ({ ...prev, [key]: result.ok ? undefined : result.errors[key] }));
  };

  const fieldProps = (key: keyof AccessRequestInput) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `ra-${key}-error` : undefined,
    onBlur: () => checkField(key),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const result = validateAccessRequest(form);
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      document.getElementById(`ra-${first}`)?.focus();
      return;
    }
    if (!guard.captchaReady) {
      setFormError('Please complete the security check.');
      return;
    }

    setSubmitting(true);
    try {
      await postPublic('/access-requests', { ...form, ...guard.guardFields() });
      setSubmittedEmail(result.value.email);
    } catch (err) {
      setFormError((err as Error).message);
      guard.resetChallenge();
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedEmail) {
    return (
      <AuthSplitLayout art="request">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-surface text-xl font-bold text-success" aria-hidden="true">✓</div>
          <h1 className="mb-2 font-display text-4xl font-semibold tracking-[-0.04em] text-text">Request received</h1>
          <p className="mb-8 text-sm text-text-subtle">
            We have sent a confirmation to <span className="font-semibold text-text">{submittedEmail}</span>. Our team reviews every
            request, usually within one working day, and will email you a link to activate your workspace.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => navigate('/')}>Back to home</Button>
            <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => navigate('/auth')}>Already approved? Sign in</button>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout art="request">
      <div className="mb-4 [@media(max-height:800px)]:mb-2.5">
        <h1 className="mb-1 font-display text-3xl font-semibold tracking-[-0.04em] text-text">Request free access</h1>
        <p className="text-sm text-text-subtle">
          Our team reviews every request and sets up your workspace.{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate('/auth')}>Already have one? Sign in</button>
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-3 [@media(max-height:800px)]:space-y-2">
        <Honeypot {...guard.honeypotProps} />
        <div className="grid gap-3 sm:grid-cols-2 [@media(max-height:800px)]:gap-y-2">
          <div>
            <Label htmlFor="ra-fullName" className="mb-1">Full name</Label>
            <Input id="ra-fullName" className={COMPACT} autoComplete="name" required maxLength={ACCESS_REQUEST_LIMITS.name} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} {...fieldProps('fullName')} />
            <FieldError id="ra-fullName-error" message={errors.fullName} />
          </div>
          <div>
            <Label htmlFor="ra-email" className="mb-1">Work email</Label>
            <Input id="ra-email" className={COMPACT} type="email" autoComplete="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" {...fieldProps('email')} />
            <FieldError id="ra-email-error" message={errors.email} />
          </div>
          <div>
            <Label htmlFor="ra-phone" className="mb-1">Mobile number</Label>
            <Input id="ra-phone" className={COMPACT} type="tel" autoComplete="tel" required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210 or +44…" {...fieldProps('phone')} />
            <FieldError id="ra-phone-error" message={errors.phone} />
          </div>
          <div>
            <Label htmlFor="ra-businessName" className="mb-1">Business name</Label>
            <Input id="ra-businessName" className={COMPACT} autoComplete="organization" required maxLength={ACCESS_REQUEST_LIMITS.business} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} {...fieldProps('businessName')} />
            <FieldError id="ra-businessName-error" message={errors.businessName} />
          </div>
          <div>
            <Label htmlFor="ra-industry" className="mb-1">Industry</Label>
            <select id="ra-industry" required className={cn(fieldClassName, COMPACT)} value={form.industry} onChange={(e) => set('industry', e.target.value)} {...fieldProps('industry')}>
              <option value="">Choose one</option>
              {ACCESS_REQUEST_INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
            </select>
            <FieldError id="ra-industry-error" message={errors.industry} />
          </div>
          <div>
            <Label htmlFor="ra-monthlyVolume" className="mb-1">Expected volume<Optional /></Label>
            <select id="ra-monthlyVolume" className={cn(fieldClassName, COMPACT)} value={form.monthlyVolume} onChange={(e) => set('monthlyVolume', e.target.value as AccessRequestInput['monthlyVolume'])} {...fieldProps('monthlyVolume')}>
              <option value="">Not sure yet</option>
              {Object.entries(ACCESS_REQUEST_VOLUMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FieldError id="ra-monthlyVolume-error" message={errors.monthlyVolume} />
          </div>
          <div>
            <Label htmlFor="ra-website" className="mb-1">Website<Optional /></Label>
            <Input id="ra-website" className={COMPACT} type="url" inputMode="url" autoComplete="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="example.com" {...fieldProps('website')} />
            <FieldError id="ra-website-error" message={errors.website} />
          </div>
          <div>
            <Label htmlFor="ra-city" className="mb-1">City<Optional /></Label>
            <Input id="ra-city" className={COMPACT} autoComplete="address-level2" maxLength={ACCESS_REQUEST_LIMITS.city} value={form.city} onChange={(e) => set('city', e.target.value)} {...fieldProps('city')} />
            <FieldError id="ra-city-error" message={errors.city} />
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-text">Languages your callers speak<Optional /></legend>
          <div className="flex flex-wrap gap-1.5">
            {ACCESS_REQUEST_LANGUAGES.map((language) => {
              const selected = form.languages?.includes(language);
              return (
                <button
                  key={language}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleLanguage(language)}
                  className={`rounded-pill border px-2.5 py-0.5 text-xs font-medium transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-text hover:border-border-strong'}`}
                >
                  {language}
                </button>
              );
            })}
          </div>
          <FieldError id="ra-languages-error" message={errors.languages} />
        </fieldset>

        <div>
          <Label htmlFor="ra-useCase" className="mb-1">What should your receptionist do?<Optional /></Label>
          <Textarea id="ra-useCase" rows={2} className="min-h-0 py-2" maxLength={ACCESS_REQUEST_LIMITS.useCase} value={form.useCase} onChange={(e) => set('useCase', e.target.value)} placeholder="For example: answer patient calls in Hindi and English, and book appointments." {...fieldProps('useCase')} />
          <FieldError id="ra-useCase-error" message={errors.useCase} />
        </div>

        <div>
          <label className="flex items-start gap-3 text-sm text-text">
            <input id="ra-consent" type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} {...fieldProps('consent')} />
            <span>I agree that Bolega India may contact me about this request.</span>
          </label>
          <FieldError id="ra-consent-error" message={errors.consent} />
        </div>

        {formError && <p role="alert" className="rounded-small border border-danger/30 bg-danger-surface px-4 py-2 text-sm text-danger">{formError}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Turnstile {...guard.turnstileProps} />
          <Button type="submit" size="lg" className="min-w-48 flex-1" disabled={submitting}>
            {submitting ? 'Sending request…' : 'Request free access'}
          </Button>
        </div>
      </form>
    </AuthSplitLayout>
  );
};
