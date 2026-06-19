import React, { useState } from 'react';
import { Bot, LeadField, WidgetConfig, WidgetLauncherPosition, WidgetLauncherStyle, WidgetRadius, WidgetSize } from '../../types';
import { AllowedDomainsEditor } from './AllowedDomainsEditor';
import { normalizeDomains } from '../../lib/domain';
import { isThemePresetActive, WidgetThemePreset, widgetThemePresets } from '../../lib/widgetThemes';

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
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 h-10 px-3 rounded-md border border-brand-border bg-brand-bg hover:bg-brand-card text-sm text-brand-text transition"
    >
      <span>{label}</span>
      <span className={`w-9 h-5 rounded-full p-0.5 transition ${checked ? 'bg-brand-accent' : 'bg-brand-border'}`}>
        <span className={`block w-4 h-4 rounded-full bg-brand-text transition ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

export const BotSettings: React.FC<BotSettingsProps> = ({ bots, setBots, activeBot, showToast, updateBot }) => {
  const [section, setSection] = useState<SettingsSection>('profile');

  const patchActiveBot = (patch: Partial<Bot>) => {
    setBots(bots.map(b => b.id === activeBot.id ? { ...b, ...patch } : b));
  };

  const patchConfig = (patch: Partial<WidgetConfig>) => {
    patchActiveBot({ widgetConfig: { ...activeBot.widgetConfig, ...patch } });
  };

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
        additionalCollectInfo: activeBot.widgetConfig.additionalCollectInfo?.trim() || ''
      };

      await updateBot(activeBot.id, {
        businessName: activeBot.businessName.trim(),
        industry: activeBot.industry.trim(),
        greeting: activeBot.greeting,
        primaryColor: activeBot.primaryColor,
        knowledgeBase: activeBot.knowledgeBase,
        allowedDomains: normalizeDomains(activeBot.allowedDomains || []),
        widgetConfig: cleanConfig
      });
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
            onClick={() => setSection(item.id)}
            className={`w-full text-left px-3 py-2.5 rounded-md transition ${section === item.id ? 'bg-brand-accent text-brand-bg' : 'text-brand-muted hover:text-brand-text hover:bg-brand-bg'}`}
          >
            <span className="block text-sm font-bold">{item.label}</span>
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
            <div>
              <div className="mb-3">
                <h3 className="text-sm font-bold text-brand-text">Quick sets</h3>
                <p className="mt-1 text-xs text-brand-muted">Professionally balanced palettes. One click updates the complete widget.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                {widgetThemePresets.map(preset => {
                  const selected = isThemePresetActive(preset, activeBot.widgetConfig);
                  return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyThemePreset(preset)}
                    aria-pressed={selected}
                    className={`relative overflow-hidden rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? 'border-brand-accent ring-1 ring-brand-accent' : 'border-brand-border hover:border-brand-muted'}`}
                    style={{ backgroundColor: preset.backgroundColor }}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-sm font-bold" style={{ color: preset.textColor }}>{preset.name}</span>
                        <span className="block mt-0.5 text-[10px] opacity-65" style={{ color: preset.textColor }}>{preset.description}</span>
                      </span>
                      {selected && (
                        <span className="rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide" style={{ backgroundColor: preset.primaryColor, color: preset.backgroundColor }}>
                          Selected
                        </span>
                      )}
                    </span>
                    <span className="mt-3 flex items-end gap-2 rounded-md p-2" style={{ backgroundColor: preset.surfaceColor }}>
                      <span className="h-7 flex-1 rounded-md border border-black/5" style={{ backgroundColor: preset.backgroundColor }} />
                      <span className="h-5 w-12 rounded-full" style={{ backgroundColor: preset.primaryColor }} />
                    </span>
                  </button>
                  );
                })}
              </div>
            </div>

            <details className="group rounded-lg border border-brand-border bg-brand-bg/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-brand-text">
                <span>
                  Fine tune colors
                  <span className="ml-2 text-[10px] font-normal text-brand-muted">Advanced</span>
                </span>
                <span className="text-brand-muted transition group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-brand-border px-4 py-4">
                <p className="mb-3 text-xs text-brand-muted">Manual changes create a custom palette. Choosing a quick set later will reset all four colors.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <ColorControl label="Accent" value={activeBot.widgetConfig.primaryColor} onChange={(primaryColor) => patchConfig({ primaryColor })} />
                  <ColorControl label="Background" value={activeBot.widgetConfig.backgroundColor} onChange={(backgroundColor) => patchConfig({ backgroundColor })} />
                  <ColorControl label="Surface" value={activeBot.widgetConfig.surfaceColor} onChange={(surfaceColor) => patchConfig({ surfaceColor })} />
                  <ColorControl label="Text" value={activeBot.widgetConfig.textColor} onChange={(textColor) => patchConfig({ textColor })} />
                </div>
              </div>
            </details>

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Toggle checked={activeBot.widgetConfig.enableVoice} label="Voice button" onChange={(enableVoice) => patchConfig({ enableVoice })} />
              <Toggle checked={activeBot.widgetConfig.enableCalendar} label="Calendar booking" onChange={(enableCalendar) => patchConfig({ enableCalendar })} />
              <Toggle checked={activeBot.widgetConfig.showPoweredBy} label="Powered by label" onChange={(showPoweredBy) => patchConfig({ showPoweredBy })} />
            </div>
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
            <div className="flex justify-between items-center">
              <FieldLabel>Knowledge Base</FieldLabel>
              <span className="text-[10px] font-mono text-brand-muted">{(activeBot.knowledgeBase || '').length}/1500</span>
            </div>
            <TextArea maxLength={1500} rows={16} value={activeBot.knowledgeBase} onChange={(e) => patchActiveBot({ knowledgeBase: e.target.value })} />
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
