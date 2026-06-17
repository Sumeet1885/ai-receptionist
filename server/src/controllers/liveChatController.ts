import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { analyzeLead } from './leadController';
import { geminiGuard } from '../services/geminiGuard';
import WebSocket from 'ws';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  realtime: { transport: WebSocket },
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

    // ── GeminiGuard: acquire a concurrent session slot ────────────────────────
    // Blocks (queues) if all 3 slots are occupied; rejects after 30 s.
    try {
      await geminiGuard.acquireSession(sessionId);
    } catch (reason) {
      console.warn(`[GeminiGuard] Session rejected (${sessionId}): ${reason}`);
      ws.close(1013, 'All AI receptionist lines are busy. Please try again shortly.');
      return;
    }

    // 1. Fetch Bot Configuration
    const { data: bot } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .single();

    if (!bot) {
      ws.close(1008, 'Bot not found');
      return;
    }

    // Helper to compute client timezone offset string, e.g. "+05:30" or "-08:00"
    const getTzOffsetStr = (tz: string) => {
      try {
        const d = new Date();
        const tzString = d.toLocaleString('en-US', { timeZone: tz });
        const tzDate = new Date(tzString);
        // Calculate difference in minutes
        const diffMin = Math.round((tzDate.getTime() - d.getTime()) / 60000);
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

    geminiWs.on('open', () => {
      console.log('Connected to Gemini Live API');
      
      const userLocaleTime = new Date().toLocaleString('en-US', { timeZone: timezone });
      const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.business_name}" (${bot.industry} sector).

CURRENT TIMEZONE: ${timezone}
CURRENT DATE AND TIME: ${userLocaleTime} (in ${timezone})
(Use this to resolve relative dates like "tomorrow" or "next Tuesday". Crucially, all dates and times you discuss with the user are in the user's timezone: ${timezone})

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
4. Keep answers short (1-2 sentences max).
5. User should feel like he/she is talking to an actual call center guy.
6. Do not answer if user attempts to ask anything off the topic not related to the business.

CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per call. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.
- BOOKING ORDER: Never call book_appointment in the same turn as check_availability. After checking availability, speak the available options and ask "Would you like me to book one of these?" Wait for the user's next confirmation before booking.
- SLOT RULE: Never invent a slot and never book a time that was not returned by check_availability. If the user's requested time is not in the returned slots, offer the returned alternatives instead.
- TOOL TIMEZONE: When calling check_availability, pass the local date format 'YYYY-MM-DD'. When calling book_appointment, construct the startTime and endTime in ISO 8601 format using the user's local offset ${tzOffset} (e.g. if the user selects 8:30 AM on 2026-06-17, startTime must be '2026-06-17T08:30:00${tzOffset}').`;

      const setupMessage = {
        setup: {
          model: 'models/gemini-3.1-flash-live-preview', // Model string required in setup for Live API
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: "Aoede" // Choose a nice voice: Puck, Aoede, Charon, Kore, Fenrir, Leto
                }
              }
            }
          },
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          tools: [{
            function_declarations: [
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
                  required: ['title', 'visitorName', 'visitorPhone', 'startTime', 'endTime']
                }
              }
            ]
          }]
        }
      };

      geminiWs.send(JSON.stringify(setupMessage));
      setupSent = true;
    });

    // 3. Handle messages from Gemini
    geminiWs.on('message', async (data: Buffer) => {
      const response = JSON.parse(data.toString());

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
      }

      if (response.toolCall) {
        // Handle tool calls securely on the backend
        console.log('Gemini Tool Call:', response.toolCall);
        const EXPRESS_SERVER_URL = process.env.EXPRESS_SERVER_URL || `http://localhost:${config.port}`;
        
        const functionResponses: any[] = [];
        let checkedAvailabilityThisToolTurn = false;

        for (const call of response.toolCall.functionCalls) {
          const { name, args, id } = call;
          let functionResponse: any = {};

          try {
            if (name === 'check_availability') {
              const res = await fetch(`${EXPRESS_SERVER_URL}/api/calendar/availability?date=${args.date}&ownerId=${bot.owner_id}`);
              functionResponse = await res.json();
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

              const res = await fetch(`${EXPRESS_SERVER_URL}/api/calendar/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  details: args, 
                  ownerId: bot.owner_id, 
                  botId: bot.id, 
                  sessionId: sessionId 
                })
              });
              functionResponse = await res.json();
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
            }
          } catch (err: any) {
            console.error(`Error executing ${name}:`, err);
            functionResponse = { error: err.message };
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
      ws.close(1011, 'Gemini WS Error');
    });

    geminiWs.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'None';
      console.log(`Gemini WS Closed. Code: ${code}, Reason: ${reasonStr}`);
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
