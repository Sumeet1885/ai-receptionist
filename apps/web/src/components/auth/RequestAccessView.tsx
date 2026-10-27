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

// Two short steps so each fits on one screen without scrolling.
const STEP_ONE_FIELDS: Array<keyof AccessRequestInput> = ['fullName', 'email', 'phone', 'businessName', 'industry'];

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1 text-xs text-danger">{message}</p>;
}

function pick(errors: AccessRequestErrors, keys: Array<keyof AccessRequestInput>) {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => keys.includes(key as keyof AccessRequestInput))) as AccessRequestErrors;
}

export const RequestAccessView: React.FC<RequestAccessViewProps> = ({ navigate }) => {
  const [form, setForm] = useState<AccessRequestInput>(EMPTY);
  const [step, setStep] = useState<1 | 2>(1);
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

  const fieldProps = (key: keyof AccessRequestInput) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `ra-${key}-error` : undefined,
  });

  const continueToDetails = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateAccessRequest(form);
    const stepErrors = result.ok ? {} : pick(result.errors, STEP_ONE_FIELDS);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) return;
    setFormError('');
    setStep(2);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const result = validateAccessRequest(form);
    if (!result.ok) {
      setErrors(result.errors);
      if (Object.keys(pick(result.errors, STEP_ONE_FIELDS)).length) setStep(1);
      return;
    }
    if (!guard.captchaReady) {
      setFormError('Please complete the security check above.');
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
      <AuthSplitLayout>
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
    <AuthSplitLayout>
      <div className="mb-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
          Step {step} of 2 · {step === 1 ? 'About you' : 'Your needs'}
        </p>
        <h1 className="mb-2 font-display text-4xl font-semibold tracking-[-0.04em] text-text">Request free access</h1>
        <p className="text-sm text-text-subtle">
          {step === 1
            ? 'Tell us who you are. Our team reviews every request and sets up your workspace.'
            : 'All optional: they help us set up your receptionist.'}
        </p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          <span className="h-1 flex-1 rounded-full bg-primary" />
          <span className={`h-1 flex-1 rounded-full ${step === 2 ? 'bg-primary' : 'bg-border'}`} />
        </div>
      </div>

      {step === 1 ? (
        <form onSubmit={continueToDetails} noValidate className="space-y-4">
          <Honeypot {...guard.honeypotProps} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ra-fullName">Full name</Label>
              <Input id="ra-fullName" autoComplete="name" required autoFocus maxLength={ACCESS_REQUEST_LIMITS.name} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} {...fieldProps('fullName')} />
              <FieldError id="ra-fullName-error" message={errors.fullName} />
            </div>
            <div>
              <Label htmlFor="ra-email">Work email</Label>
              <Input id="ra-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" {...fieldProps('email')} />
              <FieldError id="ra-email-error" message={errors.email} />
            </div>
            <div>
              <Label htmlFor="ra-phone">Mobile number</Label>
              <Input id="ra-phone" type="tel" autoComplete="tel" required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210 or +44…" {...fieldProps('phone')} />
              <FieldError id="ra-phone-error" message={errors.phone} />
            </div>
            <div>
              <Label htmlFor="ra-businessName">Business name</Label>
              <Input id="ra-businessName" autoComplete="organization" required maxLength={ACCESS_REQUEST_LIMITS.business} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} {...fieldProps('businessName')} />
              <FieldError id="ra-businessName-error" message={errors.businessName} />
            </div>
          </div>
          <div>
            <Label htmlFor="ra-industry">Industry</Label>
            <select id="ra-industry" required className={fieldClassName} value={form.industry} onChange={(e) => set('industry', e.target.value)} {...fieldProps('industry')}>
              <option value="">Choose one</option>
              {ACCESS_REQUEST_INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
            </select>
            <FieldError id="ra-industry-error" message={errors.industry} />
          </div>
          <Button type="submit" size="lg" className="w-full">Continue</Button>
          <p className="text-center text-sm text-text-subtle">
            Already have a workspace? <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate('/auth')}>Sign in</button>
          </p>
        </form>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <Honeypot {...guard.honeypotProps} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ra-monthlyVolume">Expected volume <span className="font-normal text-text-subtle">(optional)</span></Label>
              <select id="ra-monthlyVolume" className={fieldClassName} value={form.monthlyVolume} onChange={(e) => set('monthlyVolume', e.target.value as AccessRequestInput['monthlyVolume'])} {...fieldProps('monthlyVolume')}>
                <option value="">Not sure yet</option>
                {Object.entries(ACCESS_REQUEST_VOLUMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <FieldError id="ra-monthlyVolume-error" message={errors.monthlyVolume} />
            </div>
            <div>
              <Label htmlFor="ra-city">City <span className="font-normal text-text-subtle">(optional)</span></Label>
              <Input id="ra-city" autoComplete="address-level2" maxLength={ACCESS_REQUEST_LIMITS.city} value={form.city} onChange={(e) => set('city', e.target.value)} {...fieldProps('city')} />
              <FieldError id="ra-city-error" message={errors.city} />
            </div>
          </div>
          <div>
            <Label htmlFor="ra-website">Website <span className="font-normal text-text-subtle">(optional)</span></Label>
            <Input id="ra-website" type="url" inputMode="url" autoComplete="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="example.com" {...fieldProps('website')} />
            <FieldError id="ra-website-error" message={errors.website} />
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-text">Languages your callers speak <span className="font-normal text-text-subtle">(optional)</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {ACCESS_REQUEST_LANGUAGES.map((language) => {
                const selected = form.languages?.includes(language);
                return (
                  <button
                    key={language}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleLanguage(language)}
                    className={`rounded-pill border px-3 py-1 text-xs font-medium transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-text hover:border-border-strong'}`}
                  >
                    {language}
                  </button>
                );
              })}
            </div>
            <FieldError id="ra-languages-error" message={errors.languages} />
          </fieldset>

          <div>
            <Label htmlFor="ra-useCase">What should your receptionist do? <span className="font-normal text-text-subtle">(optional)</span></Label>
            <Textarea id="ra-useCase" rows={2} className="min-h-0" maxLength={ACCESS_REQUEST_LIMITS.useCase} value={form.useCase} onChange={(e) => set('useCase', e.target.value)} placeholder="For example: answer patient calls in Hindi and English, and book appointments." {...fieldProps('useCase')} />
            <FieldError id="ra-useCase-error" message={errors.useCase} />
          </div>

          <div>
            <label className="flex items-start gap-3 text-sm text-text">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} {...fieldProps('consent')} />
              <span>I agree that Bolega India may contact me about this request.</span>
            </label>
            <FieldError id="ra-consent-error" message={errors.consent} />
          </div>

          <Turnstile {...guard.turnstileProps} />

          {formError && <p role="alert" className="rounded-small border border-danger/30 bg-danger-surface px-4 py-3 text-sm text-danger">{formError}</p>}

          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep(1)} disabled={submitting}>Back</Button>
            <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
              {submitting ? 'Sending request…' : 'Request free access'}
            </Button>
          </div>
        </form>
      )}
    </AuthSplitLayout>
  );
};
