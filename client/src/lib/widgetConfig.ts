import { WidgetConfig } from '../types';

export const defaultWidgetConfig: WidgetConfig = {
  assistantName: '',
  avatarText: '',
  theme: 'dark',
  primaryColor: '#22e6a8',
  backgroundColor: '#0b1511',
  surfaceColor: '#10231d',
  textColor: '#f7fffb',
  launcherPosition: 'bottom-right',
  launcherStyle: 'icon',
  launcherText: 'Chat',
  widgetSize: 'standard',
  radius: 'soft',
  inputPlaceholder: 'Type a message...',
  suggestedPrompts: [],
  enableVoice: true,
  enableCalendar: true,
  showPoweredBy: true,
  requiredLeadFields: ['name', 'phone'],
  handoffText: 'I can connect you with the team for this.'
};

export function mergeWidgetConfig(value: Partial<WidgetConfig> | null | undefined): WidgetConfig {
  const config = { ...defaultWidgetConfig, ...(value || {}) };
  return {
    ...config,
    suggestedPrompts: Array.isArray(config.suggestedPrompts) ? config.suggestedPrompts : [],
    requiredLeadFields: Array.isArray(config.requiredLeadFields) ? config.requiredLeadFields : defaultWidgetConfig.requiredLeadFields
  };
}
