export const calendarTools = [
  {
    name: 'check_availability',
    description: 'Check available appointment slots for a given date. Returns start and end times of free slots.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Date in YYYY-MM-DD format (local timezone of visitor)' }
      },
      required: ['date']
    }
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment slot. Ensure you have checked availability first and user has agreed.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the appointment (e.g. Consultation with visitorName)' },
        visitorName: { type: 'STRING', description: 'Visitor full name' },
        visitorPhone: { type: 'STRING', description: 'Visitor phone number' },
        startTime: { type: 'STRING', description: 'Start time in ISO 8601 format (e.g. 2026-06-20T14:30:00Z)' },
        endTime: { type: 'STRING', description: 'End time in ISO 8601 format (e.g. 2026-06-20T15:00:00Z)' }
      },
      required: ['title', 'visitorName', 'visitorPhone', 'startTime', 'endTime']
    }
  }
];
