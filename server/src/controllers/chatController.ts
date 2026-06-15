// @ts-nocheck
import { Bot, Message } from '../types/index.ts';
import { config } from '../config';

const GEMINI_API_KEY = config.geminiApiKey ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

export interface ChatInput {
  bot: Bot;
  history: Message[];
  userMessage: string;
  sessionId: string;
}

export interface ChatOutput {
  reply: string;
}

/**
 * Builds the system instruction from the bot's knowledge base and calls Gemini.
 * Saves both the user message and bot reply into the messages table.
 */
export async function handleChat(
  input: ChatInput,
  supabase: any
): Promise<ChatOutput> {
  const { bot, history, userMessage } = input;

  const EXPRESS_SERVER_URL = process.env.EXPRESS_SERVER_URL || `http://localhost:${config.port}`;

  // 1. Build system instruction from bot configuration
  const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.business_name}" (${bot.industry} sector).

CURRENT DATE AND TIME: ${new Date().toLocaleString()}
(Use this to resolve relative dates like "tomorrow" or "next Tuesday")

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledge_base}

YOUR GOALS:
1. Warmly answer the user's questions relying strictly on the business details above.
2. Naturally and conversationally collect: Full Name, Contact Phone Number, Specific interest, and Budget.
3. If the user wants to book an appointment, use the check_availability tool for their requested date, then use the book_appointment tool once they agree to a slot.
4. Keep answers short (2-3 sentences max).
5. User should feel like he/she is talking to an actual call center guy.
6. Do not answer if user attempts to ask anything off the topic not related to the business.
7. CRITICAL: Output ONLY the direct spoken response to the user. Do NOT output any internal thoughts, plans, drafts, or reasoning.

CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per chat session. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.`;

  // Define tools
  const tools = [{
    functionDeclarations: [
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
            title: { type: 'STRING', description: 'Title of the appointment' },
            visitorName: { type: 'STRING', description: 'Visitor full name' },
            visitorPhone: { type: 'STRING', description: 'Visitor phone number' },
            startTime: { type: 'STRING', description: 'Start time in ISO 8601 format' },
            endTime: { type: 'STRING', description: 'End time in ISO 8601 format' }
          },
          required: ['title', 'visitorName', 'visitorPhone', 'startTime', 'endTime']
        }
      }
    ]
  }];

  let contents = [{
    role: 'user',
    parts: [{ text: `Chat history:\n${history.map(m => `${m.sender}: ${m.text}`).join('\n')}\nUser: ${userMessage}` }]
  }];

  let reply = '';
  const MAX_LOOPS = 3;
  let loops = 0;

  while (loops < MAX_LOOPS) {
    loops++;
    const reqBody = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools
    };

    const geminiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API Error Body:', errText);
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const candidate = geminiData.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Check if there is a function call
    const functionCall = parts.find((p: any) => p.functionCall);
    
    if (functionCall) {
      const { name, args } = functionCall.functionCall;
      let functionResponse: any = {};

      try {
        if (name === 'check_availability') {
          const res = await fetch(`${EXPRESS_SERVER_URL}/api/calendar/availability?date=${args.date}&ownerId=${bot.owner_id}`);
          functionResponse = await res.json();
        } else if (name === 'book_appointment') {
          const res = await fetch(`${EXPRESS_SERVER_URL}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              details: args, 
              ownerId: bot.owner_id, 
              botId: bot.id, 
              sessionId: input.sessionId 
            })
          });
          functionResponse = await res.json();
        }
      } catch (err: any) {
        console.error(`Error calling ${name}:`, err);
        functionResponse = { error: err.message };
      }

      if (functionResponse?.error) {
        console.error(`Function ${name} returned error:`, functionResponse.error);
      }

      // Add model's function call to contents
      contents.push({
        role: 'model',
        parts: [{ functionCall: functionCall.functionCall }]
      });

      // Add function response to contents
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name,
            response: functionResponse
          }
        }]
      });

    } else {
      // No function call, we have the final text reply
      reply = parts[0]?.text || 'Thank you for your message. A specialist will contact you shortly.';
      break;
    }
  }

  return { reply };
}
