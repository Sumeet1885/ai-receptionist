export type WidgetTheme = 'dark' | 'light' | 'brand';
export type WidgetLauncherPosition = 'bottom-right' | 'bottom-left';
export type WidgetLauncherStyle = 'icon' | 'text';
export type WidgetSize = 'compact' | 'standard' | 'large';
export type WidgetRadius = 'sharp' | 'soft' | 'rounded';
export type LeadField = 'name' | 'phone' | 'email' | 'requirement' | 'budget';

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
}

export interface Bot {
  id: string;
  businessName: string;
  industry: string;
  subDomain: string;
  greeting: string;
  primaryColor: string;
  languages: string[];
  knowledgeBase: string;
  allowedDomains?: string[];
  widgetConfig: WidgetConfig;
  createdAt: string;
}

export interface Lead {
  id: string;
  botId: string;
  name: string;
  phone: string;
  email: string | null;
  requirement: string;
  budget: string;
  sentiment: string;
  leadScore: string;
  summary: string;
  appointmentStatus: string;
  date: string;
}

export interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
}

export interface Toast {
  message: string;
  type: 'success' | 'error';
}

export interface Profile {
  id: string;
  fullName: string;
  company: string;
  plan: string;
}

export interface ChatSession {
  id: string;
  botId: string;
  visitorId: string;
  startedAt: string;
  endedAt: string | null;
  lastMessage?: string;
  messageCount?: number;
}

export interface CalendarConnection {
  id: string;
  provider: 'google' | 'outlook';
  calendarId: string;
  connected: boolean;
}

export interface Appointment {
  id: string;
  botId: string;
  sessionId: string;
  leadId: string;
  title: string;
  visitorName: string;
  visitorPhone: string;
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  createdAt: string;
}
