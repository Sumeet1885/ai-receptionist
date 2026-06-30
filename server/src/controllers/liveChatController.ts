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
import {
  buildLiveFunctionDeclarations,
  LIVE_END_CALL_INSTRUCTION,
  LIVE_FORCE_END_SIGNAL,
  LIVE_WRAP_WARNING_SIGNAL
} from '../services/liveTools';
import {
  buildBusinessPersona,
  buildToolBasedBookingInstruction,
  buildVerbalHandoffBookingInstruction,
  buildWebVoiceExtraConstraints,
} from '../modules/phone-calls/receptionistInstruction';
import {
  applyVerifiedContactDetails,
  canForwardLiveModelOutput,
  getLiveBookingContactError,
  inferContactFieldRequestedByAssistantText,
  LiveContactCollection,
  seedVerifiedContactInputs,
  submitLiveContactForTool,
  type PendingContactToolCall,
  type ContactField
} from '../utils/contactValidation';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: wsTransport },
});
const GEMINI_API_KEY = config.geminiApiKey ?? '';

// We use the Gemini Live API model which supports bidirectional WebSockets
const LIVE_API_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY || config.geminiApiKey}`;
const PROACTIVE_CONTACT_TOOL_GRACE_MS = 350;

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/chat/live' });

  wss.on('connection', async (ws: WebSocket, req) => {
    console.log('Client connected to Live API proxy');

    // Parse URL parameters for botId and sessionId
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const botId = url.searchParams.get('botId');
    const sessionId = url.searchParams.get('sessionId');
    const preverifiedContactsParam = url.searchParams.get('preverifiedContacts');

    const timezone = url.searchParams.get('timezone') || 'IST';
    let preverifiedContacts: Partial<Record<ContactField, unknown>> = {};
    if (preverifiedContactsParam) {
      try {
        const parsed = JSON.parse(preverifiedContactsParam);
        if (parsed && typeof parsed === 'object') {
          preverifiedContacts = {
            phone: (parsed as Record<string, unknown>).phone,
            email: (parsed as Record<string, unknown>).email,
          };
        }
      } catch {
        preverifiedContacts = {};
      }
    }

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
    const contactCollection = new LiveContactCollection();
    let pendingContactToolCall: PendingContactToolCall | null = null;
    let pendingFunctionResponses: any[] = [];
    let requiredContactFields: ContactField[] = [];
    let seededContactFields: ContactField[] = [];
    let pendingAssistantHangup: { reason: string } | null = null;
    let assistantHangupTimeout: NodeJS.Timeout | null = null;
    let forcedShutdownTimeout: NodeJS.Timeout | null = null;
    let proactiveContactInputTimer: NodeJS.Timeout | null = null;

    const clearAssistantHangupTimeout = () => {
      if (assistantHangupTimeout) {
        clearTimeout(assistantHangupTimeout);
        assistantHangupTimeout = null;
      }
    };

    const clearForcedShutdownTimeout = () => {
      if (forcedShutdownTimeout) {
        clearTimeout(forcedShutdownTimeout);
        forcedShutdownTimeout = null;
      }
    };

    const clearProactiveContactInputTimer = () => {
      if (proactiveContactInputTimer) {
        clearTimeout(proactiveContactInputTimer);
        proactiveContactInputTimer = null;
      }
    };

    const scheduleContactInputAfterAssistantPrompt = (assistantText: string) => {
      const requestedField = inferContactFieldRequestedByAssistantText(
        assistantText,
        requiredContactFields,
        contactCollection
      );
      if (!requestedField || pendingContactToolCall || contactCollection.pendingField) return;

      clearProactiveContactInputTimer();
      proactiveContactInputTimer = setTimeout(() => {
        proactiveContactInputTimer = null;
        if (pendingContactToolCall || contactCollection.pendingField) return;

        const requestResult = contactCollection.request(requestedField);
        if (!requestResult.accepted) return;
        if (ws.readyState !== WebSocket.OPEN) return;

        ws.send(JSON.stringify({
          type: 'request_input',
          field: requestedField
        }));
      }, PROACTIVE_CONTACT_TOOL_GRACE_MS);
    };

    const sendInternalSignal = (signal: string) => {
      if (geminiWs.readyState !== WebSocket.OPEN) return;
      geminiWs.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: signal }]
          }],
          turnComplete: true
        }
      }));
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

      const widgetConfig = mergeWidgetConfig(bot.widget_config, bot);
      const fieldsToCollect = widgetConfig.requiredLeadFields || [];
      requiredContactFields = fieldsToCollect.filter(
        (field): field is ContactField => field === 'phone' || field === 'email'
      );
      const seededContacts = seedVerifiedContactInputs(contactCollection, preverifiedContacts);
      seededContactFields = Object.keys(seededContacts.seeded) as ContactField[];
      const missingContactFields = requiredContactFields.filter(field => !contactCollection.getVerified(field));
      const bookAppointmentRequired = ['title', 'startTime', 'endTime'];
      if (fieldsToCollect.includes('name')) {
        bookAppointmentRequired.push('visitorName');
      }
      if (missingContactFields.includes('phone')) {
        bookAppointmentRequired.push('visitorPhone');
      }
      if (missingContactFields.includes('email')) {
        bookAppointmentRequired.push('visitorEmail');
      }

      const bookingInstruction = widgetConfig.enableCalendar
        ? buildToolBasedBookingInstruction()
        : buildVerbalHandoffBookingInstruction();

      const extraConstraints = buildWebVoiceExtraConstraints({
        requiredContactFields: missingContactFields,
        tzOffset,
        endCallInstruction: LIVE_END_CALL_INSTRUCTION,
        wrapWarningSignal: LIVE_WRAP_WARNING_SIGNAL,
        forceEndSignal: LIVE_FORCE_END_SIGNAL,
      });

      const systemInstruction = buildBusinessPersona(bot, widgetConfig, {
        timezone,
        bookingInstruction,
        extraConstraints,
      });

      const setupMessage = {
        setup: {
          model: 'models/gemini-3.1-flash-live-preview', // Model string required in setup for Live API
          generation_config: {
            response_modalities: ["AUDIO"],
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
          const preverifiedContext = seededContactFields.length > 0
            ? `Server-verified visitor contact fields already collected before this call: ${seededContactFields.join(', ')}. Do not ask for these fields again; the backend will attach them when booking. Start by briefly acknowledging that the details were received, for example: "Great, I have your details. I can help with that."`
            : '';
          geminiWs.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [
                  ...(preverifiedContext ? [{ text: preverifiedContext }] : []),
                  { text: "Hello! I am on the line. Please greet me and welcome me to the business." }
                ]
              }],
              turnComplete: true
            }
          }));
        }
        return;
      }

      if (
        response.serverContent
        && canForwardLiveModelOutput(contactCollection, pendingContactToolCall)
      ) {
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
          const completedAssistantText = accumulatedBotText.trim();
          try {
            await supabase.from('messages').insert({
              session_id: sessionId,
              sender: 'bot',
              content: completedAssistantText
            });
          } catch (err) {
            console.error('Error saving bot message:', err);
          }
          scheduleContactInputAfterAssistantPrompt(completedAssistantText);
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
        let requestedTextInputThisToolTurn = false;
        const batchRequestsContactInput = response.toolCall.functionCalls.some(
          (call: any) => call.name === 'request_text_input'
        );
        if (batchRequestsContactInput) {
          clearProactiveContactInputTimer();
        }
        let deferEntireBatch = false;
        let pendingContactToolCallTemp: any = null;

        for (const call of response.toolCall.functionCalls) {
          const { name, args, id } = call;
          let functionResponse: any = {};
          let deferFunctionResponse = false;

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

              const contactGateError = getLiveBookingContactError(
                contactCollection,
                requiredContactFields,
                batchRequestsContactInput
              );
              if (contactGateError) {
                functionResponse = { error: contactGateError };
                functionResponses.push({ id, name, response: functionResponse });
                continue;
              }

              const bookingDetails = applyVerifiedContactDetails(contactCollection, args);
              functionResponse = await bookCalendarAppointment({
                db: supabase,
                details: bookingDetails,
                ownerId: bot.owner_id,
                botId: bot.id,
                sessionId,
                timezone,
              });
              if (functionResponse.success) {
                await supabase.from('messages').insert([
                  { session_id: sessionId, sender: 'user', content: `I'd like to book an appointment: "${bookingDetails.title}" for ${bookingDetails.visitorName} (Phone: ${bookingDetails.visitorPhone}) starting at ${bookingDetails.startTime}.` },
                  { session_id: sessionId, sender: 'bot', content: `Appointment Confirmed. Booked for ${new Date(bookingDetails.startTime).toLocaleDateString()} at ${new Date(bookingDetails.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` }
                ]);

                ws.send(JSON.stringify({
                  type: 'appointment_booked',
                  details: bookingDetails
                }));
              }
            } else if (name === 'request_text_input') {
              if (requestedTextInputThisToolTurn) {
                functionResponse = {
                  error: 'Request only one typed contact field at a time. Wait for the user to submit that validated field before requesting another.'
                };
                functionResponses.push({
                  id: id,
                  name: name,
                  response: functionResponse
                });
                continue;
              }

              const requestedField: ContactField | null =
                args.field === 'phone' || args.field === 'email' ? args.field : null;
              if (!requestedField) {
                functionResponse = { error: 'field must be either phone or email' };
                functionResponses.push({ id, name, response: functionResponse });
                continue;
              }

              const requestResult = contactCollection.request(requestedField);
              if (!requestResult.accepted) {
                if (
                  contactCollection.pendingField === requestedField
                  && !pendingContactToolCall
                ) {
                  pendingContactToolCallTemp = { id, name, field: requestedField };
                  requestedTextInputThisToolTurn = true;
                  deferEntireBatch = true;
                  deferFunctionResponse = true;
                  continue;
                }

                const verifiedValue = contactCollection.getVerified(requestedField);
                if (verifiedValue) {
                  functionResponse = {
                    success: true,
                    verified: true,
                    field: requestedField,
                    value: verifiedValue
                  };
                  functionResponses.push({ id, name, response: functionResponse });
                  continue;
                }

                functionResponse = { error: requestResult.error };
                functionResponses.push({ id, name, response: functionResponse });
                continue;
              }

              pendingContactToolCallTemp = { id, name, field: requestedField };
              requestedTextInputThisToolTurn = true;
              // Gemini is instructed to speak its own short redirect sentence in this same
              // turn before calling this tool - don't interrupt/clear that audio or it gets
              // cut off right as the box appears. The box (and the client's mic-mute, which
              // fires the instant request_input is received) still open immediately.
              ws.send(JSON.stringify({
                type: 'request_input',
                field: requestedField
              }));
              deferEntireBatch = true;
              deferFunctionResponse = true;
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

          if (!deferFunctionResponse) {
            functionResponses.push({
              id: id,
              name: name,
              response: functionResponse
            });
          }
        }

        // Send tool responses back to Gemini
        if (deferEntireBatch) {
          pendingFunctionResponses = functionResponses;
          pendingContactToolCall = pendingContactToolCallTemp;
        } else if (functionResponses.length > 0) {
          geminiWs.send(JSON.stringify({
            toolResponse: {
              functionResponses: functionResponses
            }
          }));
        }
      }
    });

    geminiWs.on('error', (err) => {
      console.error('Gemini WS Error:', err);
      clearAssistantHangupTimeout();
      clearForcedShutdownTimeout();
      clearProactiveContactInputTimer();
      ws.close(1011, 'Gemini WS Error');
    });

    geminiWs.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'None';
      console.log(`Gemini WS Closed. Code: ${code}, Reason: ${reasonStr}`);
      clearAssistantHangupTimeout();
      clearForcedShutdownTimeout();
      clearProactiveContactInputTimer();
      ws.close(1000, `Gemini WS Closed: ${reasonStr}`.slice(0, 100));
    });

    // 4. Handle messages from Client
    ws.on('message', async (data: Buffer) => {
      if (!setupSent || geminiWs.readyState !== WebSocket.OPEN) {
        return;
      }
      const message = JSON.parse(data.toString());

      if (
        (contactCollection.pendingField || pendingContactToolCall)
        && message.type !== 'textInput'
      ) {
        return;
      }

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
        const submittedField: ContactField | null =
          message.field === 'phone' || message.field === 'email' ? message.field : null;

        const submission = pendingContactToolCall
          ? submitLiveContactForTool(
            contactCollection,
            pendingContactToolCall,
            submittedField,
            String(message.data || '')
          )
          : contactCollection.submit(submittedField, String(message.data || ''));

        if (!submission.accepted) {
          ws.send(JSON.stringify({
            type: 'input_validation_error',
            field: contactCollection.pendingField ?? submittedField,
            message: submission.error
          }));
          return;
        }

        const { error: contactSaveError } = await supabase.from('messages').insert({
          session_id: sessionId,
          sender: 'user',
          content: `Verified typed ${submission.field}: ${submission.value}`
        });
        if (contactSaveError) {
          console.error('Error saving verified contact input:', contactSaveError);
        }

        ws.send(JSON.stringify({
          type: 'input_validation_success',
          field: submission.field
        }));

        if (pendingContactToolCall) {
          const completedToolCall = pendingContactToolCall;

          const responseIdx = pendingFunctionResponses.findIndex(r => r.id === completedToolCall.id);
          if (responseIdx !== -1) {
              pendingFunctionResponses[responseIdx].response = {
                  success: true,
                  verified: true,
                  field: submission.field,
                  value: submission.value
              };
          } else {
              pendingFunctionResponses.push({
                  id: completedToolCall.id,
                  name: completedToolCall.name,
                  response: {
                      success: true,
                      verified: true,
                      field: submission.field,
                      value: submission.value
                  }
              });
          }

          geminiWs.send(JSON.stringify({
            toolResponse: {
              functionResponses: pendingFunctionResponses
            }
          }));
          pendingFunctionResponses = [];
          pendingContactToolCall = null;
          return;
        }

        geminiWs.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{
                text: `Server-verified typed ${submission.field}: ${submission.value}. Continue the booking flow without asking for that field again.`
              }]
            }],
            turnComplete: true
          }
        }));

        return;
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
    geminiGuard.registerSessionLifecycle(
      sessionId,
      () => {
        console.warn(`[GeminiGuard] Sending wrap warning for session ${sessionId}.`);
        sendInternalSignal(LIVE_WRAP_WARNING_SIGNAL);
      },
      () => {
        console.warn(`[GeminiGuard] Triggering final call-end sequence for session ${sessionId}.`);
        sendInternalSignal(LIVE_FORCE_END_SIGNAL);
        clearForcedShutdownTimeout();
        forcedShutdownTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(1001, 'Session duration limit reached.');
          }
        }, 8000);
      }
    );

    ws.on('close', async () => {
      console.log('Client disconnected from Live API proxy');
      clearAssistantHangupTimeout();
      clearForcedShutdownTimeout();
      clearProactiveContactInputTimer();
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

          await analyzeLead({ sessionId, botId: bot.id, transcript, knownEmail: contactCollection.getVerified('email') || undefined }, supabase);
          console.log(`Lead analysis completed successfully for session ${sessionId}`);
        }
      } catch (err) {
        console.error('Error running lead analysis at session close:', err);
      }
    });
  });
}
