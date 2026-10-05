export const calendarTools = [
  {
    name: 'check_availability',
    description: 'Check available appointment slots for a given date. Returns start and end times of free slots.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Date in YYYY-MM-DD or DD-MM-YYYY format (local timezone of visitor)' }
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
        title: { type: 'STRING', description: 'Title of the appointment (optional)' },
        visitorName: { type: 'STRING', description: 'Visitor full name' },
        visitorPhone: { type: 'STRING', description: 'Visitor phone number' },
        startTime: { type: 'STRING', description: 'Start time in ISO 8601 format (e.g. 2026-10-06T14:30:00+05:30)' },
        endTime: { type: 'STRING', description: 'End time in ISO 8601 format (optional, defaults to 30 min duration)' }
      },
      required: ['visitorName', 'visitorPhone', 'startTime']
    }
  }
];
