export interface TimeSlot {
  start: string;  // ISO 8601
  end: string;
}

export interface BookingDetails {
  title: string;
  visitorName: string;
  visitorPhone?: string;
  visitorEmail?: string;
  startTime: string;
  endTime: string;
}

export interface CalendarAdapter {
  getAuthUrl(ownerId: string): string;
  handleCallback(code: string, ownerId: string): Promise<void>;
  checkAvailability(date: string, ownerId: string, timezone?: string): Promise<TimeSlot[]>;
  bookAppointment(details: BookingDetails, ownerId: string): Promise<{ eventId: string }>;
}

