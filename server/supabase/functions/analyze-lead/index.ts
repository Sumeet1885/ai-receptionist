// @ts-nocheck
// Supabase Edge Function — analyze-lead
// Runtime: Deno
// POST /functions/v1/analyze-lead
// Body: { sessionId: string, botId: string, transcript: string }
// This function is called internally by chat-reply (non-blocking).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { analyzeLead } from '../../../src/controllers/leadController.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sessionId, botId, transcript } = await req.json();

    if (!sessionId || !botId || !transcript) {
      return new Response(
        JSON.stringify({ error: 'sessionId, botId, and transcript are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delegate to leadController — calls Gemini + upserts leads table
    await analyzeLead({ sessionId, botId, transcript }, supabase);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('analyze-lead error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
