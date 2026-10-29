import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { BrandLogo } from '../ui/brand-logo';
import { BUSINESS_TEMPLATES, BusinessTemplate } from '../../lib/businessTemplates';
import { LeadField } from '../../types';

interface OnboardingViewProps {
  isInitialSetup?: boolean;
  newBotName: string;
  setNewBotName: (name: string) => void;
  newBotIndustry: string;
  setNewBotIndustry: (industry: string) => void;
  newBotGreeting: string;
  setNewBotGreeting: (greeting: string) => void;
  newBotKB: string;
  setNewBotKB: (kb: string) => void;
  newBotColor: string;
  setNewBotColor: (color: string) => void;
  newBotLeadFields: LeadField[];
  setNewBotLeadFields: (fields: LeadField[]) => void;
  newBotPrompts: string[];
  setNewBotPrompts: (prompts: string[]) => void;
  onSelectTemplate?: (template: BusinessTemplate) => void;
  setView: (view: string) => void;
  handleCreateBot: (e: React.FormEvent) => void | Promise<void>;
}

const LEAD_FIELD_OPTIONS: { id: LeadField; label: string; icon: string; desc: string }[] = [
  { id: 'name', label: 'Full Name', icon: '👤', desc: 'Caller / visitor name' },
  { id: 'phone', label: 'Phone Number', icon: '📞', desc: 'Contact phone for follow-up' },
  { id: 'email', label: 'Email Address', icon: '✉️', desc: 'Email for confirmations' },
  { id: 'requirement', label: 'Requirement / Purpose', icon: '🎯', desc: 'Service needed or reason for visit' },
  { id: 'budget', label: 'Budget / Financials', icon: '💰', desc: 'Budget range or price tier' },
];

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  isInitialSetup = false,
  newBotName,
  setNewBotName,
  newBotIndustry,
  setNewBotIndustry,
  newBotGreeting,
  setNewBotGreeting,
  newBotKB,
  setNewBotKB,
  newBotColor,
  setNewBotColor,
  newBotLeadFields,
  setNewBotLeadFields,
  newBotPrompts,
  setNewBotPrompts,
  onSelectTemplate,
  setView,
  handleCreateBot
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const steps = ['Business type', 'Business details', 'Greeting & appearance', 'Customer details', 'Business knowledge'];
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const submitStep = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (step < steps.length - 1) {
      if (formRef.current?.reportValidity()) setStep(step + 1);
      return;
    }
    if (!newBotName.trim()) { setStep(1); return; }
    setSubmitting(true);
    try { await handleCreateBot(event); }
    finally { setSubmitting(false); }
  };

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    const match = BUSINESS_TEMPLATES.find(t => t.industry === newBotIndustry);
    return match ? match.id : 'healthcare';
  });

  const handleTemplateClick = (template: BusinessTemplate) => {
    setSelectedTemplateId(template.id);
    setNewBotName(template.defaultName);
    setNewBotIndustry(template.industry);
    setNewBotGreeting(template.greeting);
    setNewBotKB(template.knowledgeBase);
    setNewBotColor(template.primaryColor);
    setNewBotLeadFields(template.requiredLeadFields);
    setNewBotPrompts(template.suggestedPrompts);

    if (onSelectTemplate) {
      onSelectTemplate(template);
    }
  };

  const toggleLeadField = (fieldId: LeadField) => {
    if (newBotLeadFields.includes(fieldId)) {
      // Keep at least one customer detail selected.
      if (newBotLeadFields.length <= 1) return;
      setNewBotLeadFields(newBotLeadFields.filter(f => f !== fieldId));
    } else {
      setNewBotLeadFields([...newBotLeadFields, fieldId]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12 w-full space-y-8 text-base">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BrandLogo className="h-9" />
        <span className="text-sm font-semibold text-brand-muted">{isInitialSetup ? 'Set up your workspace' : 'New receptionist'}</span>
      </div>
      <nav aria-label="Setup progress">
        <ol className="grid grid-cols-5 gap-2 sm:gap-4">
          {steps.map((label, index) => (
            <li key={label} aria-current={step === index ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full mb-3 ${index <= step ? 'bg-brand-accent' : 'bg-brand-border'}`} />
              <div className={`flex items-center gap-2 text-sm font-semibold ${index === step ? 'text-brand-text' : 'text-brand-muted'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${index <= step ? 'bg-brand-accent text-primary-foreground border-brand-accent' : 'border-brand-border'}`}>
                  {index < step ? <Check size={16} aria-label="Completed" /> : index + 1}
                </span>
                <span className="sr-only sm:not-sr-only">{label}</span>
              </div>
            </li>
          ))}
        </ol>
      </nav>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-card via-brand-card/95 to-brand-bg rounded-2xl border border-brand-border p-6 lg:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-sm font-body font-semibold uppercase tracking-wider mb-3">
            <span>Step {step + 1} of {steps.length}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-brand-accent text-primary-foreground animate-pulse" />
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="outline-none text-3xl sm:text-4xl font-display font-extrabold text-brand-text tracking-tight">
            {steps[step]}
          </h1>
          <p className="text-sm sm:text-base text-brand-muted mt-2 max-w-2xl leading-relaxed">
            {['Choose a starting template for your business. You can review and edit every detail before creating your receptionist.', 'Tell us which business your receptionist will represent.', 'Choose how your receptionist welcomes customers and how your chat widget looks.', 'Choose the information to collect from customers during calls and chats.', 'Review the sample content and replace it with your actual services, prices, hours and policies.'][step]}
          </p>
        </div>
      </div>

      {/* Template Selector Cards */}
      {step === 0 && <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-brand-text flex items-center gap-2">
              <span>Choose your business type</span>
              <span className="text-sm font-body font-normal text-brand-muted px-2 py-0.5 rounded bg-brand-bg border border-brand-border">
                Starting templates
              </span>
            </h2>
            <p className="text-sm text-brand-muted mt-0.5">
              Click any card to pre-fill AI instructions, greeting, extraction fields, and theme.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BUSINESS_TEMPLATES.map((tmpl) => {
            const isSelected = selectedTemplateId === tmpl.id;
            return (
              <div
                key={tmpl.id}
                role="button"
                aria-pressed={isSelected}
                tabIndex={0}
                onClick={() => handleTemplateClick(tmpl)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTemplateClick(tmpl);
                  }
                }}
                className={`relative text-left rounded-xl border p-5 transition-all duration-200 cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-brand-card border-brand-accent ring-2 ring-brand-accent/40 shadow-lg shadow-brand-accent/10'
                    : 'bg-brand-card/60 hover:bg-brand-card border-brand-border hover:border-brand-accent/50 shadow-sm'
                }`}
              >
                {/* Active Indicator Badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl p-2 rounded-lg bg-brand-bg border border-brand-border/60 shadow-inner group-hover:scale-110 transition-transform">
                      {tmpl.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-display font-bold text-brand-text">
                          {tmpl.name}
                        </h3>
                      </div>
                      <span className="text-sm font-body text-brand-accent uppercase tracking-wider font-semibold">
                        {tmpl.badge}
                      </span>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 text-sm font-body font-bold px-2 py-0.5 rounded-full bg-brand-success/15 border border-brand-success/40 text-brand-success">
                      ✓ Active
                    </span>
                  ) : (
                    <span className="text-sm font-body text-brand-muted group-hover:text-brand-text transition-colors">
                      Select →
                    </span>
                  )}
                </div>

                {/* Tagline */}
                <p className="text-sm text-brand-muted leading-relaxed mb-4">
                  {tmpl.tagline}
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tmpl.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className="text-sm font-sans px-2 py-0.5 rounded-md bg-brand-bg/90 border border-brand-border/80 text-brand-text/90"
                    >
                      {feat}
                    </span>
                  ))}
                </div>

                {/* Footer preview note */}
                <div className="pt-3 border-t border-brand-border/60 flex items-center justify-between text-sm text-brand-muted font-body">
                  <span>Pre-fills: Instructions + Extraction + Theme</span>
                  <span className={`font-semibold flex items-center gap-1 ${isSelected ? 'text-brand-accent' : 'text-brand-muted group-hover:text-brand-accent'}`}>
                    {isSelected ? 'Selected' : 'Use this template'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-4">
          <button type="button" onClick={() => setStep(1)} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand-accent px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-brand-accent-hover">
            Continue <ArrowRight size={18} />
          </button>
        </div>
      </div>}

      {step > 0 && <div className="bg-brand-card rounded-2xl border border-brand-border p-6 sm:p-8 shadow-sm">
        {/* Pre-filled Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 mb-6 rounded-xl bg-brand-accent/10 border border-brand-accent/30 text-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-brand-accent text-base">✨</span>
            <div>
              <span className="font-bold text-brand-text">Starting template: </span>
              <span className="text-brand-accent font-semibold">
                {BUSINESS_TEMPLATES.find(t => t.id === selectedTemplateId)?.name || newBotIndustry}
              </span>
              <span className="text-brand-muted ml-1.5 hidden md:inline">
                Review the sample details and make them your own.
              </span>
            </div>
          </div>
          <span className="text-sm font-body text-brand-success bg-brand-success/15 border border-brand-success/30 px-2.5 py-0.5 rounded-full font-bold self-start sm:self-auto shrink-0">
            ✓ Sample details loaded
          </span>
        </div>
        <form ref={formRef} onSubmit={submitStep} aria-busy={submitting} className="space-y-8">
          {/* Section 1: Core Profile */}
          <fieldset hidden={step !== 1} disabled={step !== 1 || submitting} className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-brand-text flex items-center gap-2">
                <span>Business details</span>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="setup-business-name" className="block text-sm font-semibold text-brand-muted uppercase tracking-wider font-body">
                    Business / Clinic / Agency Name
                  </label>
                  <span className="text-sm font-body text-brand-muted">{(newBotName || '').length}/100</span>
                </div>
                <input
                  id="setup-business-name"
                  type="text"
                  required
                  maxLength={100}
                  pattern={'.*\\S.*'}
                  title="Enter your business name"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="e.g., SmileCare Dental & Wellness Clinic"
                  className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-base focus:ring-1 focus:ring-brand-accent"
                />
              </div>

              <div>
                <label htmlFor="setup-industry" className="block text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2 font-body">
                  Industry Sector
                </label>
                <select id="setup-industry"
                  value={newBotIndustry}
                  onChange={(e) => setNewBotIndustry(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text focus:outline-none transition duration-200 font-sans text-base focus:ring-1 focus:ring-brand-accent"
                >
                  <option value="Healthcare">Healthcare & Dental Clinics</option>
                  <option value="Real Estate">Real Estate & Properties</option>
                  <option value="Hospitality">Restaurant & Hospitality</option>
                  <option value="Automotive">Car Dealership & Auto Service</option>
                  <option value="Education">Education & Academies</option>
                  <option value="Recruitment">Recruitment & HR Tech</option>
                  <option value="Other">Other Business</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* Section 2: Chatbot Branding & Tone */}
          <fieldset hidden={step !== 2} disabled={step !== 2 || submitting} className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-brand-text">
                Greeting and appearance
              </h3>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="setup-greeting" className="block text-sm font-semibold text-brand-muted uppercase tracking-wider font-body">
                  AI Receptionist Greeting Message
                </label>
                <span className="text-sm font-body text-brand-muted">{(newBotGreeting || '').length}/400</span>
              </div>
              <textarea id="setup-greeting"
                rows={3}
                maxLength={400}
                value={newBotGreeting}
                onChange={(e) => setNewBotGreeting(e.target.value)}
                placeholder="Welcome to our business! I am your virtual receptionist..."
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-base leading-relaxed focus:ring-1 focus:ring-brand-accent"
              />
              <p className="text-sm text-brand-muted mt-1.5 font-sans">
                This is spoken as the opening line for incoming voice calls and shown as the initial greeting in web chat.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div>
                <label className="block text-sm font-semibold text-brand-muted uppercase tracking-wider mb-2 font-body">
                  Primary Theme Color
                </label>
                <div className="flex items-center space-x-3 mt-1.5">
                  {[
                    { id: 'emerald', label: 'Emerald', bg: 'bg-brand-success' },
                    { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-600' },
                    { id: 'amber', label: 'Amber', bg: 'bg-brand-warning' },
                    { id: 'rose', label: 'Rose', bg: 'bg-brand-danger' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewBotColor(c.id)}
                      title={c.label}
                      aria-label={c.label}
                      aria-pressed={newBotColor === c.id}
                      className={`w-10 h-10 rounded-full border-2 transition duration-200 flex items-center justify-center ${
                        newBotColor === c.id ? 'border-brand-text scale-110 shadow-md ring-2 ring-brand-text/30' : 'border-transparent opacity-80 hover:opacity-100'
                      } ${c.bg}`}
                    >
                      {newBotColor === c.id && <span className="text-white text-sm font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>

          {/* Section 3: Lead & Appointment Extraction Fields */}
          <fieldset hidden={step !== 3} disabled={step !== 3 || submitting} className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-brand-text flex items-center gap-2">
                  <span>Customer details to collect</span>
                </h3>
              </div>
            </div>

            <p className="text-sm text-brand-muted leading-relaxed font-sans">
              Choose the details your receptionist automatically extracts during phone calls and chats. These are saved to your CRM leads table and passed to live agent handover.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
              {LEAD_FIELD_OPTIONS.map((field) => {
                const isActive = newBotLeadFields.includes(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => toggleLeadField(field.id)}
                    aria-pressed={isActive}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'bg-brand-accent/10 border-brand-accent text-brand-text shadow-sm'
                        : 'bg-brand-bg/70 hover:bg-brand-bg border-brand-border text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    <span className="text-xl p-1.5 rounded-lg bg-brand-card border border-brand-border/60">
                      {field.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold font-sans text-brand-text">
                          {field.label}
                        </span>
                        <span className={`text-sm font-body ${isActive ? 'text-brand-accent font-bold' : 'text-brand-muted'}`}>
                          {isActive ? '✓ ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-sm text-brand-muted mt-0.5 truncate">
                        {field.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Section 4: Training Knowledge Base & FAQ */}
          <fieldset hidden={step !== 4} disabled={step !== 4 || submitting} className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-display font-bold text-brand-text">
                  Business knowledge
                </h3>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-sm text-brand-muted leading-relaxed font-sans">
                The AI receptionist uses this domain knowledge to answer complex caller questions, check doctor/agent schedules, give accurate pricing, and triage emergency calls.
              </p>
              <span className="text-sm font-body text-brand-muted shrink-0">
                {(newBotKB || '').length}/3000
              </span>
            </div>
            
            <div>
              <textarea aria-label="Business knowledge"
                rows={8}
                required
                maxLength={3000}
                value={newBotKB}
                onChange={(e) => setNewBotKB(e.target.value)}
                placeholder="Enter services, pricing, provider schedules, policies, emergency protocol, location, and hours..."
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-base leading-relaxed focus:ring-1 focus:ring-brand-accent"
              />
            </div>

            {/* Quick Prompts Preview */}
            {newBotPrompts && newBotPrompts.length > 0 && (
              <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-body uppercase tracking-wider text-brand-muted font-semibold">
                    Suggested questions for your customers
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {newBotPrompts.map((prompt, idx) => (
                    <span
                      key={idx}
                      className="text-sm px-2.5 py-1 rounded-md bg-brand-card border border-brand-border text-brand-text/90 flex items-center gap-1.5"
                    >
                      <span className="text-brand-accent">💬</span>
                      <span>"{prompt}"</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-brand-border pt-6">
            <button type="button" disabled={submitting} onClick={() => setStep(step - 1)} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-brand-border px-5 py-3 text-base font-semibold disabled:opacity-50">
              <ArrowLeft size={18} /> Back
            </button>
            <div className="flex flex-wrap items-center gap-4">
              {!isInitialSetup && <button type="button" disabled={submitting} onClick={() => setView('agents')} className="min-h-12 px-3 text-base text-brand-muted">Cancel</button>}
              <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-accent px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-brand-accent-hover disabled:opacity-60">
                {submitting ? <><LoaderCircle size={18} className="animate-spin" /> Creating receptionist...</> : step === steps.length - 1 ? 'Create receptionist' : <>Continue <ArrowRight size={18} /></>}
              </button>
            </div>
          </div>
        </form>
      </div>}
    </div>
  );
};
