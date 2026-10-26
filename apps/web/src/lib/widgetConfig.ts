import { defaultWidgetConfig, type WidgetConfig } from '@ai-receptionist/contracts';

export { defaultWidgetConfig };

export function mergeWidgetConfig(value: Partial<WidgetConfig> | null | undefined): WidgetConfig {
  const config = { ...defaultWidgetConfig, ...(value || {}) };
  const maxBookingDaysAhead = Number(config.maxBookingDaysAhead);
  return {
    ...config,
    suggestedPrompts: Array.isArray(config.suggestedPrompts) ? config.suggestedPrompts : [],
    requiredLeadFields: Array.isArray(config.requiredLeadFields) ? config.requiredLeadFields : defaultWidgetConfig.requiredLeadFields,
    additionalCollectInfo: config.additionalCollectInfo || '',
    inboundPromptTemplate: typeof config.inboundPromptTemplate === 'string' ? config.inboundPromptTemplate : '',
    outboundPromptTemplate: typeof config.outboundPromptTemplate === 'string' ? config.outboundPromptTemplate : '',
    maxBookingDaysAhead: Number.isFinite(maxBookingDaysAhead) && maxBookingDaysAhead > 0
      ? Math.min(Math.round(maxBookingDaysAhead), 365)
      : undefined
  };
}
