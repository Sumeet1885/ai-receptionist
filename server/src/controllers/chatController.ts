// @ts-nocheck
import { Bot, Message } from '../types/index.ts';
import { config } from '../config';
import { geminiGuard, RateLimitError } from '../services/geminiGuard';

const GEMINI_API_KEY = config.geminiApiKey ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

export interface ChatInput {
  bot: Bot;
  history: Message[];
  userMessage: string;
  sessionId: string;
  timezone?: string;
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
  const timezone = input.timezone || 'Asia/Kolkata';
  const getTzOffsetStr = (tz: string) => {
    try {
      const d = new Date();
      const tzString = d.toLocaleString('en-US', { timeZone: tz });
      const tzDate = new Date(tzString);
      const diffMin = Math.round((tzDate.getTime() - d.getTime()) / 60000);
      const sign = diffMin >= 0 ? '+' : '-';
      const absMin = Math.abs(diffMin);
      const hours = String(Math.floor(absMin / 60)).padStart(2, '0');
      const mins = String(absMin % 60).padStart(2, '0');
      return `${sign}${hours}:${mins}`;
    } catch {
      return '+05:30';
    }
  };
  const tzOffset = getTzOffsetStr(timezone);
  const userLocaleTime = new Date().toLocaleString('en-US', { timeZone: timezone });

  // 1. Build system instruction from bot configuration
  const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.business_name}" (${bot.industry} sector).

CURRENT TIMEZONE: ${timezone}
CURRENT DATE AND TIME: ${userLocaleTime} (in ${timezone})
(Use this to resolve relative dates like "tomorrow" or "next Tuesday". All dates and times you discuss with the user are in the user's timezone: ${timezone})

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledge_base}

YOUR GOALS:
1. Warmly answer the user's questions relying strictly on the business details above.
2. Naturally and conversationally collect the basic lead details before booking: Full Name, Contact Phone Number, Specific interest/visit purpose, and Budget if relevant.
3. If the user asks for a visit, booking, appointment, callback, or you judge that human intervention is needed, move into appointment-assist mode:
   - Ask for any missing basic details first.
   - Ask for the preferred date if it is missing.
   - Use check_availability for that date.
   - Present only the open slots returned by the tool, respecting office/calendar availability.
   - Ask the user to choose/confirm one of those returned slots.
   - Only after the user explicitly agrees to a specific returned slot, use book_appointment.
4. Keep answers short (2-3 sentences max).
5. User should feel like he/she is talking to an actual call center girl.
6. Do not answer if user attempts to ask anything off the topic not related to the business.
7. Do not commit anything that is not under your control.
8. CRITICAL: Output ONLY the direct spoken response to the user. Do NOT output any internal thoughts, plans, drafts, or reasoning.

CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per chat session. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.
- BOOKING ORDER: Never call book_appointment in the same turn as check_availability. After checking availability, speak the available options and ask "Would you like me to book one of these?" Wait for the user's next confirmation before booking.
- SLOT RULE: Never invent a slot and never book a time that was not returned by check_availability. If the user's requested time is not in the returned slots, offer the returned alternatives instead.
- TOOL TIMEZONE: When calling check_availability, pass the local date format 'YYYY-MM-DD'. When calling book_appointment, construct startTime and endTime in ISO 8601 format using the user's local offset ${tzOffset} (example: 2026-06-17T08:30:00${tzOffset}). Never ask the user to provide a timezone unless their requested date/time is actually ambiguous.`;

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
  let checkedAvailabilityThisTurn = false;
  let lastFunctionName = '';
  let lastFunctionResponse: any = null;

  const formatSlots = (slots: any[]) => {
    return (slots || [])
      .map((slot: any) =>
        new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      )
      .join(', ');
  };

  while (loops < MAX_LOOPS) {
    loops++;
    const reqBody = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools
    };

    // ── GeminiGuard: RPM + TPM check before every HTTP call ──────────────
    try {
      const promptText = JSON.stringify(reqBody);
      geminiGuard.estimateAndCheckTPM(promptText);
      geminiGuard.checkRPM();
    } catch (err) {
      if (err instanceof RateLimitError && err.retryAfterMs > 0) {
        console.warn(`[GeminiGuard/Chat] ${err.message} Waiting before retry...`);
        await geminiGuard.waitForRPMSlot();
      } else {
        throw err; // propagate non-rate-limit errors
      }
    }

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
          checkedAvailabilityThisTurn = true;
          lastFunctionName = name;
          lastFunctionResponse = functionResponse;
        } else if (name === 'book_appointment') {
          if (checkedAvailabilityThisTurn) {
            functionResponse = {
              error: 'Do not book immediately after checking availability. Present the returned slots to the user and wait for explicit confirmation in the next user turn.'
            };
          } else {
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
          lastFunctionName = name;
          lastFunctionResponse = functionResponse;
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

  if (!reply) {
    if (lastFunctionName === 'check_availability') {
      if (lastFunctionResponse?.slots?.length) {
        const slots = formatSlots(lastFunctionResponse.slots);
        reply = `I checked the schedule. The available slots are ${slots}. Would you like me to book one of these?`;
      } else if (lastFunctionResponse?.error) {
        reply = `I couldn't check the schedule just now. ${lastFunctionResponse.error}`;
      } else {
        reply = 'I checked the schedule, but I could not find an open slot yet. Please try another date.';
      }
    } else if (lastFunctionName === 'book_appointment') {
      if (lastFunctionResponse?.success) {
        reply = 'Your appointment is confirmed.';
      } else if (lastFunctionResponse?.error) {
        reply = `I couldn't complete the booking. ${lastFunctionResponse.error}`;
      }
    }
  }

  if (!reply) {
    reply = 'I need a moment to confirm that. Please tell me your preferred date and time again.';
  }

  return { reply };
}
