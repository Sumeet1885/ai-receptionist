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
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { fieldClassName, Input, Label, Textarea } from '../ui/field';
import { Card } from '../ui/layout';
import { Honeypot } from '../security/Honeypot';
import { Turnstile } from '../security/Turnstile';
import { postPublic, usePublicFormGuard } from '../../lib/publicForm';

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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1 text-xs text-danger">{message}</p>;
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

  const fieldProps = (key: keyof AccessRequestInput) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `ra-${key}-error` : undefined,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const result = validateAccessRequest(form);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError('Please check the highlighted fields.');
      return;
    }
    if (!guard.captchaReady) {
      setFormError('Please complete the security check below.');
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

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] flex-1 justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-40 h-[300px] w-[400px] -translate-x-1/2 rounded-[100%] bg-accent-lime/30 blur-[120px] sm:h-[500px] sm:w-[800px]"
      />

      <div className="relative z-10 w-full max-w-2xl">
        <Card variant="floating" padding="lg" className="rounded-large">
          <div className="mb-8 text-center">
            <BrandLogo className="mb-6 justify-center" />
            {submittedEmail ? (
              <>
                <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">Request received</h1>
                <p className="text-sm text-text-subtle">
                  We have sent a confirmation to <span className="font-semibold text-text">{submittedEmail}</span>.
                  Our team reviews every request, usually within one working day, and will email you a link to activate your workspace.
                </p>
              </>
            ) : (
              <>
                <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">Request free access</h1>
                <p className="text-sm text-text-subtle">
                  Tell us about your business. Our team reviews every request and sets up your workspace.
                </p>
              </>
            )}
          </div>

          {submittedEmail ? (
            <div className="flex flex-col items-center gap-3">
              <Button onClick={() => navigate('/')}>Back to home</Button>
              <p className="text-xs text-text-subtle">Already approved? <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate('/auth')}>Sign in</button></p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <Honeypot {...guard.honeypotProps} />

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ra-fullName">Full name</Label>
                  <Input id="ra-fullName" autoComplete="name" required maxLength={ACCESS_REQUEST_LIMITS.name} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} {...fieldProps('fullName')} />
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
                <div>
                  <Label htmlFor="ra-industry">Industry</Label>
                  <select id="ra-industry" required className={fieldClassName} value={form.industry} onChange={(e) => set('industry', e.target.value)} {...fieldProps('industry')}>
                    <option value="">Choose one</option>
                    {ACCESS_REQUEST_INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
                  </select>
                  <FieldError id="ra-industry-error" message={errors.industry} />
                </div>
                <div>
                  <Label htmlFor="ra-monthlyVolume">Expected volume <span className="font-normal text-text-subtle">(optional)</span></Label>
                  <select id="ra-monthlyVolume" className={fieldClassName} value={form.monthlyVolume} onChange={(e) => set('monthlyVolume', e.target.value as AccessRequestInput['monthlyVolume'])} {...fieldProps('monthlyVolume')}>
                    <option value="">Not sure yet</option>
                    {Object.entries(ACCESS_REQUEST_VOLUMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <FieldError id="ra-monthlyVolume-error" message={errors.monthlyVolume} />
                </div>
                <div>
                  <Label htmlFor="ra-website">Website <span className="font-normal text-text-subtle">(optional)</span></Label>
                  <Input id="ra-website" type="url" inputMode="url" autoComplete="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="example.com" {...fieldProps('website')} />
                  <FieldError id="ra-website-error" message={errors.website} />
                </div>
                <div>
                  <Label htmlFor="ra-city">City <span className="font-normal text-text-subtle">(optional)</span></Label>
                  <Input id="ra-city" autoComplete="address-level2" maxLength={ACCESS_REQUEST_LIMITS.city} value={form.city} onChange={(e) => set('city', e.target.value)} {...fieldProps('city')} />
                  <FieldError id="ra-city-error" message={errors.city} />
                </div>
              </div>

              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-text">Languages your callers speak <span className="font-normal text-text-subtle">(optional)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {ACCESS_REQUEST_LANGUAGES.map((language) => {
                    const selected = form.languages?.includes(language);
                    return (
                      <button
                        key={language}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleLanguage(language)}
                        className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-text hover:border-border-strong'}`}
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
                <Textarea id="ra-useCase" maxLength={ACCESS_REQUEST_LIMITS.useCase} value={form.useCase} onChange={(e) => set('useCase', e.target.value)} placeholder="For example: answer patient calls in Hindi and English, and book appointments." {...fieldProps('useCase')} />
                <FieldError id="ra-useCase-error" message={errors.useCase} />
              </div>

              <div>
                <label className="flex items-start gap-3 text-sm text-text">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} {...fieldProps('consent')} />
                  <span>I agree that Bolega India may contact me by email or phone about this request.</span>
                </label>
                <FieldError id="ra-consent-error" message={errors.consent} />
              </div>

              <Turnstile {...guard.turnstileProps} />

              {formError && <p role="alert" className="rounded-small border border-danger/30 bg-danger-surface px-4 py-3 text-sm text-danger">{formError}</p>}

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? 'Sending request…' : 'Request free access'}
              </Button>
              <p className="text-center text-sm text-text-subtle">
                Already have a workspace? <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate('/auth')}>Sign in</button>
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
