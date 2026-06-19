import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { analyzeLead } from './leadController';
import { geminiGuard } from '../services/geminiGuard';
import WebSocket from 'ws';
import { checkAllowedOrigin } from '../utils/security';
import { checkWebSocketRateLimit } from '../middleware/rateLimit';
import { wsTransport } from '../utils/wsTransport';
import { mergeWidgetConfig } from '../utils/widgetConfig';
import { LiveInputTranscriptAccumulator } from '../services/llm/liveInputTranscript';
import { bookCalendarAppointment, checkCalendarAvailability, serializeCalendarToolError } from '../services/calendar/calendarOperations';
import { loadLiveSessionContext } from '../services/liveSession';
import { buildLiveFunctionDeclarations, LIVE_END_CALL_INSTRUCTION } from '../services/liveTools';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});
const GEMINI_API_KEY = config.geminiApiKey ?? '';

// We use the Gemini Live API model which supports bidirectional WebSockets
const LIVE_API_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY || config.geminiApiKey}`;

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/chat/live' });

  wss.on('connection', async (ws: WebSocket, req) => {
    console.log('Client connected to Live API proxy');

    // Parse URL parameters for botId and sessionId
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const botId = url.searchParams.get('botId');
    const sessionId = url.searchParams.get('sessionId');

    const timezone = url.searchParams.get('timezone') || 'IST';

    if (!botId || !sessionId) {
      ws.close(1008, 'Missing botId or sessionId');
      return;
    }

    const rateLimit = checkWebSocketRateLimit(req);
    if (!rateLimit.allowed) {
      ws.close(1013, 'Too many voice connection attempts. Please try again shortly.');
      return;
    }

    // ── GeminiGuard: acquire a concurrent session slot ────────────────────────
    // Blocks (queues) if all 3 slots are occupied; rejects after 30 s.
    // 1. Fetch Bot Configuration
    let bot: any;
    try {
      ({ bot } = await loadLiveSessionContext(supabase, botId, sessionId));
    } catch (error: any) {
      ws.close(1008, error.message || 'Invalid chat session');
      return;
    }

    const originCheck = checkAllowedOrigin(req, {
      allowedDomains: bot.allowed_domains || [],
      extraAllowedOrigins: [config.clientUrl],
      allowRuntimeOrigin: true,
      requireSource: true,
    });

    if (!originCheck.allowed) {
      ws.close(1008, originCheck.reason || 'Origin is not authorized');
      return;
    }

    try {
      await geminiGuard.acquireSession(sessionId);
    } catch (reason) {
      console.warn(`[GeminiGuard] Session rejected (${sessionId}): ${reason}`);
      ws.close(1013, 'All AI receptionist lines are busy. Please try again shortly.');
      return;
    }

    // Helper to compute client timezone offset string, e.g. "+05:30" or "-08:00"
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
        return '+00:00';
      }
    };
    const tzOffset = getTzOffsetStr(timezone);

    // 2. Connect to Gemini Live API
    const geminiWs = new WebSocket(LIVE_API_URL);
    let setupSent = false;
    let accumulatedBotText = '';
    const inputTranscript = new LiveInputTranscriptAccumulator();
    let pendingAssistantHangup: { reason: string } | null = null;
    let assistantHangupTimeout: NodeJS.Timeout | null = null;

    const clearAssistantHangupTimeout = () => {
      if (assistantHangupTimeout) {
        clearTimeout(assistantHangupTimeout);
        assistantHangupTimeout = null;
      }
    };

    const sendAssistantHangup = () => {
      if (!pendingAssistantHangup || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'end_call',
        reason: pendingAssistantHangup.reason
      }));
      pendingAssistantHangup = null;
      clearAssistantHangupTimeout();
    };

    const persistPendingUserTranscript = async () => {
      try {
        await inputTranscript.flush(async content => {
          const { error } = await supabase.from('messages').insert({
            session_id: sessionId,
            sender: 'user',
            content
          });
          if (error) throw error;
        });
      } catch (err) {
        console.error('Error saving user voice transcript:', err);
      }
    };

    geminiWs.on('open', () => {
      console.log('Connected to Gemini Live API');

      const userLocaleTime = new Date().toLocaleString('en-US', { timeZone: timezone });
      const widgetConfig = mergeWidgetConfig(bot.widget_config, bot);
      const fieldsToCollect = widgetConfig.requiredLeadFields || [];
      const bookAppointmentRequired = ['title', 'visitorName', 'startTime', 'endTime'];
      if (fieldsToCollect.includes('phone')) {
        bookAppointmentRequired.push('visitorPhone');
      }

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
   - Only after the user explicitly agrees to a specific returned slot, use book_appointment.`
        : `3. Online calendar booking is currently disabled. If the user asks to book an appointment, schedule a visit, or requests a callback, politely inform them that online calendar scheduling is currently unavailable, and collect their contact details (name and phone/email) so a human representative can contact them to schedule it manually. Do NOT try to check availability or book it.`;

      const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.business_name}" (${bot.industry} sector).

CURRENT TIMEZONE: ${timezone}
CURRENT DATE AND TIME: ${userLocaleTime} (in ${timezone})
(Use this to resolve relative dates like "tomorrow" or "next Tuesday". Crucially, all dates and times you discuss with the user are in the user's timezone: ${timezone})

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledge_base}

YOUR GOALS:
1. Warmly answer the user's questions relying strictly on the business details above.
2. ${leadCollectionInstruction}
${calendarInstruction}
4. HUMAN HANDOFF & SUPPORT: If the user wishes or asks to talk to or connect with/contact support, a human, an agent, or a real person, you must respond with exactly the following handoff text and nothing else: "${widgetConfig.handoffText || 'I can connect you with the team for this.'}".
5. Keep answers short (1-2 sentences max).
6. User should feel like he/she is talking to an actual call center guy.
7. Do not answer if user attempts to ask anything off the topic not related to the business.
8. Ask 1 question at a time.
CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per call. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.
- BOOKING ORDER: Never call book_appointment in the same turn as check_availability. After checking availability, speak the available options and ask "Would you like me to book one of these?" Wait for the user's next confirmation before booking.
- SLOT RULE: Never invent a slot and never book a time that was not returned by check_availability. If the user's requested time is not in the returned slots, offer the returned alternatives instead.
- TEXT INPUT FOR CONTACT: Voice recognition for phone numbers and emails is highly inaccurate. Whenever you need to ask the user for their phone number or email address, you MUST tell them to type it in the chat box, and simultaneously call the \`request_text_input\` tool. Do not try to collect it via voice.
- TOOL TIMEZONE: When calling check_availability, pass the local date format 'YYYY-MM-DD'. When calling book_appointment, construct the startTime and endTime in ISO 8601 format using the user's local offset ${tzOffset} (e.g. if the user selects 8:30 AM on 2026-06-17, startTime must be '2026-06-17T08:30:00${tzOffset}').
- CALL ENDING: ${LIVE_END_CALL_INSTRUCTION}`;

      const setupMessage = {
        setup: {
          model: 'models/gemini-3.1-flash-live-preview', // Model string required in setup for Live API
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: "Leto" // Choose a nice voice: Puck, Aoede, Charon, Kore, Fenrir, Leto
                }
              }
            }
          },
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          input_audio_transcription: {},
          tools: [{
            function_declarations: buildLiveFunctionDeclarations(bookAppointmentRequired, widgetConfig.enableCalendar)
          }]
        }
      };

      geminiWs.send(JSON.stringify(setupMessage));
      setupSent = true;
    });

    // 3. Handle messages from Gemini
    geminiWs.on('message', async (data: Buffer) => {
      const response = JSON.parse(data.toString());
      inputTranscript.accept(response);

      if (response.setupComplete || response.setup_complete) {
        console.log('Gemini Live API Setup Complete. Triggering initial greeting...');
        if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: "Hello! I am on the line. Please greet me and welcome me to the business." }]
              }],
              turnComplete: true
            }
          }));
        }
        return;
      }

      if (response.serverContent) {
        // Forward audio chunks to the client
        const interrupted = response.serverContent.interrupted;
        if (interrupted) {
          ws.send(JSON.stringify({ type: 'interrupted' }));
          return;
        }

        const modelTurn = response.serverContent.modelTurn;
        if (modelTurn) {
          for (const part of modelTurn.parts) {
            if (part.inlineData && part.inlineData.data) {
              // Send the base64 audio chunk to the client
              ws.send(JSON.stringify({
                type: 'audio',
                data: part.inlineData.data
              }));
            }
            if (part.text) {
              accumulatedBotText += part.text;
              // Send the text transcript of the bot's reply
              ws.send(JSON.stringify({
                type: 'transcript',
                sender: 'bot',
                text: part.text
              }));
            }
          }
        }

        if (response.serverContent.turnComplete && accumulatedBotText.trim()) {
          try {
            await supabase.from('messages').insert({
              session_id: sessionId,
              sender: 'bot',
              content: accumulatedBotText.trim()
            });
          } catch (err) {
            console.error('Error saving bot message:', err);
          }
          accumulatedBotText = '';
        }

        if (response.serverContent.turnComplete) {
          await persistPendingUserTranscript();
          sendAssistantHangup();
        }
      }

      if (response.toolCall) {
        // Handle tool calls securely on the backend
        console.log('Gemini Tool Call:', response.toolCall);
        const functionResponses: any[] = [];
        let checkedAvailabilityThisToolTurn = false;

        for (const call of response.toolCall.functionCalls) {
          const { name, args, id } = call;
          let functionResponse: any = {};

          try {
            if (name === 'check_availability') {
              const slots = await checkCalendarAvailability({
                db: supabase,
                ownerId: bot.owner_id,
                date: args.date,
                timezone,
              });
              functionResponse = { slots };
              checkedAvailabilityThisToolTurn = true;

              if (functionResponse.slots) {
                const slotsStr = functionResponse.slots
                  .map((s: any) => new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
                  .join(', ');

                await supabase.from('messages').insert([
                  { session_id: sessionId, sender: 'user', content: `Please check availability for ${args.date}.` },
                  { session_id: sessionId, sender: 'bot', content: `Checking availability... The available slots for ${args.date} are: ${slotsStr || 'None'}.` }
                ]);
              }
            } else if (name === 'book_appointment') {
              if (checkedAvailabilityThisToolTurn) {
                functionResponse = {
                  error: 'Do not book immediately after checking availability. Present the returned slots to the user and wait for explicit confirmation in the next user turn.'
                };
                functionResponses.push({
                  id: id,
                  name: name,
                  response: functionResponse
                });
                continue;
              }

              functionResponse = await bookCalendarAppointment({
                db: supabase,
                details: args,
                ownerId: bot.owner_id,
                botId: bot.id,
                sessionId,
                timezone,
              });
              if (functionResponse.success) {
                await supabase.from('messages').insert([
                  { session_id: sessionId, sender: 'user', content: `I'd like to book an appointment: "${args.title}" for ${args.visitorName} (Phone: ${args.visitorPhone}) starting at ${args.startTime}.` },
                  { session_id: sessionId, sender: 'bot', content: `Appointment Confirmed. Booked for ${new Date(args.startTime).toLocaleDateString()} at ${new Date(args.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` }
                ]);

                ws.send(JSON.stringify({
                  type: 'appointment_booked',
                  details: args
                }));
              }
            } else if (name === 'request_text_input') {
              ws.send(JSON.stringify({
                type: 'request_input',
                field: args.field
              }));
              functionResponse = { success: true, message: `Text input for ${args.field} requested from user.` };
            } else if (name === 'end_call') {
              pendingAssistantHangup = {
                reason: args.reason || 'Call completed'
              };
              clearAssistantHangupTimeout();
              assistantHangupTimeout = setTimeout(() => {
                sendAssistantHangup();
              }, 5000);
              functionResponse = {
                success: true,
                message: 'Call end confirmed. Say "have a Great day" and the system will disconnect the line.'
              };
            }
          } catch (err: any) {
            console.error(`Error executing ${name}:`, err);
            functionResponse = serializeCalendarToolError(err);
          }

          functionResponses.push({
            id: id,
            name: name,
            response: functionResponse
          });
        }

        // Send tool responses back to Gemini
        geminiWs.send(JSON.stringify({
          toolResponse: {
            functionResponses: functionResponses
          }
        }));
      }
    });

    geminiWs.on('error', (err) => {
      console.error('Gemini WS Error:', err);
      clearAssistantHangupTimeout();
      ws.close(1011, 'Gemini WS Error');
    });

    geminiWs.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'None';
      console.log(`Gemini WS Closed. Code: ${code}, Reason: ${reasonStr}`);
      clearAssistantHangupTimeout();
      ws.close(1000, `Gemini WS Closed: ${reasonStr}`.slice(0, 100));
    });

    // 4. Handle messages from Client
    ws.on('message', (data: Buffer) => {
      if (!setupSent || geminiWs.readyState !== WebSocket.OPEN) {
        return;
      }
      const message = JSON.parse(data.toString());

      if (message.type === 'realtimeInput') {
        // Forward client audio chunks to Gemini using the non-deprecated audio format
        geminiWs.send(JSON.stringify({
          realtime_input: {
            audio: {
              mime_type: 'audio/pcm;rate=16000',
              data: message.data // base64 string
            }
          }
        }));
      } else if (message.type === 'textInput') {
        // Forward client text input directly to Gemini
        geminiWs.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: message.data }]
            }],
            turnComplete: true
          }
        }));
      }

      if (message.type === 'clientContent' && geminiWs.readyState === WebSocket.OPEN) {
        // Forward text messages if any
        geminiWs.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: message.text }]
            }],
            turnComplete: true
          }
        }));
      }
    });

    // ── GeminiGuard: hard session timeout (9 min) ────────────────────────────
    geminiGuard.registerSessionTimeout(sessionId, () => {
      console.warn(`[GeminiGuard] Force-closing session ${sessionId} after max duration.`);
      ws.close(1001, 'Session duration limit reached.');
    });

    ws.on('close', async () => {
      console.log('Client disconnected from Live API proxy');
      clearAssistantHangupTimeout();
      // ── GeminiGuard: release slot → wakes next queued caller ─────────────
      geminiGuard.releaseSession(sessionId);

      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }

      // Save any pending bot transcripts
      if (accumulatedBotText.trim()) {
        try {
          await supabase.from('messages').insert({
            session_id: sessionId,
            sender: 'bot',
            content: accumulatedBotText.trim()
          });
        } catch (err) {
          console.error('Error saving final bot message:', err);
        }
      }

      // Save any final user transcription received before disconnect.
      await persistPendingUserTranscript();

      // Run lead analysis asynchronously when the call finishes
      try {
        const { data: dbMessages } = await supabase
          .from('messages')
          .select('sender, content')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true });

        if (dbMessages && dbMessages.length > 0) {
          const transcript = dbMessages
            .map((m: any) => `${m.sender === 'user' ? 'Visitor' : 'Receptionist'}: ${m.content}`)
            .join('\n');

          await analyzeLead({ sessionId, botId: bot.id, transcript }, supabase);
          console.log(`Lead analysis completed successfully for session ${sessionId}`);
        }
      } catch (err) {
        console.error('Error running lead analysis at session close:', err);
      }
    });
  });
}
