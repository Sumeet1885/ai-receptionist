import { WidgetConfig } from '../types';

export const defaultWidgetConfig: WidgetConfig = {
  assistantName: '',
  avatarText: '',
  theme: 'dark',
  primaryColor: '#5B8CFF',
  backgroundColor: '#08111F',
  surfaceColor: '#101C2E',
  textColor: '#F4F7FB',
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
  handoffText: 'I can connect you with the team for this.',
  additionalCollectInfo: '',
  maxBookingDaysAhead: undefined
};

export function mergeWidgetConfig(value: Partial<WidgetConfig> | null | undefined): WidgetConfig {
  const config = { ...defaultWidgetConfig, ...(value || {}) };
  const maxBookingDaysAhead = Number(config.maxBookingDaysAhead);
  return {
    ...config,
    suggestedPrompts: Array.isArray(config.suggestedPrompts) ? config.suggestedPrompts : [],
    requiredLeadFields: Array.isArray(config.requiredLeadFields) ? config.requiredLeadFields : defaultWidgetConfig.requiredLeadFields,
    additionalCollectInfo: config.additionalCollectInfo || '',
    maxBookingDaysAhead: Number.isFinite(maxBookingDaysAhead) && maxBookingDaysAhead > 0
      ? Math.min(Math.round(maxBookingDaysAhead), 365)
      : undefined
  };
}
