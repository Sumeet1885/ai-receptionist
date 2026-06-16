import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
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
2. Naturally and conversationally collect: Full Name, Contact Phone Number, Specific interest, and Budget.
3. If the user wants to book an appointment, use the check_availability tool for their requested date, then use the book_appointment tool once they agree to a slot.
4. Keep answers short (1-2 sentences max).
5. User should feel like he/she is talking to an actual call center guy.
6. Do not answer if user attempts to ask anything off the topic not related to the business.

CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per call. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.
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

      // Trigger the agent to speak first
      setTimeout(() => {
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
      }, 500);
    });

    // 3. Handle messages from Gemini
    geminiWs.on('message', async (data: Buffer) => {
      const response = JSON.parse(data.toString());

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
              // Send the text transcript of the bot's reply
              ws.send(JSON.stringify({
                type: 'transcript',
                sender: 'bot',
                text: part.text
              }));
            }
          }
        }
      }

      if (response.toolCall) {
        // Handle tool calls securely on the backend
        console.log('Gemini Tool Call:', response.toolCall);
        const EXPRESS_SERVER_URL = process.env.EXPRESS_SERVER_URL || `http://localhost:${config.port}`;
        
        const functionResponses: any[] = [];

        for (const call of response.toolCall.functionCalls) {
          const { name, args, id } = call;
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
                  sessionId: sessionId 
                })
              });
              functionResponse = await res.json();
              if (functionResponse.success) {
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

    ws.on('close', () => {
      console.log('Client disconnected from Live API proxy');
      if (geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.close();
      }
    });
  });
}
