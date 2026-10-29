export type WidgetTheme = 'dark' | 'light' | 'brand';
export type WidgetLauncherPosition = 'bottom-right' | 'bottom-left';
export type WidgetLauncherStyle = 'icon' | 'text';
export type WidgetSize = 'compact' | 'standard' | 'large';
export type WidgetRadius = 'sharp' | 'soft' | 'rounded';
export type LeadField = 'name' | 'phone' | 'email' | 'requirement' | 'budget';

/**
 * Customer-editable widget settings stored in `bots.widget_config`.
 * Server-owned telephony data kept in the same JSON column (connectedLines, outboundTelephony)
 * is intentionally not part of this browser-safe contract.
 */
export interface WidgetConfig {
  assistantName: string;
  avatarText: string;
  theme: WidgetTheme;
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  launcherPosition: WidgetLauncherPosition;
  launcherStyle: WidgetLauncherStyle;
  launcherText: string;
  widgetSize: WidgetSize;
  radius: WidgetRadius;
  inputPlaceholder: string;
  suggestedPrompts: string[];
  enableVoice: boolean;
  enableCalendar: boolean;
  showPoweredBy: boolean;
  requiredLeadFields: LeadField[];
  handoffText: string;
  additionalCollectInfo?: string;
  /** Max number of days ahead a booking/availability date may fall on, counted from "today" in
   * the caller's timezone. `undefined` means no limit. Enforced server-side in calendarOperations.ts. */
  maxBookingDaysAhead?: number;
  /** Custom prompt template specifically for inbound phone calls */
  inboundPromptTemplate?: string;
  /** Custom prompt template specifically for outbound telecalling calls */
  outboundPromptTemplate?: string;
  agentDirection?: 'inbound' | 'outbound' | 'both';
}

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
  maxBookingDaysAhead: undefined,
  inboundPromptTemplate: '',
  outboundPromptTemplate: ''
};
