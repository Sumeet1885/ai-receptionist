export const LIVE_END_CALL_INSTRUCTION =
  'Use the `end_call` tool only after you have clearly confirmed the conversation is over, no more help is needed, and you have already said goodbye.';
export const LIVE_WRAP_WARNING_SIGNAL = '[[SESSION_WRAP_WARNING]]';
export const LIVE_FORCE_END_SIGNAL = '[[SESSION_FORCE_END]]';

export function buildLiveFunctionDeclarations(bookAppointmentRequired: string[], enableCalendar = true) {
  const declarations: any[] = [];

  if (enableCalendar) {
    declarations.push(
      {
        name: 'check_availability',
        description: 'Check available appointment slots for a given date. Returns start and end times of free slots.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'Date in YYYY-MM-DD format' }
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
            title: { type: 'STRING', description: 'Title of the appointment' },
            visitorName: { type: 'STRING', description: 'Visitor full name' },
            visitorPhone: { type: 'STRING', description: 'Visitor phone number' },
            startTime: { type: 'STRING', description: 'Start time in ISO 8601 format' },
            endTime: { type: 'STRING', description: 'End time in ISO 8601 format' }
          },
          required: bookAppointmentRequired
        }
      }
    );
  }

  declarations.push(
    {
      name: 'request_text_input',
      description: 'Requests the user to type exactly one field into the text box. Use this whenever you ask for their phone or email. Never request phone and email together in the same turn.',
      parameters: {
        type: 'OBJECT',
        properties: {
          field: { type: 'STRING', description: 'The field being requested (phone or email)' }
        },
        required: ['field']
      }
    },
    {
      name: 'end_call',
      description: 'Ends the voice call after you have confirmed the conversation is over and already said "Have a great day".',
      parameters: {
        type: 'OBJECT',
        properties: {
          reason: { type: 'STRING', description: 'Short internal reason for ending the call.' }
        },
        required: []
      }
    }
  );

  return declarations;
}
