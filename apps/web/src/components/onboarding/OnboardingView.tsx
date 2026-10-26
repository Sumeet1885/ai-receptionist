import React, { useState, useRef } from 'react';
import { BUSINESS_TEMPLATES, BusinessTemplate } from '../../lib/businessTemplates';
import { LeadField } from '../../types';

interface OnboardingViewProps {
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
  handleCreateBot: (e: React.FormEvent) => void;
}

const LEAD_FIELD_OPTIONS: { id: LeadField; label: string; icon: string; desc: string }[] = [
  { id: 'name', label: 'Full Name', icon: '👤', desc: 'Caller / visitor name' },
  { id: 'phone', label: 'Phone Number', icon: '📞', desc: 'Contact phone for follow-up' },
  { id: 'email', label: 'Email Address', icon: '✉️', desc: 'Email for confirmations' },
  { id: 'requirement', label: 'Requirement / Purpose', icon: '🎯', desc: 'Service needed or reason for visit' },
  { id: 'budget', label: 'Budget / Financials', icon: '💰', desc: 'Budget range or price tier' },
];

export const OnboardingView: React.FC<OnboardingViewProps> = ({
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
  const formRef = useRef<HTMLDivElement>(null);
  const [highlightForm, setHighlightForm] = useState<boolean>(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    const match = BUSINESS_TEMPLATES.find(t => t.industry === newBotIndustry);
    return match ? match.id : 'healthcare';
  });

  const [notification, setNotification] = useState<string | null>(null);

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

    setNotification(`Loaded "${template.name}" template — pre-filled fields ready below!`);
    setHighlightForm(true);

    // Smooth scroll down to the pre-filled configuration form
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);

    setTimeout(() => {
      setHighlightForm(false);
    }, 2200);

    setTimeout(() => {
      setNotification(null);
    }, 6000);
  };

  const toggleLeadField = (fieldId: LeadField) => {
    if (newBotLeadFields.includes(fieldId)) {
      // Don't allow deselecting both name and phone
      if (newBotLeadFields.length <= 1) return;
      setNewBotLeadFields(newBotLeadFields.filter(f => f !== fieldId));
    } else {
      setNewBotLeadFields([...newBotLeadFields, fieldId]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-card via-brand-card/95 to-brand-bg rounded-2xl border border-brand-border p-6 lg:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-body font-semibold uppercase tracking-wider mb-3">
            <span>⚡ 1-Click Business Templates</span>
            <span className="w-1.5 h-1.5 rounded-full bg-brand-accent text-primary-foreground animate-pulse" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-brand-text tracking-tight">
            Create Your AI Receptionist
          </h1>
          <p className="text-sm sm:text-base text-brand-muted mt-2 max-w-2xl leading-relaxed">
            Choose a pre-trained business persona below to instantly load industry-specific conversational flows, appointment handling, and lead extraction fields in one click.
          </p>
        </div>
      </div>

      {/* Template Selector Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-brand-text flex items-center gap-2">
              <span>Choose a Business Persona</span>
              <span className="text-xs font-body font-normal text-brand-muted px-2 py-0.5 rounded bg-brand-bg border border-brand-border">
                1-Click Pre-fill
              </span>
            </h2>
            <p className="text-xs text-brand-muted mt-0.5">
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
                      <span className="text-[11px] font-body text-brand-accent uppercase tracking-wider font-semibold">
                        {tmpl.badge}
                      </span>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-body font-bold px-2 py-0.5 rounded-full bg-brand-success/15 border border-brand-success/40 text-brand-success">
                      ✓ Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-body text-brand-muted group-hover:text-brand-text transition-colors">
                      Select →
                    </span>
                  )}
                </div>

                {/* Tagline */}
                <p className="text-xs text-brand-muted leading-relaxed mb-4">
                  {tmpl.tagline}
                </p>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tmpl.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-sans px-2 py-0.5 rounded-md bg-brand-bg/90 border border-brand-border/80 text-brand-text/90"
                    >
                      {feat}
                    </span>
                  ))}
                </div>

                {/* Footer preview note */}
                <div className="pt-3 border-t border-brand-border/60 flex items-center justify-between text-[11px] text-brand-muted font-body">
                  <span>Pre-fills: Instructions + Extraction + Theme</span>
                  <span className={`font-semibold flex items-center gap-1 ${isSelected ? 'text-brand-accent' : 'text-brand-muted group-hover:text-brand-accent'}`}>
                    {isSelected ? 'Pre-filled below ↓' : 'Apply & View Fields ↓'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Notification Pill */}
        {notification && (
          <div className="p-3.5 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-between text-xs text-brand-text animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-brand-accent text-sm">✨</span>
              <span>{notification}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="text-brand-accent hover:underline font-body text-xs flex items-center gap-1 font-semibold"
              >
                Jump to Fields ↓
              </button>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className="text-brand-muted hover:text-brand-text font-body text-xs px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Configuration Form */}
      <div
        ref={formRef}
        id="prefilled-fields-section"
        className={`bg-brand-card rounded-2xl border transition-all duration-500 p-6 lg:p-10 shadow-xl relative scroll-mt-6 ${
          highlightForm
            ? 'border-brand-accent ring-4 ring-brand-accent/40 shadow-2xl shadow-brand-accent/20'
            : 'border-brand-border'
        }`}
      >
        {/* Pre-filled Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 mb-6 rounded-xl bg-brand-accent/10 border border-brand-accent/30 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-brand-accent text-base">✨</span>
            <div>
              <span className="font-bold text-brand-text">Persona Applied: </span>
              <span className="text-brand-accent font-semibold">
                {BUSINESS_TEMPLATES.find(t => t.id === selectedTemplateId)?.name || newBotIndustry}
              </span>
              <span className="text-brand-muted ml-1.5 hidden md:inline">
                — All fields below are pre-populated. Tweak anything or click Generate to launch immediately.
              </span>
            </div>
          </div>
          <span className="text-[11px] font-body text-brand-success bg-brand-success/15 border border-brand-success/30 px-2.5 py-0.5 rounded-full font-bold self-start sm:self-auto shrink-0">
            ✓ Pre-filled Ready
          </span>
        </div>
        <form onSubmit={handleCreateBot} className="space-y-8">
          {/* Section 1: Core Profile */}
          <div className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-brand-text flex items-center gap-2">
                <span>1. Business Profile</span>
              </h3>
              <span className="text-xs font-body text-brand-muted">Step 1 of 4</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider font-body">
                    Business / Clinic / Agency Name
                  </label>
                  <span className="text-[10px] font-body text-brand-muted">{(newBotName || '').length}/100</span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="e.g., SmileCare Dental & Wellness Clinic"
                  className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-sm focus:ring-1 focus:ring-brand-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-body">
                  Industry Sector
                </label>
                <select
                  value={newBotIndustry}
                  onChange={(e) => setNewBotIndustry(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text focus:outline-none transition duration-200 font-sans text-sm focus:ring-1 focus:ring-brand-accent"
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
          </div>

          {/* Section 2: Chatbot Branding & Tone */}
          <div className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-brand-text">
                2. AI Greeting & Branding
              </h3>
              <span className="text-xs font-body text-brand-muted">Step 2 of 4</span>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider font-body">
                  AI Receptionist Greeting Message
                </label>
                <span className="text-[10px] font-body text-brand-muted">{(newBotGreeting || '').length}/400</span>
              </div>
              <textarea
                rows={3}
                maxLength={400}
                value={newBotGreeting}
                onChange={(e) => setNewBotGreeting(e.target.value)}
                placeholder="Welcome to our business! I am your virtual receptionist..."
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-sm leading-relaxed focus:ring-1 focus:ring-brand-accent"
              />
              <p className="text-[11px] text-brand-muted mt-1.5 font-sans">
                This is spoken as the opening line for incoming voice calls and shown as the initial greeting in web chat.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div>
                <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-body">
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
                      className={`w-10 h-10 rounded-full border-2 transition duration-200 flex items-center justify-center ${
                        newBotColor === c.id ? 'border-brand-text scale-110 shadow-md ring-2 ring-brand-text/30' : 'border-transparent opacity-80 hover:opacity-100'
                      } ${c.bg}`}
                    >
                      {newBotColor === c.id && <span className="text-white text-xs font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Lead & Appointment Extraction Fields */}
          <div className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-bold text-brand-text flex items-center gap-2">
                  <span>3. Caller Qualification & Extraction Fields</span>
                </h3>
              </div>
              <span className="text-xs font-body text-brand-muted">Step 3 of 4</span>
            </div>

            <p className="text-xs text-brand-muted leading-relaxed font-sans">
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
                        <span className="text-xs font-bold font-sans text-brand-text">
                          {field.label}
                        </span>
                        <span className={`text-[11px] font-body ${isActive ? 'text-brand-accent font-bold' : 'text-brand-muted'}`}>
                          {isActive ? '✓ ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-muted mt-0.5 truncate">
                        {field.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Training Knowledge Base & FAQ */}
          <div className="space-y-4">
            <div className="border-b border-brand-border pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-display font-bold text-brand-text">
                  4. Knowledge Base & Domain Training
                </h3>
                <span className="text-[10px] text-brand-accent font-body tracking-widest bg-brand-accent/10 border border-brand-accent/30 px-2 py-0.5 rounded uppercase">
                  RAG Engine Ready
                </span>
              </div>
              <span className="text-xs font-body text-brand-muted">Step 4 of 4</span>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-brand-muted leading-relaxed font-sans">
                The AI receptionist uses this domain knowledge to answer complex caller questions, check doctor/agent schedules, give accurate pricing, and triage emergency calls.
              </p>
              <span className="text-[10px] font-body text-brand-muted shrink-0">
                {(newBotKB || '').length}/3000
              </span>
            </div>
            
            <div>
              <textarea
                rows={8}
                required
                maxLength={3000}
                value={newBotKB}
                onChange={(e) => setNewBotKB(e.target.value)}
                placeholder="Enter services, pricing, provider schedules, policies, emergency protocol, location, and hours..."
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-sm leading-relaxed font-body text-xs focus:ring-1 focus:ring-brand-accent"
              />
            </div>

            {/* Quick Prompts Preview */}
            {newBotPrompts && newBotPrompts.length > 0 && (
              <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-body uppercase tracking-wider text-brand-muted font-semibold">
                    Pre-configured Starter Prompts (Shown to Callers & Chatters)
                  </span>
                  <span className="text-[10px] font-body text-brand-accent">Auto-generated</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {newBotPrompts.map((prompt, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2.5 py-1 rounded-md bg-brand-card border border-brand-border text-brand-text/90 flex items-center gap-1.5"
                    >
                      <span className="text-brand-accent">💬</span>
                      <span>"{prompt}"</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Create CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-brand-border">
            <div className="text-xs text-brand-muted flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-success" />
              <span>Ready for immediate deployment upon generation</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setView('landing')}
                className="w-full sm:w-auto px-6 py-2.5 bg-brand-bg hover:bg-brand-card border border-brand-border text-brand-text font-sans font-semibold text-sm rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-2.5 bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground border border-brand-border font-sans font-bold text-sm rounded-lg shadow-lg hover:shadow-brand-accent/20 transition flex items-center justify-center gap-2"
              >
                <span>⚡ Generate Live AI Receptionist</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
