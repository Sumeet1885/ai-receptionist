// @ts-nocheck
// Supabase Edge Function — chat-reply
// Runtime: Deno
// POST /functions/v1/chat-reply
// Body: { sessionId: string, userMessage: string }

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleChat } from '../../../src/controllers/chatController.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sessionId, userMessage } = await req.json();

    if (!sessionId || !userMessage) {
      return new Response(
        JSON.stringify({ error: 'sessionId and userMessage are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client using service role key (server-side only)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Resolve session → get bot_id
    const { data: session, error: sessionErr } = await supabase
      .from('chat_sessions')
      .select('bot_id')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch bot configuration
    const { data: bot, error: botErr } = await supabase
      .from('bots')
      .select('*')
      .eq('id', session.bot_id)
      .single();

    if (botErr || !bot) {
      return new Response(
        JSON.stringify({ error: 'Bot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Fetch last 20 messages (conversation history window)
    const { data: messages } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    const history = (messages ?? []).map((m: any) => ({
      id: m.created_at,
      sender: m.sender,
      text: m.content,
      timestamp: m.created_at
    }));

    // 4. Call chat controller (builds prompt, calls Gemini)
    const { reply } = await handleChat({
      bot,
      history: messages || [],
      userMessage,
      sessionId
    }, supabase);

    // 5. Persist user message + bot reply to messages table
    await supabase.from('messages').insert([
      { session_id: sessionId, sender: 'user',  content: userMessage },
      { session_id: sessionId, sender: 'bot',   content: reply }
    ]);

    // 6. Fire lead analysis in background (non-blocking)
    const transcript = [...history, { sender: 'user', text: userMessage }, { sender: 'bot', text: reply }]
      .map(m => `${m.sender === 'user' ? 'Visitor' : 'Receptionist'}: ${m.text}`)
      .join('\n');

    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ sessionId, botId: session.bot_id, transcript })
      })
    );

    // 7. Return reply to browser
    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('chat-reply error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
