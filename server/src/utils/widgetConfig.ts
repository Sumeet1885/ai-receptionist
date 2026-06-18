export interface WidgetConfig {
  assistantName: string;
  avatarText: string;
  theme: 'dark' | 'light' | 'brand';
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  launcherPosition: 'bottom-right' | 'bottom-left';
  launcherStyle: 'icon' | 'text';
  launcherText: string;
  widgetSize: 'compact' | 'standard' | 'large';
  radius: 'sharp' | 'soft' | 'rounded';
  inputPlaceholder: string;
  suggestedPrompts: string[];
  enableVoice: boolean;
  enableCalendar: boolean;
  showPoweredBy: boolean;
  requiredLeadFields: string[];
  handoffText: string;
  additionalCollectInfo?: string;
}

const colorMap: Record<string, string> = {
  indigo: '#6366f1',
  emerald: '#22c55e',
  rose: '#fb7185',
  amber: '#f59e0b'
};

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
  additionalCollectInfo: ''
};

function cleanHex(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const mapped = colorMap[value.toLowerCase()];
  if (mapped) return mapped;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function channelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function getContrastingTextColor(hex: string) {
  const cleaned = cleanHex(hex, '#000000').slice(1);
  const red = parseInt(cleaned.slice(0, 2), 16);
  const green = parseInt(cleaned.slice(2, 4), 16);
  const blue = parseInt(cleaned.slice(4, 6), 16);
  const luminance = 0.2126 * channelToLinear(red)
    + 0.7152 * channelToLinear(green)
    + 0.0722 * channelToLinear(blue);

  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.057;
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#111827';
}

function cleanText(value: unknown, fallback: string, maxLength = 120) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function mergeWidgetConfig(value: any, bot?: { business_name?: string; primary_color?: string }): WidgetConfig {
  const input = value && typeof value === 'object' ? value : {};
  const primaryFallback = cleanHex(bot?.primary_color, defaultWidgetConfig.primaryColor);
  const assistantFallback = bot?.business_name || 'AI Receptionist';

  return {
    assistantName: cleanText(input.assistantName, assistantFallback, 80),
    avatarText: cleanText(input.avatarText, assistantFallback.slice(0, 2).toUpperCase(), 3).toUpperCase(),
    theme: pick(input.theme, ['dark', 'light', 'brand'], defaultWidgetConfig.theme),
    primaryColor: cleanHex(input.primaryColor, primaryFallback),
    backgroundColor: cleanHex(input.backgroundColor, defaultWidgetConfig.backgroundColor),
    surfaceColor: cleanHex(input.surfaceColor, defaultWidgetConfig.surfaceColor),
    textColor: cleanHex(input.textColor, defaultWidgetConfig.textColor),
    launcherPosition: pick(input.launcherPosition, ['bottom-right', 'bottom-left'], defaultWidgetConfig.launcherPosition),
    launcherStyle: pick(input.launcherStyle, ['icon', 'text'], defaultWidgetConfig.launcherStyle),
    launcherText: cleanText(input.launcherText, defaultWidgetConfig.launcherText, 24),
    widgetSize: pick(input.widgetSize, ['compact', 'standard', 'large'], defaultWidgetConfig.widgetSize),
    radius: pick(input.radius, ['sharp', 'soft', 'rounded'], defaultWidgetConfig.radius),
    inputPlaceholder: cleanText(input.inputPlaceholder, defaultWidgetConfig.inputPlaceholder, 80),
    suggestedPrompts: Array.isArray(input.suggestedPrompts)
      ? input.suggestedPrompts.filter((item: unknown) => typeof item === 'string').map((item: string) => item.trim()).filter(Boolean).slice(0, 4)
      : [],
    enableVoice: input.enableVoice !== false,
    enableCalendar: input.enableCalendar !== false,
    showPoweredBy: input.showPoweredBy !== false,
    requiredLeadFields: Array.isArray(input.requiredLeadFields)
      ? input.requiredLeadFields.filter((item: unknown) => typeof item === 'string').slice(0, 6)
      : defaultWidgetConfig.requiredLeadFields,
    handoffText: cleanText(input.handoffText, defaultWidgetConfig.handoffText, 180),
    additionalCollectInfo: cleanText(input.additionalCollectInfo, '', 500)
  };
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
