export interface Bot {
  id: string;
  businessName: string;
  industry: string;
  subDomain: string;
  greeting: string;
  primaryColor: string;
  languages: string[];
  knowledgeBase: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  botId: string;
  name: string;
  phone: string;
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
