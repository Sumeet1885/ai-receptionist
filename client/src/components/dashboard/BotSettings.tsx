import React, { useState, useEffect } from 'react';
import { Bot, LeadField, WidgetConfig, WidgetLauncherPosition, WidgetLauncherStyle, WidgetRadius, WidgetSize } from '../../types';
import { AllowedDomainsEditor } from './AllowedDomainsEditor';
import { normalizeDomains } from '../../lib/domain';
import { isThemePresetActive, WidgetThemePreset, widgetThemePresets } from '../../lib/widgetThemes';
import { supabase } from '../../lib/supabaseClient';
import { dograhApi } from '../../modules/phone-calls/dograhApi';

interface BotSettingsProps {
  bots: Bot[];
  setBots: React.Dispatch<React.SetStateAction<Bot[]>>;
  activeBot: Bot;
  showToast: (message: string, type?: 'success' | 'error') => void;
  updateBot: (id: string, updates: Partial<{
    businessName: string;
    industry: string;
    greeting: string;
    primaryColor: string;
    knowledgeBase: string;
    allowedDomains: string[];
    widgetConfig: WidgetConfig;
    phoneNumber: string;
  }>) => Promise<void>;
}

type SettingsSection = 'profile' | 'widget' | 'behavior' | 'knowledge' | 'security';

const sections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: 'profile', label: 'Profile', description: 'Name, industry, greeting' },
  { id: 'widget', label: 'Widget UI', description: 'Colors, launcher, layout' },
  { id: 'behavior', label: 'Behavior', description: 'Voice, calendar, lead fields' },
  { id: 'knowledge', label: 'Knowledge', description: 'Facts and FAQs' },
  { id: 'security', label: 'Security', description: 'Allowed domains' }
];

const leadFields: Array<{ id: LeadField; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
  { id: 'requirement', label: 'Requirement' },
  { id: 'budget', label: 'Budget' }
];

const DEFAULT_INBOUND_TEMPLATE = `You are the Virtual AI Receptionist representing "{{business_name}}" ({{industry}} sector).

CURRENT TIME: {{current_time}}

BUSINESS & SERVICE KNOWLEDGE:
{{knowledge_base}}

YOUR ROLE & GOALS:
1. Warmly answer caller questions strictly based on the knowledge base above.
2. Inquire politely about their specific requirement, preferences, or timing.
3. Naturally collect lead details during conversation: {{lead_fields}}.
4. Proactively invite the caller for an on-site visit or consultation this weekend (Saturday/Sunday) if they show interest.
5. If caller asks for a human specialist/team handoff, politely confirm our team will connect with them.

VOICE & TELEPHONY GUIDELINES:
- Speak polite, natural Marathi-English.
- HONORIFICS: NEVER say "सर/मॅडम" or "Sir/Madam" together. Use "सर" ONLY for male, "मॅडम" ONLY for female. If gender is uncertain, do not use any honorific.
- CLOSING: When concluding or saying goodbye, say: "खूप खूप धन्यवाद, बाय, have a good day!". NEVER say "नमस्कार" or "namaskar" at the end of the call.
- Keep turns concise (1-2 sentences). Ask only 1 question at a time.
- Never invent prices, offers, or specs not in {{knowledge_base}}.
- Never disclose underlying AI platform or models.`;

const DEFAULT_OUTBOUND_TEMPLATE = `This is an OUTBOUND call for {{business_name}}. You are Priya, a warm, polite and highly natural telecaller. Follow this CONVERSATION FLOW in exact order:

STEP 1 (GREETING & PURPOSE):
{{greeting}}
Ask: "आम्ही {{business_name}} कडून आपल्याला याविषयी विशेष माहिती देण्यासाठी कॉल केला आहे. आपल्याला १ मिनिट बोलायला सोयीचं पडेल का सर/मॅडम?".

STEP 2 (QUALIFYING & REQUIREMENT):
Ask 1 polite question inquiring about their requirement, interest, or current preferences. Keep dialogue concise.

STEP 3 (TIMELINE & BUDGET):
When customer shares their requirement, ask politely about their preferred schedule or budget planning.

STEP 4 (VALUE PROPOSITION & HIGHLIGHTS):
Share 2 attractive sentences highlighting {{business_name}}'s key benefits and offerings strictly based on {{knowledge_base}}.

STEP 5 (PROPOSE VISIT OR APPOINTMENT):
Proactively propose: "आपण या वीकेंडला प्रत्यक्ष व्हिजिट किंवा अपॉइंटमेंट करूया का सर/मॅडम? शनिवारी सोयीचं पडेल की रविवारी? सकाळची वेळ बरी पडेल की दुपारची?". Confirm day and time.

STEP 6 (OBJECTIONS & QUESTIONS):
Answer any customer questions using {{knowledge_base}}. If they ask for brochure or details: "नक्कीच सर/मॅडम, मी आमच्या टीमकडून सर्व सविस्तर माहिती लगेच पाठवून देते.".

STEP 7 (WHATSAPP SUMMARY & CLOSE):
Say: "मी लगेच याच नंबरवर व्हॉट्सॲपला सर्व तपशील पाठवून देते. खूप खूप धन्यवाद {{contact_name}} सर/मॅडम, आपला दिवस चांगला जावो!" and end the call.

CRITICAL RULES:
- Never repeat sentences or questions already said.
- Brief/unclear audio: acknowledge "हो सर/मॅडम, ऐकू येतंय मला. बोला ना?".
- When customer agrees, move to the next step immediately.
- Never ask for phone number on outbound calls; always ask to confirm the current number.
- Strictly adhere to facts in {{knowledge_base}}. Never invent pricing.`;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted mb-1.5">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-10 bg-brand-bg border border-brand-border rounded-md px-3 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition ${props.className || ''}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-brand-bg border border-brand-border rounded-md px-3 py-2.5 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition ${props.className || ''}`}
    />
  );
}

function ColorControl({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-brand-border bg-brand-bg px-3 py-2 cursor-pointer hover:border-brand-muted transition">
      <span>
        <span className="block text-xs font-semibold text-brand-text">{label}</span>
        <span className="block mt-0.5 text-[10px] font-mono uppercase text-brand-muted">{value}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-10 rounded border border-brand-border bg-transparent p-0.5 cursor-pointer"
        aria-label={`${label} color`}
      />
    </label>
  );
}

function SelectControl<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-9 px-3 rounded-md border text-xs font-semibold transition ${
            value === option.value
              ? 'bg-brand-accent text-brand-bg border-brand-accent'
              : 'bg-brand-bg text-brand-muted border-brand-border hover:text-brand-text'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
  disabled,
  statusLabel
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  statusLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`flex items-center justify-between gap-3 h-11 px-3 rounded-md border text-sm transition ${
        disabled
          ? 'opacity-70 cursor-not-allowed bg-brand-bg/60 border-brand-border'
          : 'bg-brand-bg hover:bg-brand-card border-brand-border cursor-pointer text-brand-text'
      }`}
    >
      <span className="font-medium text-brand-text">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            statusLabel
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : checked
                ? 'bg-brand-accent/20 text-brand-accent'
                : 'bg-brand-card text-brand-muted border border-brand-border'
          }`}
        >
          {statusLabel || (checked ? 'ON' : 'OFF')}
        </span>
        <span className={`w-9 h-5 rounded-full p-0.5 transition ${checked ? 'bg-brand-accent' : 'bg-brand-border'}`}>
          <span className={`block w-4 h-4 rounded-full bg-brand-text transition ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </span>
      </div>
    </button>
  );
}

export const BotSettings: React.FC<BotSettingsProps> = ({ bots, setBots, activeBot, showToast, updateBot }) => {
  const [section, setSection] = useState<SettingsSection>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const secParam = params.get('section');
      if (secParam && ['profile', 'widget', 'behavior', 'knowledge', 'security'].includes(secParam)) {
        return secParam as SettingsSection;
      }
      const hash = window.location.hash.replace('#', '');
      if (hash && ['profile', 'widget', 'behavior', 'knowledge', 'security'].includes(hash)) {
        return hash as SettingsSection;
      }
    } catch {
      // ignore
    }
    return 'profile';
  });
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [calendarProvider, setCalendarProvider] = useState<string | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState<boolean>(true);
  const [kbSubTab, setKbSubTab] = useState<'general' | 'inbound' | 'outbound'>('general');

  useEffect(() => {
    let isMounted = true;
    async function checkCalendar() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (isMounted) setLoadingCalendar(false);
          return;
        }
        const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
        const res = await fetch(`${expressUrl}/api/calendar/status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setCalendarConnected(Boolean(data.connected));
            setCalendarProvider(data.provider || null);
          }
        }
      } catch (err) {
        console.error('Failed to check calendar status in BotSettings:', err);
      } finally {
        if (isMounted) setLoadingCalendar(false);
      }
    }
    checkCalendar();
    return () => { isMounted = false; };
  }, []);

  // Auto-sync: if calendar is definitely not connected, ensure the receptionist booking toggle is OFF
  useEffect(() => {
    if (calendarConnected === false && activeBot.widgetConfig.enableCalendar) {
      patchConfig({ enableCalendar: false });
    }
  }, [calendarConnected, activeBot.widgetConfig.enableCalendar]);

  const handleSectionChange = (sec: SettingsSection) => {
    setSection(sec);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('section', sec);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  };

  const navigateToCalendar = () => {
    window.history.pushState({}, '', '/calendar');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const patchActiveBot = (patch: Partial<Bot>) => {
    setBots(bots.map(b => b.id === activeBot.id ? { ...b, ...patch } : b));
  };

  const patchConfig = (patch: Partial<WidgetConfig>) => {
    patchActiveBot({ widgetConfig: { ...activeBot.widgetConfig, ...patch } });
  };

  const [aiPromptInstruction, setAiPromptInstruction] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptRevertHistory, setPromptRevertHistory] = useState<{
    inbound?: string;
    outbound?: string;
  }>({});

  const handleGeneratePrompt = async (type: 'inbound' | 'outbound') => {
    if (!aiPromptInstruction.trim() || isGeneratingPrompt) return;
    setIsGeneratingPrompt(true);
    try {
      const current = type === 'outbound'
        ? activeBot.widgetConfig.outboundPromptTemplate || ''
        : activeBot.widgetConfig.inboundPromptTemplate || '';
      setPromptRevertHistory(prev => ({ ...prev, [type]: current }));

      const res = await dograhApi.generatePrompt(activeBot.id, {
        userInstruction: aiPromptInstruction.trim(),
        type,
      });

      if (res && res.generatedTemplate) {
        if (type === 'outbound') {
          patchConfig({ outboundPromptTemplate: res.generatedTemplate });
        } else {
          patchConfig({ inboundPromptTemplate: res.generatedTemplate });
        }
        showToast('✨ AI prompt template generated! Review and click Save Changes.');
        setAiPromptInstruction('');
      } else {
        throw new Error('Empty template returned');
      }
    } catch (err: any) {
      console.error('Failed to generate prompt template:', err);
      showToast('Prompt generation failed: ' + (err?.message || err), 'error');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleRevertPrompt = (type: 'inbound' | 'outbound') => {
    const prev = promptRevertHistory[type];
    if (prev !== undefined) {
      if (type === 'outbound') {
        patchConfig({ outboundPromptTemplate: prev });
      } else {
        patchConfig({ inboundPromptTemplate: prev });
      }
      setPromptRevertHistory(old => ({ ...old, [type]: undefined }));
      showToast('Reverted to previous prompt template');
    }
  };

  const outboundInspirations = [
    { label: 'Real Estate Plots (Marathi)', icon: '🏡', text: 'Sell gated township villa plots in South Nagpur. Warm Marathi greeting, ask sqft & budget, pitch 1km riverfront & NMRDA approval, confirm weekend site visit.' },
    { label: '2BHK/3BHK Luxury Flats (Hindi)', icon: '🏢', text: 'Call prospective buyers for 2BHK and 3BHK luxury apartments in Pune. Inquire current rent vs buy, pitch modern amenities, offer Saturday morning site tour in Hindi/English.' },
    { label: 'Dental Clinic Checkup (English)', icon: '🏥', text: 'Follow up with clinic inquiries for a free dental hygiene checkup camp this Friday. Inquire tooth pain/cleaning needs, confirm 15-min slot.' },
    { label: 'B2B SaaS Demo (English)', icon: '💼', text: 'Outbound qualification call for sales automation software. Ask how they currently track leads, pitch 3x response speed, and book a 15-min product walkthrough.' },
  ];

  const inboundInspirations = [
    { label: 'Real Estate Sales Desk', icon: '🏢', text: 'Receptionist for Lok8 Brookside. Warmly greet in Marathi/English, answer queries on plot prices and RERA approval, collect name/phone, invite for weekend visit.' },
    { label: 'Dental Clinic Reception', icon: '🏥', text: 'Clinic front desk receptionist. Answer patient queries on timings, doctor specialties, consultation charges, and help schedule an appointment.' },
    { label: 'Customer Support Desk', icon: '📞', text: 'Polite frontline customer service. Answer common product FAQs, troubleshoot issues, and transfer complex complaints to senior executive.' },
  ];

  const applyThemePreset = (preset: WidgetThemePreset) => {
    patchConfig({
      theme: preset.theme,
      primaryColor: preset.primaryColor,
      backgroundColor: preset.backgroundColor,
      surfaceColor: preset.surfaceColor,
      textColor: preset.textColor,
    });
  };

  const toggleLeadField = (field: LeadField) => {
    const current = activeBot.widgetConfig.requiredLeadFields;
    patchConfig({
      requiredLeadFields: current.includes(field)
        ? current.filter(item => item !== field)
        : [...current, field]
    });
  };

  const updatePrompt = (index: number, value: string) => {
    const prompts = [...activeBot.widgetConfig.suggestedPrompts];
    prompts[index] = value;
    patchConfig({ suggestedPrompts: prompts });
  };

  const addPrompt = () => {
    if (activeBot.widgetConfig.suggestedPrompts.length >= 4) return;
    patchConfig({ suggestedPrompts: [...activeBot.widgetConfig.suggestedPrompts, ''] });
  };

  const removePrompt = (index: number) => {
    patchConfig({ suggestedPrompts: activeBot.widgetConfig.suggestedPrompts.filter((_, i) => i !== index) });
  };

  const saveChanges = async () => {
    try {
      const cleanConfig = {
        ...activeBot.widgetConfig,
        assistantName: activeBot.widgetConfig.assistantName.trim(),
        avatarText: activeBot.widgetConfig.avatarText.trim().slice(0, 3).toUpperCase(),
        suggestedPrompts: activeBot.widgetConfig.suggestedPrompts.map(prompt => prompt.trim()).filter(Boolean),
        launcherText: activeBot.widgetConfig.launcherText.trim() || 'Chat',
        inputPlaceholder: activeBot.widgetConfig.inputPlaceholder.trim() || 'Type a message...',
        additionalCollectInfo: activeBot.widgetConfig.additionalCollectInfo?.trim() || '',
        inboundPromptTemplate: activeBot.widgetConfig.inboundPromptTemplate?.trim() || '',
        outboundPromptTemplate: activeBot.widgetConfig.outboundPromptTemplate?.trim() || ''
      };

      await updateBot(activeBot.id, {
        businessName: activeBot.businessName.trim(),
        industry: activeBot.industry.trim(),
        greeting: activeBot.greeting,
        primaryColor: activeBot.primaryColor,
        knowledgeBase: activeBot.knowledgeBase,
        allowedDomains: normalizeDomains(activeBot.allowedDomains || []),
        widgetConfig: cleanConfig,
        phoneNumber: (activeBot.phoneNumber || '').trim()
      });

      // Synchronize live voice workflows on Dograh in background so prompt changes take effect immediately
      if (activeBot.id) {
        dograhApi.provision(activeBot.id).catch(err => {
          console.warn('[BotSettings] Background workflow update:', err);
        });
      }

      showToast('Agent settings saved');
    } catch (err: any) {
      console.error('Failed to save agent settings:', err);
      showToast('Failed to save changes: ' + (err.message || err), 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[230px_1fr] gap-4">
      <nav className="bg-brand-card border border-brand-border rounded-lg p-2 h-fit">
        {sections.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSectionChange(item.id)}
            className={`w-full text-left px-3 py-2.5 rounded-md transition ${section === item.id ? 'bg-brand-accent text-brand-bg' : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}
          >
            <div className="flex items-center justify-between">
              <span className="block text-sm font-bold">{item.label}</span>
              {item.id === 'behavior' && !loadingCalendar && calendarConnected === false && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.5 rounded border border-amber-500/30">
                  Calendar
                </span>
              )}
            </div>
            <span className="block text-[11px] opacity-75 mt-0.5">{item.description}</span>
          </button>
        ))}
      </nav>

      <section className="bg-brand-card border border-brand-border rounded-lg p-4 sm:p-5 min-h-[480px]">
        {section === 'profile' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between items-center">
                  <FieldLabel>Business Name</FieldLabel>
                  <span className="text-[10px] font-mono text-brand-muted">{(activeBot.businessName || '').length}/100</span>
                </div>
                <TextInput maxLength={100} value={activeBot.businessName} onChange={(e) => patchActiveBot({ businessName: e.target.value })} />
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <FieldLabel>Industry</FieldLabel>
                  <span className="text-[10px] font-mono text-brand-muted">{(activeBot.industry || '').length}/100</span>
                </div>
                <TextInput maxLength={100} value={activeBot.industry} onChange={(e) => patchActiveBot({ industry: e.target.value })} />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center">
                <FieldLabel>Business Contact Phone</FieldLabel>
                <span className="text-[10px] font-mono text-brand-muted">Optional</span>
              </div>
              <TextInput
                maxLength={30}
                placeholder="+1 (555) 000-0000"
                value={activeBot.phoneNumber || ''}
                onChange={(e) => patchActiveBot({ phoneNumber: e.target.value })}
              />
              <p className="text-[11px] text-brand-muted mt-1">Shared by the AI receptionist during human handoffs and direct callback requests.</p>
            </div>
            <div>
              <div className="flex justify-between items-center">
                <FieldLabel>Greeting</FieldLabel>
                <span className="text-[10px] font-mono text-brand-muted">{(activeBot.greeting || '').length}/400</span>
              </div>
              <TextArea maxLength={400} rows={3} value={activeBot.greeting} onChange={(e) => patchActiveBot({ greeting: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between items-center">
                  <FieldLabel>Assistant Display Name</FieldLabel>
                  <span className="text-[10px] font-mono text-brand-muted">{(activeBot.widgetConfig.assistantName || '').length}/50</span>
                </div>
                <TextInput maxLength={50} placeholder={activeBot.businessName} value={activeBot.widgetConfig.assistantName} onChange={(e) => patchConfig({ assistantName: e.target.value })} />
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <FieldLabel>Avatar Text</FieldLabel>
                  <span className="text-[10px] font-mono text-brand-muted">{(activeBot.widgetConfig.avatarText || '').length}/3</span>
                </div>
                <TextInput maxLength={3} placeholder={activeBot.businessName.slice(0, 2).toUpperCase()} value={activeBot.widgetConfig.avatarText} onChange={(e) => patchConfig({ avatarText: e.target.value.toUpperCase() })} />
              </div>
            </div>
          </div>
        )}

        {section === 'widget' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Size</FieldLabel>
                <SelectControl<WidgetSize>
                  value={activeBot.widgetConfig.widgetSize}
                  onChange={(widgetSize) => patchConfig({ widgetSize })}
                  options={[{ value: 'compact', label: 'Compact' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }]}
                />
              </div>
              <div>
                <FieldLabel>Launcher Position</FieldLabel>
                <SelectControl<WidgetLauncherPosition>
                  value={activeBot.widgetConfig.launcherPosition}
                  onChange={(launcherPosition) => patchConfig({ launcherPosition })}
                  options={[{ value: 'bottom-right', label: 'Right' }, { value: 'bottom-left', label: 'Left' }]}
                />
              </div>
              <div>
                <FieldLabel>Corners</FieldLabel>
                <SelectControl<WidgetRadius>
                  value={activeBot.widgetConfig.radius}
                  onChange={(radius) => patchConfig({ radius })}
                  options={[{ value: 'sharp', label: 'Sharp' }, { value: 'soft', label: 'Soft' }, { value: 'rounded', label: 'Rounded' }]}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
              <div>
                <div className="flex justify-between items-center">
                  <FieldLabel>Launcher Text</FieldLabel>
                  <span className="text-[10px] font-mono text-brand-muted">{(activeBot.widgetConfig.launcherText || '').length}/24</span>
                </div>
                <TextInput maxLength={24} value={activeBot.widgetConfig.launcherText} onChange={(e) => patchConfig({ launcherText: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Launcher Style</FieldLabel>
                <SelectControl<WidgetLauncherStyle>
                  value={activeBot.widgetConfig.launcherStyle}
                  onChange={(launcherStyle) => patchConfig({ launcherStyle })}
                  options={[{ value: 'icon', label: 'Icon' }, { value: 'text', label: 'Text' }]}
                />
              </div>
            </div>
          </div>
        )}

        {section === 'behavior' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                <div className="space-y-2">
                  {calendarConnected === true && activeBot.widgetConfig.enableCalendar ? (
                    <div className="rounded-xl border border-brand-success/30 bg-brand-success/5 p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-brand-success/15 border border-brand-success/30 flex items-center justify-center shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-brand-success shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-brand-text">Calendar Booking</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-brand-success/20 text-brand-success border border-brand-success/30">
                              ON
                            </span>
                          </div>
                          <p className="text-[11px] text-brand-muted truncate mt-0.5">
                            Connected to {calendarProvider || 'Google'} Calendar · Automated booking active
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={navigateToCalendar}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-brand-card hover:bg-brand-bg text-brand-text border border-brand-border transition flex items-center gap-1.5 shrink-0 cursor-pointer hover:border-brand-accent/40"
                      >
                        <span>Calendar Settings</span>
                        <span>→</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-brand-text">Calendar Booking</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              OFF
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-300/80 truncate mt-0.5">
                            {calendarConnected === false ? 'No calendar connected' : 'Turned OFF in Calendar'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={navigateToCalendar}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-brand-card hover:bg-brand-bg text-brand-accent border border-brand-border transition flex items-center gap-1.5 shrink-0 cursor-pointer hover:border-brand-accent/40"
                      >
                        <span>Manage in Calendar</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Toggle checked={activeBot.widgetConfig.showPoweredBy} label="Powered by label" onChange={(showPoweredBy) => patchConfig({ showPoweredBy })} />
                </div>
              </div>
            </div>
            {activeBot.widgetConfig.enableCalendar && (
              <div>
                <FieldLabel>Max Booking Window</FieldLabel>
                <SelectControl<string>
                  value={activeBot.widgetConfig.maxBookingDaysAhead ? String(activeBot.widgetConfig.maxBookingDaysAhead) : 'none'}
                  onChange={(value) => patchConfig({ maxBookingDaysAhead: value === 'none' ? undefined : Number(value) })}
                  options={[
                    { value: 'none', label: 'No limit' },
                    { value: '7', label: 'Next 7 days' },
                    { value: '14', label: 'Next 14 days' },
                    { value: '30', label: 'Next 30 days' },
                    { value: '60', label: 'Next 60 days' },
                    { value: '90', label: 'Next 90 days' },
                  ]}
                />
                <p className="text-[11px] text-brand-muted mt-1">How far ahead visitors can book an appointment. Applies to phone calls, chat, and voice calls alike.</p>
              </div>
            )}
            <div>
              <div className="flex justify-between items-center">
                <FieldLabel>Input Placeholder</FieldLabel>
                <span className="text-[10px] font-mono text-brand-muted">{(activeBot.widgetConfig.inputPlaceholder || '').length}/80</span>
              </div>
              <TextInput maxLength={80} value={activeBot.widgetConfig.inputPlaceholder} onChange={(e) => patchConfig({ inputPlaceholder: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Suggested Prompts</FieldLabel>
              <div className="space-y-2">
                {activeBot.widgetConfig.suggestedPrompts.map((prompt, index) => (
                  <div key={index} className="flex gap-2">
                    <div className="flex-1 relative flex items-center">
                      <TextInput maxLength={80} className="pr-12" value={prompt} onChange={(e) => updatePrompt(index, e.target.value)} placeholder="What are your fees?" />
                      <span className="absolute right-3 text-[10px] font-mono text-brand-muted">{(prompt || '').length}/80</span>
                    </div>
                    <button type="button" onClick={() => removePrompt(index)} className="h-10 px-3 rounded-md border border-brand-border text-brand-danger hover:border-brand-danger/50 transition">Delete</button>
                  </div>
                ))}
                <button type="button" onClick={addPrompt} className="h-9 px-3 rounded-md border border-brand-border bg-brand-bg hover:bg-brand-card text-sm text-brand-text transition">
                  + Add prompt
                </button>
              </div>
            </div>
            <div>
              <FieldLabel>Required Lead Fields</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {leadFields.map(field => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => toggleLeadField(field.id)}
                    className={`h-9 px-3 rounded-md border text-xs font-bold transition ${activeBot.widgetConfig.requiredLeadFields.includes(field.id) ? 'bg-brand-accent text-brand-bg border-brand-accent' : 'bg-brand-bg text-brand-muted border-brand-border'}`}
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center">
                <FieldLabel>Additional Info to Collect (Optional)</FieldLabel>
                <span className="text-[10px] font-mono text-brand-muted">{(activeBot.widgetConfig.additionalCollectInfo || '').length}/500</span>
              </div>
              <TextInput
                maxLength={500}
                placeholder="e.g. Company name, budget limits, custom queries"
                value={activeBot.widgetConfig.additionalCollectInfo || ''}
                onChange={(e) => patchConfig({ additionalCollectInfo: e.target.value })}
              />
            </div>
            <div>
              <div className="flex justify-between items-center">
                <FieldLabel>Human Handoff Text</FieldLabel>
                <span className="text-[10px] font-mono text-brand-muted">{(activeBot.widgetConfig.handoffText || '').length}/180</span>
              </div>
              <TextArea maxLength={180} rows={2} value={activeBot.widgetConfig.handoffText} onChange={(e) => patchConfig({ handoffText: e.target.value })} />
            </div>
          </div>
        )}

        {section === 'knowledge' && (
          <div>
            {/* Sub-tab Switcher: Business Knowledge vs Inbound Call Prompt vs Outbound Telecaller Prompt */}
            <div className="flex items-center gap-1.5 p-1 mb-5 bg-brand-bg rounded-lg border border-brand-border w-fit flex-wrap">
              <button
                type="button"
                onClick={() => setKbSubTab('general')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${
                  kbSubTab === 'general'
                    ? 'bg-brand-card text-brand-text shadow-sm border border-brand-border'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <span>🏢</span>
                <span>Business Knowledge Base</span>
              </button>
              <button
                type="button"
                onClick={() => setKbSubTab('inbound')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${
                  kbSubTab === 'inbound'
                    ? 'bg-brand-accent text-brand-bg shadow-sm font-extrabold'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <span>📥</span>
                <span>Inbound Call Prompt Template</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                  kbSubTab === 'inbound' ? 'bg-brand-bg/30 text-brand-bg' : 'bg-brand-accent/20 text-brand-accent'
                }`}>
                  Inbound Voice
                </span>
              </button>
              <button
                type="button"
                onClick={() => setKbSubTab('outbound')}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${
                  kbSubTab === 'outbound'
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <span>📤</span>
                <span>Outbound Telecaller Prompt Template</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                  kbSubTab === 'outbound' ? 'bg-white/30 text-white' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  Outbound Telecaller
                </span>
              </button>
            </div>

            {kbSubTab === 'general' && (
              <div>
                {!loadingCalendar && calendarConnected === false && (
                  <div className="mb-4 p-3 bg-brand-bg border border-brand-border rounded-lg text-xs text-brand-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-sm">📅</span>
                      <span>Want your receptionist to check availability and book visits? Connect your calendar first at <strong>Calendar Settings</strong>.</span>
                    </div>
                    <button
                      type="button"
                      onClick={navigateToCalendar}
                      className="font-mono text-brand-accent hover:text-brand-accent-hover font-bold text-[11px] shrink-0 cursor-pointer"
                    >
                      Connect Calendar →
                    </button>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <div>
                    <FieldLabel>Knowledge Base & Facts</FieldLabel>
                    <p className="text-xs text-brand-muted mb-2">Facts, pricing, property specifications, and FAQs used by both website chat and voice receptionists.</p>
                  </div>
                  <span className="text-[10px] font-mono text-brand-muted self-start">{(activeBot.knowledgeBase || '').length}/3000</span>
                </div>
                <TextArea maxLength={3000} rows={15} value={activeBot.knowledgeBase} onChange={(e) => patchActiveBot({ knowledgeBase: e.target.value })} />
              </div>
            )}

            {kbSubTab === 'inbound' && (
              <div className="space-y-4">
                {/* ✨ AI 1-Line Inbound Receptionist Prompt Architect */}
                <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-brand-card/90 to-brand-card p-4 sm:p-5 shadow-lg shadow-emerald-950/20 backdrop-blur-md">
                  <div className="absolute -top-12 -right-12 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/30 font-bold text-sm">
                          ✨
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold bg-gradient-to-r from-emerald-200 via-teal-100 to-cyan-200 bg-clip-text text-transparent">
                              AI 1-Line Receptionist Prompt Architect
                            </h4>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                              Instant Auto-Craft
                            </span>
                          </div>
                          <p className="text-xs text-brand-muted mt-0.5">
                            Type a 1-line requirement — our AI automatically generates the complete receptionist voice instructions with dynamic variables.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {promptRevertHistory.inbound !== undefined && (
                          <button
                            type="button"
                            onClick={() => handleRevertPrompt('inbound')}
                            className="text-xs font-mono text-amber-400 hover:text-amber-300 transition flex items-center gap-1.5 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/30"
                          >
                            <span>↺</span>
                            <span>Undo Generated Prompt</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => patchConfig({ inboundPromptTemplate: DEFAULT_INBOUND_TEMPLATE })}
                          className="px-3 py-1.5 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-border text-xs text-brand-muted hover:text-brand-text font-semibold transition cursor-pointer"
                        >
                          Reset to Default Script
                        </button>
                      </div>
                    </div>

                    <div className="relative mt-3">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={aiPromptInstruction}
                          onChange={(e) => setAiPromptInstruction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isGeneratingPrompt && aiPromptInstruction.trim()) {
                              handleGeneratePrompt('inbound');
                            }
                          }}
                          placeholder='e.g. "Warmly greet callers for Lok8, answer questions on plot sizes/price, collect phone, invite for weekend visit."'
                          className="w-full h-11 bg-brand-bg/90 border border-emerald-500/40 rounded-lg pl-4 pr-32 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner"
                          disabled={isGeneratingPrompt}
                        />
                        <button
                          type="button"
                          onClick={() => handleGeneratePrompt('inbound')}
                          disabled={isGeneratingPrompt || !aiPromptInstruction.trim()}
                          className={`absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                            isGeneratingPrompt
                              ? 'bg-emerald-600/50 text-emerald-200 cursor-not-allowed'
                              : !aiPromptInstruction.trim()
                                ? 'bg-brand-border/60 text-brand-muted cursor-not-allowed'
                                : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98]'
                          }`}
                        >
                          {isGeneratingPrompt ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Crafting...</span>
                            </>
                          ) : (
                            <>
                              <span>✨</span>
                              <span>Generate</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Quick 1-Click Goal Inspiration Chips */}
                      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-emerald-300/70 uppercase font-bold tracking-wider mr-1">
                          Try 1-Click Goal:
                        </span>
                        {inboundInspirations.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => {
                              setAiPromptInstruction(chip.text);
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-md bg-brand-bg/80 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-brand-muted hover:text-emerald-200 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <span>{chip.icon}</span>
                            <span>{chip.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Auto-Injected Runtime Variables inside Generator Card */}
                      <div className="mt-3 pt-3 border-t border-emerald-500/20 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-emerald-300 font-bold uppercase tracking-wider">
                            Auto-Injected Runtime Values:
                          </span>
                          {['{{business_name}}', '{{knowledge_base}}', '{{current_time}}', '{{lead_fields}}'].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                const current = activeBot.widgetConfig.inboundPromptTemplate || '';
                                patchConfig({ inboundPromptTemplate: current ? `${current}\n${tag}` : tag });
                              }}
                              className="px-2 py-0.5 rounded bg-brand-bg hover:bg-emerald-500/20 border border-emerald-500/30 font-mono text-[10px] text-emerald-300 transition cursor-pointer"
                              title="Click to insert into template"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                        <span className="text-[10px] text-brand-muted">
                          AI automatically inserts & binds these variables in the voice pipeline
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <FieldLabel>Inbound Call Persona & Instructions</FieldLabel>
                    <span className="text-[10px] font-mono text-brand-muted">
                      {(activeBot.widgetConfig.inboundPromptTemplate || '').length}/5000
                    </span>
                  </div>
                  <TextArea
                    maxLength={5000}
                    rows={15}
                    placeholder={DEFAULT_INBOUND_TEMPLATE}
                    value={activeBot.widgetConfig.inboundPromptTemplate || ''}
                    onChange={(e) => patchConfig({ inboundPromptTemplate: e.target.value })}
                  />
                  <p className="text-[11px] text-brand-muted mt-1.5">
                    Leave blank to automatically use the standard Marathi real estate receptionist instruction.
                  </p>
                </div>
              </div>
            )}

            {kbSubTab === 'outbound' && (
              <div className="space-y-4">
                {/* ✨ AI 1-Line Telecaller Prompt Architect */}
                <div className="relative overflow-hidden rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-brand-card/90 to-brand-card p-4 sm:p-5 shadow-lg shadow-indigo-950/20 backdrop-blur-md">
                  <div className="absolute -top-12 -right-12 w-44 h-44 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 font-bold text-sm">
                          ✨
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold bg-gradient-to-r from-violet-200 via-indigo-100 to-sky-200 bg-clip-text text-transparent">
                              AI 1-Line Telecaller Prompt Architect
                            </h4>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                              Instant Auto-Craft
                            </span>
                          </div>
                          <p className="text-xs text-brand-muted mt-0.5">
                            Don't type 3,000 characters manually. Give a 1-line requirement — our AI automatically generates the complete 7-step telecalling script with variables and pacing.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {promptRevertHistory.outbound !== undefined && (
                          <button
                            type="button"
                            onClick={() => handleRevertPrompt('outbound')}
                            className="text-xs font-mono text-amber-400 hover:text-amber-300 transition flex items-center gap-1.5 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/30"
                          >
                            <span>↺</span>
                            <span>Undo Generated Script</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => patchConfig({ outboundPromptTemplate: DEFAULT_OUTBOUND_TEMPLATE })}
                          className="px-3 py-1.5 rounded-lg border border-brand-border bg-brand-bg hover:bg-brand-border text-xs text-brand-muted hover:text-brand-text font-semibold transition cursor-pointer"
                        >
                          Reset to 7-Step Script
                        </button>
                      </div>
                    </div>

                    <div className="relative mt-3">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={aiPromptInstruction}
                          onChange={(e) => setAiPromptInstruction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isGeneratingPrompt && aiPromptInstruction.trim()) {
                              handleGeneratePrompt('outbound');
                            }
                          }}
                          placeholder='e.g. "Sell 2BHK luxury flats in Pune. Speak Hindi/English, ask budget, pitch clubhouse, confirm Saturday visit."'
                          className="w-full h-11 bg-brand-bg/90 border border-indigo-500/40 rounded-lg pl-4 pr-32 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 transition shadow-inner"
                          disabled={isGeneratingPrompt}
                        />
                        <button
                          type="button"
                          onClick={() => handleGeneratePrompt('outbound')}
                          disabled={isGeneratingPrompt || !aiPromptInstruction.trim()}
                          className={`absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                            isGeneratingPrompt
                              ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed'
                              : !aiPromptInstruction.trim()
                                ? 'bg-brand-border/60 text-brand-muted cursor-not-allowed'
                                : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98]'
                          }`}
                        >
                          {isGeneratingPrompt ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Crafting...</span>
                            </>
                          ) : (
                            <>
                              <span>✨</span>
                              <span>Generate</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Quick 1-Click Goal Inspiration Chips */}
                      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-indigo-300/70 uppercase font-bold tracking-wider mr-1">
                          Try 1-Click Goal:
                        </span>
                        {outboundInspirations.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => {
                              setAiPromptInstruction(chip.text);
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-md bg-brand-bg/80 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 text-brand-muted hover:text-indigo-200 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <span>{chip.icon}</span>
                            <span>{chip.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Auto-Injected Runtime Variables inside Generator Card */}
                      <div className="mt-3 pt-3 border-t border-indigo-500/20 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-indigo-300 font-bold uppercase tracking-wider">
                            Auto-Injected Runtime Values:
                          </span>
                          {['{{business_name}}', '{{contact_name}}', '{{greeting}}', '{{knowledge_base}}', '{{current_time}}'].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                const current = activeBot.widgetConfig.outboundPromptTemplate || '';
                                patchConfig({ outboundPromptTemplate: current ? `${current}\n${tag}` : tag });
                              }}
                              className="px-2 py-0.5 rounded bg-brand-bg hover:bg-blue-500/20 border border-indigo-500/30 font-mono text-[10px] text-blue-400 transition cursor-pointer"
                              title="Click to insert into template"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                        <span className="text-[10px] text-brand-muted">
                          AI automatically inserts & binds these variables in the voice pipeline
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <FieldLabel>Outbound Telecaller Script & Instructions</FieldLabel>
                    <span className="text-[10px] font-mono text-brand-muted">
                      {(activeBot.widgetConfig.outboundPromptTemplate || '').length}/5000
                    </span>
                  </div>
                  <TextArea
                    maxLength={5000}
                    rows={18}
                    placeholder={DEFAULT_OUTBOUND_TEMPLATE}
                    value={activeBot.widgetConfig.outboundPromptTemplate || ''}
                    onChange={(e) => patchConfig({ outboundPromptTemplate: e.target.value })}
                  />
                  <p className="text-[11px] text-brand-muted mt-1.5">
                    Leave blank to automatically use the standard 7-step Marathi real estate telecalling script.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'security' && (
          <AllowedDomainsEditor
            domains={activeBot.allowedDomains || []}
            onChange={(domains) => patchActiveBot({ allowedDomains: domains })}
            description="Each customer website must be listed here before it can load this agent."
          />
        )}

        <div className="mt-5 pt-4 border-t border-brand-border flex justify-end">
          <button onClick={saveChanges} className="h-10 px-5 bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold rounded-md transition">
            Save Changes
          </button>
        </div>
      </section>
    </div>
  );
};
