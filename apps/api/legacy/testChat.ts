import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testChat() {
  console.log('Fetching a bot...');
  const { data: bot } = await supabase.from('bots').select('id, owner_id').limit(1).single();
  if (!bot) {
    console.error('No bot found!');
    return;
  }

  console.log('Creating a session...');
  const { data: session, error: sessionErr } = await supabase
    .from('chat_sessions')
    .insert([{ bot_id: bot.id, visitor_id: 'test-visitor' }])
    .select('id')
    .single();

  if (sessionErr || !session) {
    console.error('Failed to create session:', sessionErr);
    return;
  }
  console.log('Session ID:', session.id);

  console.log('Testing chat reply API...');
  try {
    const res = await fetch('http://localhost:4000/api/chat/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, userMessage: 'Hello, what services do you offer?' })
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Data:', data);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testChat();
