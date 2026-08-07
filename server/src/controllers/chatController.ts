import { Bot, Message } from '../types/index.ts';
import { config } from '../config';
import { geminiGuard, RateLimitError } from '../services/geminiGuard';
import { mergeWidgetConfig } from '../utils/widgetConfig';
import { bookCalendarAppointment, checkCalendarAvailability, serializeCalendarToolError } from '../services/calendar/calendarOperations';
import { formatCurrentDateTime } from '../utils/date';

const GEMINI_API_KEY = config.geminiApiKey ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES || 2);

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableGeminiStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : 0;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 8000);
  }

  return Math.min(750 * Math.pow(2, attempt), 4000);
}

async function callGeminiWithRetry(reqBody: any): Promise<any> {
  const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const models = Array.from(new Set([
    defaultModel,
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.5-flash'
  ]));

  let lastStatus = 0;
  let lastErrorText = '';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    let modelStatus = 0;
    let modelErrorText = '';

    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      try {
        const geminiResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });

        if (geminiResponse.ok) {
          return await geminiResponse.json();
        }

        modelStatus = geminiResponse.status;
        modelErrorText = await geminiResponse.text();
        console.error(`Gemini API Error Body for model ${model}:`, modelErrorText);

        if (attempt < GEMINI_MAX_RETRIES && isRetryableGeminiStatus(geminiResponse.status)) {
          const delayMs = getRetryDelayMs(geminiResponse, attempt);
          console.warn(`[Gemini/Chat] ${geminiResponse.status} from ${model}. Retrying in ${delayMs}ms...`);
          await sleep(delayMs);
          continue;
        }
      } catch (fetchErr: any) {
        modelStatus = 500;
        modelErrorText = fetchErr.message || String(fetchErr);
        console.error(`Fetch exception for model ${model}:`, fetchErr);

        if (attempt < GEMINI_MAX_RETRIES) {
          const delayMs = Math.min(750 * Math.pow(2, attempt), 4000);
          console.warn(`[Gemini/Chat] Fetch error for ${model}. Retrying in ${delayMs}ms...`);
          await sleep(delayMs);
          continue;
        }
      }
      break;
    }

    console.error(`[Railway Log] Gemini model ${model} failed with status ${modelStatus}. Error detail: ${modelErrorText}. Trying next fallback model if available.`);

    lastStatus = modelStatus;
    lastErrorText = modelErrorText;
  }

  throw new Error(`All Gemini models failed. Last error: ${lastStatus} - ${lastErrorText}`);
}

function buildNoModelFallback(userMessage: string): string {
  const text = userMessage.toLowerCase();
  const looksLikeBooking =
    /\b(book|booking|appointment|calendar|schedule|visit|callback|meeting|slot|tomorrow|today)\b/.test(text) ||
    /\b\d{1,2}\s*(am|pm)\b/.test(text);

  if (looksLikeBooking) {
    return 'I can help with the booking. Please share your full name, phone number, and preferred date and time so I can check availability.';
  }

  return 'I am here to help. Could you share a little more detail about what you need?';
}

function isHandoffRequest(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const handoffPatterns = [
    /\b(talk|speak|connect|contact|chat|get|call|want|need|request|reach|page)\s+(to|with|for|a|an)?\s*(human|support|agent|person|representative|staff|helper|receptionist|manager|team)\b/i,
    /\b(human\s+support|live\s+agent|live\s+support|human\s+agent|real\s+person|customer\s+service)\b/i,
    /\b(contact|connect|talk|speak)\s+(us|me)?\s*(to|with)?\s*(support|human|agent)\b/i,
    /^\s*(human|support|agent|receptionist|handoff|contact\s+support|talk\s+to\s+human|support\s+please)\s*$/i,
    /\b(support|human|receptionist|agent)\b.*\b(please|now|help|needed|required)\b/i
  ];
  return handoffPatterns.some(pattern => pattern.test(normalized));
}


export async function handleChat(
  input: ChatInput,
  supabase: any
): Promise<ChatOutput> {
  const { bot, history, userMessage } = input;

  const widgetConfig = mergeWidgetConfig(bot.widget_config, bot);
  const handoffText = widgetConfig.handoffText || 'I can connect you with the team for this.';

  if (isHandoffRequest(userMessage)) {
    return { reply: handoffText };
  }

  const timezone = input.timezone || 'Asia/Kolkata';
  const getTzOffsetStr = (tz: string) => {
    try {
      const d = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(d);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

      let hour = getPart('hour');
      if (hour === '24') hour = '00';

      const targetUtc = Date.UTC(
        Number(getPart('year')),
        Number(getPart('month')) - 1,
        Number(getPart('day')),
        Number(hour),
        Number(getPart('minute')),
        Number(getPart('second'))
      );

      const actualUtc = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds()
      );

      const diffMin = Math.round((targetUtc - actualUtc) / 60000);
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
  const userLocaleTime = formatCurrentDateTime(timezone);

  const fieldsToCollect = widgetConfig.requiredLeadFields || [];

  const fieldDescriptions: Record<string, string> = {
    name: 'Full Name',
    phone: 'Contact Phone Number',
    email: 'Email Address',
    requirement: 'Specific interest/visit purpose',
    budget: 'Budget / Financial capability if relevant'
  };

  const enabledFields = fieldsToCollect
    .map(field => fieldDescriptions[field])
    .filter(Boolean);

  let leadCollectionInstruction = enabledFields.length > 0
    ? `Naturally and conversationally collect the basic lead details before booking: ${enabledFields.join(', ')}.`
    : `Answer questions warmly but do not proactively collect contact details.`;

  if (widgetConfig.additionalCollectInfo) {
    leadCollectionInstruction += ` Also, collect the following additional information: ${widgetConfig.additionalCollectInfo}.`;
  }

  const calendarInstruction = widgetConfig.enableCalendar
    ? `3. If the user asks for a visit, booking, appointment, callback, or you judge that human intervention is needed, move into appointment-assist mode:
   - Ask for any missing basic details first.
   - Ask for the preferred date if it is missing.
   - Use check_availability for that date.
   - Present only the open slots returned by the tool, respecting office/calendar availability.
   - Ask the user to choose/confirm one of those returned slots.
   - Only after the user explicitly agrees to a specific returned slot, use book_appointment.${widgetConfig.maxBookingDaysAhead ? ` Appointments can only be booked within the next ${widgetConfig.maxBookingDaysAhead} day(s) from today - if the user requests a date beyond that, politely tell them booking is only available within that window.` : ''}`
    : `3. Online calendar booking is currently disabled. If the user asks to book an appointment, schedule a visit, or requests a callback, politely inform them that online calendar scheduling is currently unavailable, and collect their contact details (name and phone/email) so a human representative can contact them to schedule it manually. Do NOT try to check availability or book it.`;

  const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.business_name}" (${bot.industry} sector).

CURRENT TIMEZONE: ${timezone}
CURRENT DATE AND TIME: ${userLocaleTime} (in ${timezone})
(Use this to resolve relative dates like "tomorrow" or "next Tuesday". All dates and times you discuss with the user are in the user's timezone: ${timezone})

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledge_base}

YOUR GOALS:
1. Warmly answer the user's questions relying strictly on the business details above.
2. ${leadCollectionInstruction}
${calendarInstruction}
4. HUMAN HANDOFF & SUPPORT: If the user wishes or asks to talk to or connect with/contact support, a human, an agent, or a real person, you must respond with exactly the following handoff text and nothing else: "${handoffText}".
5. Keep answers short (2-3 sentences max).
6. User should feel like he/she is talking to an actual call center guy.
7. Do not answer if user attempts to ask anything off the topic not related to the business.
8. Do not commit anything that is not under your control.
9. CRITICAL: Output ONLY the direct spoken response to the user. Do NOT output any internal thoughts, plans, drafts, or reasoning.

CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per chat session. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.
- BOOKING ORDER: Never call book_appointment in the same turn as check_availability. After checking availability, speak the available options and ask "Would you like me to book one of these?" Wait for the user's next confirmation before booking.
- SLOT RULE: Never invent a slot and never book a time that was not returned by check_availability. If the user's requested time is not in the returned slots, offer the returned alternatives instead.
- DATE FORMAT RULE: You must always parse, interpret, process, and present dates in DD-MM-YYYY format (e.g. 07-08-2026 for 7th August 2026) and NOT MM-DD-YYYY format. Crucially, when the user provides or asks about dates, or when you use tools, assume and use the DD-MM-YYYY format for all communications and relative date calculations.
- TOOL TIMEZONE: When calling check_availability, pass the local date format 'YYYY-MM-DD'. When calling book_appointment, construct startTime and endTime in ISO 8601 format using the user's local offset ${tzOffset} (example: 2026-06-17T08:30:00${tzOffset}). Never ask the user to provide a timezone unless their requested date/time is actually ambiguous.`;

  const bookAppointmentRequired = ['title', 'startTime', 'endTime'];
  if (fieldsToCollect.includes('name')) {
    bookAppointmentRequired.push('visitorName');
  }
  if (fieldsToCollect.includes('phone')) {
    bookAppointmentRequired.push('visitorPhone');
  }
  if (fieldsToCollect.includes('email')) {
    bookAppointmentRequired.push('visitorEmail');
  }

  const tools = widgetConfig.enableCalendar ? [{
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
            visitorEmail: { type: 'STRING', description: 'Visitor email address' },
            startTime: { type: 'STRING', description: 'Start time in ISO 8601 format' },
            endTime: { type: 'STRING', description: 'End time in ISO 8601 format' }
          },
          required: bookAppointmentRequired
        }
      }
    ]
  }] : undefined;

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
    const reqBody: any = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };
    if (tools) {
      reqBody.tools = tools;
    }

    try {
      const promptText = JSON.stringify(reqBody);
      geminiGuard.estimateAndCheckTPM(promptText);
      geminiGuard.checkRPM();
    } catch (err) {
      if (err instanceof RateLimitError && err.retryAfterMs > 0) {
        console.warn(`[GeminiGuard/Chat] ${err.message} Waiting before retry...`);
        await geminiGuard.waitForRPMSlot();
      } else {
        throw err; 
      }
    }

    let geminiData: any;
    try {
      geminiData = await callGeminiWithRetry(reqBody);
    } catch (err: any) {
      if (err?.message?.includes('Gemini API error')) {
        console.error('[Gemini/Chat] Exhausted retries:', err.message);
        break;
      }
      throw err;
    }

    const candidate = geminiData.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const functionCall = parts.find((p: any) => p.functionCall);

    if (functionCall) {
      const { name, args } = functionCall.functionCall;
      let functionResponse: any = {};

      try {
        if (name === 'check_availability') {
          const slots = await checkCalendarAvailability({
            db: supabase,
            ownerId: bot.owner_id,
            date: args.date,
            timezone,
            maxBookingDaysAhead: widgetConfig.maxBookingDaysAhead,
          });
          functionResponse = { slots };
          checkedAvailabilityThisTurn = true;
          lastFunctionName = name;
          lastFunctionResponse = functionResponse;
        } else if (name === 'book_appointment') {
          if (checkedAvailabilityThisTurn) {
            functionResponse = {
              error: 'Do not book immediately after checking availability. Present the returned slots to the user and wait for explicit confirmation in the next user turn.'
            };
          } else {
            functionResponse = await bookCalendarAppointment({
              db: supabase,
              details: args,
              ownerId: bot.owner_id,
              botId: bot.id,
              sessionId: input.sessionId,
              timezone,
              maxBookingDaysAhead: widgetConfig.maxBookingDaysAhead,
            });
          }
          lastFunctionName = name;
          lastFunctionResponse = functionResponse;
        }
      } catch (err: any) {
        console.error(`Error calling ${name}:`, err);
        functionResponse = serializeCalendarToolError(err);
      }

      if (functionResponse?.error) {
        console.error(`Function ${name} returned error:`, functionResponse.error);
      }

      contents.push({
        role: 'model',
        parts: [{ functionCall: functionCall.functionCall }]
      });

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
    reply = buildNoModelFallback(userMessage);
  }

  return { reply };
}
